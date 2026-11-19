import type { MetricsEvent } from "./events.js";
import type { JournalRead } from "./journal.js";

export type ReportCoverage = {
  source_id: string;
  event_types: readonly string[];
  from: string;
  through: string;
  status: "complete" | "not_applicable";
};

type Coverage = "complete" | "partial" | "unavailable" | "not_applicable";
type Measurement = { status: Coverage; value: number | null; lower_bound?: true; upper_bound?: true };
type Time = { value: number; estimated: boolean };
type Span = { start: number; end: number; estimated: boolean };
type Window = { start: Time | null; end: Time | null; through: number; open: boolean };
type Facts = { rows: MetricsEvent[]; issues: number };
type Identify = (event: MetricsEvent) => string | null;
type ReadCoverage = (
  types: readonly string[], from: number | null, through: number, evidence: boolean, incomplete?: boolean,
) => Coverage;

const hour = 60 * 60 * 1000;
const attributionTypes = [
  "model.usage", "context.compacted", "task.state_changed", "permission.review_started", "permission.review_finished",
];
const activityTypes = ["operator", "agent", "machine"] as const;
const testTypes = ["test.started", "test.finished"] as const;
const usageTypes = ["model.usage"] as const;
const tokenFields = [
  "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens",
] as const;

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function time(event: MetricsEvent | undefined): Time | null {
  if (!event) return null;
  const occurred = timestamp(event.occurred_at);
  return { value: occurred ?? Date.parse(event.observed_at), estimated: occurred === null };
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function str(event: MetricsEvent | undefined, field: string): string | null {
  const value = event?.data[field];
  return typeof value === "string" ? value : null;
}

function num(event: MetricsEvent | undefined, field: string): number | null {
  const value = event?.data[field];
  return typeof value === "number" ? value : null;
}

function key(...parts: (string | number | null)[]): string | null {
  return parts.some(part => part === null) ? null : JSON.stringify(parts);
}

function byFields(...fields: string[]) {
  return (event: MetricsEvent) => key(...fields.map(field => str(event, field) ?? num(event, field)));
}

function rowsOf(events: readonly MetricsEvent[], ...types: string[]): MetricsEvent[] {
  return events.filter(event => types.includes(event.event_type));
}

function indexBy(events: readonly MetricsEvent[], identify: Identify) {
  const groups = new Map<string, MetricsEvent[]>();
  for (const event of events) {
    const id = identify(event);
    if (id === null) continue;
    const group = groups.get(id) ?? [];
    group.push(event);
    groups.set(id, group);
  }
  return groups;
}

// A duplicate may complete a previously missing field. Conflicting evidence
// cannot establish a value, even when a later duplicate repeats one variant.
function reconcile(rows: readonly MetricsEvent[], identify: Identify): Facts {
  const groups = new Map<string, MetricsEvent | null>();
  let issues = 0;
  for (const row of rows) {
    const id = identify(row);
    if (id === null) {
      issues++;
      continue;
    }
    const prior = groups.get(id);
    if (prior === null) continue;
    if (prior === undefined) {
      groups.set(id, row);
      continue;
    }
    const conflicts = prior.event_type !== row.event_type || prior.project_id !== row.project_id ||
      (prior.task_id !== null && row.task_id !== null && prior.task_id !== row.task_id) ||
      (prior.occurred_at !== null && row.occurred_at !== null &&
        timestamp(prior.occurred_at) !== timestamp(row.occurred_at)) ||
      Object.entries(row.data).some(([name, value]) =>
        value !== null && prior.data[name] != null && prior.data[name] !== value);
    if (conflicts) {
      groups.set(id, null);
      issues++;
      continue;
    }
    const data = { ...prior.data };
    for (const [name, value] of Object.entries(row.data)) {
      data[name] ??= value;
    }
    groups.set(id, {
      ...prior, data, task_id: prior.task_id ?? row.task_id,
      occurred_at: prior.occurred_at ?? row.occurred_at,
      observed_at: Date.parse(prior.observed_at) <= Date.parse(row.observed_at) ? prior.observed_at : row.observed_at,
    });
  }
  return { rows: [...groups.values()].filter(row => row !== null), issues };
}

function measurement(value: number, status: Coverage, estimated = false): Measurement {
  if (status === "complete") return { status, value };
  if (value <= 0) return { status, value: null };
  return estimated ? { status: "partial", value } : { status: "partial", value, lower_bound: true };
}

function union(spans: readonly Span[]): number {
  let total = 0;
  let end = -Infinity;
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
    total += Math.max(0, span.end - Math.max(span.start, end));
    end = Math.max(end, span.end);
  }
  return total;
}

function clip(span: Span, window: Window): Span | null {
  if (window.start === null) return null;
  const start = Math.max(span.start, window.start.value);
  const end = Math.min(span.end, window.through);
  return start < end ? { ...span, start, end } : null;
}

function spanBetween(start: Time | null, end: Time | null): Span | null {
  if (start === null || end === null || end.value < start.value) return null;
  return { start: start.value, end: end.value, estimated: start.estimated || end.estimated };
}

function paired(events: readonly MetricsEvent[], types: readonly string[], identify: Identify) {
  const facts = types.map(type => reconcile(rowsOf(events, type), identify));
  const pairs = new Map<string, (MetricsEvent | undefined)[]>();
  for (const [index, { rows }] of facts.entries()) {
    for (const row of rows) {
      const id = identify(row)!; // Reconciliation has rejected missing identities.
      const pair = pairs.get(id) ?? [];
      pair[index] = row;
      pairs.set(id, pair);
    }
  }
  return { pairs: [...pairs.values()], issues: facts.reduce((sum, fact) => sum + fact.issues, 0) };
}

function covers(entries: readonly ReportCoverage[], start: number, end: number): boolean {
  const spans = entries.map(entry => ({
    start: Date.parse(entry.from), end: Date.parse(entry.through),
  })).filter(span => span.start <= span.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let through = start;
  for (const span of spans) {
    if (span.start > through) break;
    if (through === end && span.end >= end) return true;
    through = Math.max(through, span.end);
    if (through >= end) return true;
  }
  return false;
}

function readCoverage(
  input: readonly ReportCoverage[], gaps: JournalRead["gaps"], conflicts: number,
): ReadCoverage {
  return (types, from, through, evidence, incomplete = false) => {
    const statuses = types.map(type => {
      const relevant = input.filter(entry => entry.event_types.includes(type));
      if (from === null || relevant.length === 0) return "unavailable";
      const sources = [...new Set(relevant.map(entry => entry.source_id))];
      const bySource = sources.map(source => {
        if (gaps.some(gap => gap.source_id === null || gap.source_id === source)) return "unavailable";
        const entries = relevant.filter(entry => entry.source_id === source);
        if (covers(entries.filter(entry => entry.status === "complete"), from, through)) return "complete";
        if (covers(entries.filter(entry => entry.status === "not_applicable"), from, through)) return "not_applicable";
        return "unavailable";
      });
      if (bySource.includes("unavailable")) return "unavailable";
      return bySource.includes("complete") ? "complete" : "not_applicable";
    });
    if (conflicts === 0 && !incomplete && !statuses.includes("unavailable")) {
      if (statuses.every(status => status === "not_applicable")) return evidence ? "partial" : "not_applicable";
      return "complete";
    }
    return evidence || statuses.includes("complete") || incomplete ? "partial" : "unavailable";
  };
}

function threads(events: readonly MetricsEvent[]): Identify {
  const byName = new Map<string, Set<string>>();
  for (const event of events) {
    const name = str(event, "thread_id");
    const session = str(event, "session_id");
    if (name === null || session === null) continue;
    const matches = byName.get(name) ?? new Set<string>();
    matches.add(session);
    byName.set(name, matches);
  }
  return event => {
    const name = str(event, "thread_id");
    if (name === null) return null;
    const session = str(event, "session_id");
    if (session !== null) return key(session, name);
    const matches = byName.get(name);
    if (matches === undefined) return key(name);
    return matches.size === 1 ? key([...matches][0], name) : null;
  };
}

function attribute(events: readonly MetricsEvent[], thread: Identify) {
  const bindings = new Map<string, { at: number; task: string; previous: string | null }[]>();
  const turns = new Map<string, Set<string>>();
  const turnsById = new Map<string, Set<string>>();
  const taskSet = (map: Map<string, Set<string>>, id: string | null, task: string) => {
    if (id === null) return;
    const tasks = map.get(id) ?? new Set<string>();
    tasks.add(task);
    map.set(id, tasks);
  };
  const unique = (tasks: Set<string> | undefined) => tasks?.size === 1 ? [...tasks][0] : null;
  const bind = (id: string, at: number, task: string, previous: string | null) => {
    const entries = bindings.get(id) ?? [];
    entries.push({ at, task, previous });
    bindings.set(id, entries);
  };
  const threadByName = new Map<string, Set<string>>();
  const turnContexts = new Map<string, Set<string>>();
  const copies = rowsOf(events, "session.forked", "session.child_started");
  const born = new Map<string, number>();
  const turn = (event: MetricsEvent) => key(thread(event), str(event, "turn_id"));
  for (const event of copies) {
    const id = thread(event);
    const at = timestamp(event.occurred_at);
    if (id !== null && at !== null) born.set(id, Math.max(born.get(id) ?? -Infinity, at));
  }
  const eligible = events.filter(event => {
    const id = thread(event);
    const at = timestamp(event.occurred_at);
    const boundary = id === null ? undefined : born.get(id);
    return boundary === undefined || at === null || at >= boundary || !attributionTypes.includes(event.event_type);
  });
  for (const event of eligible) {
    const id = thread(event);
    const name = str(event, "thread_id");
    const turnId = str(event, "turn_id");
    if (id !== null && name !== null) taskSet(threadByName, name, id);
    if (id !== null && turnId !== null) taskSet(turnContexts, turnId, id);
    if (event.task_id !== null) {
      taskSet(turns, turn(event), event.task_id);
      taskSet(turnsById, str(event, "turn_id"), event.task_id);
      if (id !== null && event.occurred_at !== null && [
        "task.started", "task.thread_bound", "task.switched",
      ].includes(event.event_type)) {
        bind(id, Date.parse(event.occurred_at), event.task_id, str(event, "previous_task_id"));
      }
    }
  }

  function binding(id: string, at: number, inFlight: boolean): string | null {
    const available = (bindings.get(id) ?? []).filter(entry => entry.at <= at);
    const latest = Math.max(...available.map(entry => entry.at));
    const current = unique(new Set(available.filter(entry => entry.at === latest).map(entry => entry.task)));
    if (inFlight && available.some(entry => entry.task !== current || entry.previous !== null && entry.previous !== current)) {
      return null;
    }
    return current;
  }

  function lineage(turnId: string | null, parent: string | null): Set<string> | undefined {
    if (turnId === null) return undefined;
    if (parent !== null) return turns.get(key(parent, turnId)!);
    return turnContexts.get(turnId)?.size === 1 ? turnsById.get(turnId) : undefined;
  }

  const assigned: MetricsEvent[] = [];
  const unassigned: MetricsEvent[] = [];
  const reviewTasks = new Map<string, Set<string>>();
  for (const event of eligible) {
    const id = thread(event);
    const at = timestamp(event.occurred_at);
    if (id !== null && at !== null && ["session.forked", "session.child_started"].includes(event.event_type)) {
      const source = str(event, "source_thread_id") ?? str(event, "parent_thread_id");
      const sourceTurn = str(event, "source_turn_id") ?? str(event, "parent_turn_id");
      const parent = source === null ? null : unique(threadByName.get(source));
      const inherited = lineage(sourceTurn, parent);
      const task = event.task_id ?? (inherited === undefined
        ? (parent === null ? null : binding(parent, at, true)) : unique(inherited));
      if (task !== null) bind(id, at, task, null);
    }
    if (!attributionTypes.includes(event.event_type)) {
      assigned.push(event);
      continue;
    }
    const explicitTurn = turn(event);
    const rootTurn = str(event, "root_turn_id");
    const parentName = str(event, "parent_thread_id");
    const parent = parentName === null ? null : unique(threadByName.get(parentName));
    const exact = explicitTurn === null ? undefined : turns.get(explicitTurn);
    const root = rootTurn === null || rootTurn === str(event, "turn_id") ? undefined : lineage(rootTurn, parent);
    const anchors = new Set([...(exact ?? []), ...(root ?? [])]);
    if (event.task_id !== null) anchors.add(event.task_id);
    const reviewId = str(event, "review_id");
    if (reviewId !== null && event.event_type === "permission.review_finished") {
      for (const task of reviewTasks.get(reviewId) ?? []) anchors.add(task);
    }
    const inFlight = event.event_type === "model.usage" || event.event_type === "permission.review_finished" ||
      event.event_type === "context.compacted";
    const task = anchors.size > 0 ? unique(anchors) : (id === null || at === null ? null : binding(id, at, inFlight));
    if (task === null) unassigned.push(event);
    else {
      assigned.push({ ...event, task_id: task });
      taskSet(turns, explicitTurn, task);
      taskSet(turnsById, str(event, "turn_id"), task);
      if (event.event_type === "permission.review_started") taskSet(reviewTasks, reviewId, task);
    }
  }
  return { assigned, unassigned };
}

function durationRows(
  pairs: (MetricsEvent | undefined)[][], window: Window, include: (event: MetricsEvent) => boolean = () => true,
  measure: (start?: MetricsEvent, finish?: MetricsEvent) => Span | null = (start, finish) => spanBetween(time(start), time(finish)),
) {
  const spans: Span[] = [];
  let points = 0;
  let open = 0;
  let missing = 0;
  for (const [start, end] of pairs) {
    const row = start ?? end;
    if (row === undefined || !include(row)) continue;
    const startTime = time(start);
    const endTime = time(end);
    const span = measure(start, end);
    if (span !== null && span.end > span.start) {
      const known = clip(span, window);
      if (known !== null) spans.push(known);
      continue;
    }
    const point = startTime ?? endTime;
    if (window.start === null || point === null || point.value < window.start.value || point.value > window.through) continue;
    points++;
    if (!end) open++;
    if (span === null) missing++;
  }
  return { spans, points, open, missing };
}

function durationEndingAt(event: MetricsEvent | undefined): Span | null {
  const duration = num(event, "duration_ms");
  const end = timestamp(event?.occurred_at ?? null);
  return duration === null || end === null ? null : { start: end - duration, end, estimated: false };
}

function testAttemptMatches(start?: MetricsEvent, finish?: MetricsEvent): boolean {
  return ["checkout_sha", "worktree_id", "ci_job_id"].every(field => {
    const first = str(start, field);
    const last = str(finish, field);
    return first === null || last === null || first === last;
  });
}

function activityReport(events: readonly MetricsEvent[], window: Window, coverage: ReadCoverage, usage: Facts) {
  const types = ["activity.started", "activity.finished"];
  const activity = paired(events, types, byFields("operation_id", "activity_type", "resource_id"));
  const blockTypes = ["decision.blocked", "decision.resolved"];
  const decisions = paired(events, blockTypes, byFields("decision_id", "operation_id"));
  const ciTypes = ["ci.job.started", "ci.job.finished"];
  const ci = paired(events, ciTypes, byFields("repo_id", "run_id", "run_attempt", "job_id", "head_sha"));
  const ciOccupancy = durationRows(ci.pairs, window);
  const runner = paired(events, testTypes, byFields("suite_id", "attempt_id"));
  const runnerOccupancy = durationRows(runner.pairs, window, undefined, (start, finish) => {
    if (!testAttemptMatches(start, finish)) return null;
    const both = spanBetween(time(start), time(finish));
    if (both !== null) return both;
    return start === undefined ? durationEndingAt(finish) : null;
  });
  const measured = durationRows(usage.rows.map(row => [undefined, row]), window, undefined,
    (_start, finish) => durationEndingAt(finish));
  const buckets = [
    ...activityTypes.map(type => ({
      type, types, issues: activity.issues,
      ...durationRows(activity.pairs, window, event => str(event, "activity_type") === type),
    })),
    { type: "operator_block", types: blockTypes, issues: decisions.issues,
      ...durationRows(decisions.pairs.filter(([blocked]) => blocked !== undefined), window) },
  ];
  const combined = buckets.map(bucket => {
    if (bucket.type === "machine") return {
      ...bucket, observedTypes: [...bucket.types, ...ciTypes, ...testTypes],
      unionSpans: [...bucket.spans, ...ciOccupancy.spans, ...runnerOccupancy.spans],
      incomplete: ci.issues + runner.issues + ciOccupancy.missing + runnerOccupancy.missing > 0,
    };
    if (bucket.type === "agent") return {
      ...bucket, observedTypes: [...bucket.types, ...usageTypes], unionSpans: [...bucket.spans, ...measured.spans],
      incomplete: measured.missing > 0 || usage.issues > 0,
    };
    return { ...bucket, observedTypes: bucket.types, unionSpans: bucket.spans, incomplete: false };
  });
  const sections = Object.fromEntries(combined.map(bucket => {
    const observed = bucket.points > 0 || bucket.spans.length > 0;
    const status = coverage(
      bucket.types, window.start?.value ?? null, window.through, observed,
      window.open || bucket.issues > 0 || bucket.missing > 0,
    );
    const durationStatus = coverage(bucket.observedTypes, window.start?.value ?? null, window.through,
      observed || bucket.unionSpans.length > 0, window.open || bucket.incomplete || bucket.issues > 0 || bucket.missing > 0);
    const estimated = bucket.unionSpans.some(span => span.estimated);
    return [bucket.type, {
      duration_ms: measurement(union(bucket.unionSpans), durationStatus, estimated),
      summed_interval_ms: measurement(bucket.spans.reduce((sum, span) => sum + span.end - span.start, 0),
        status, bucket.spans.some(span => span.estimated)),
      point_events: measurement(bucket.points, status),
      open_intervals: measurement(bucket.open, status),
      estimated,
    }];
  }));
  const all = combined.flatMap(bucket => bucket.unionSpans);
  const covered = union(all);
  const boundaries = new Map<number, Map<string, number>>();
  for (const bucket of combined) {
    for (const span of bucket.unionSpans) {
      for (const [at, delta] of [[span.start, 1], [span.end, -1]]) {
        const changes = boundaries.get(at) ?? new Map<string, number>();
        changes.set(bucket.type, (changes.get(bucket.type) ?? 0) + delta);
        boundaries.set(at, changes);
      }
    }
  }
  const active = new Map<string, number>();
  let overlap = 0;
  let previous = 0;
  for (const [at, changes] of [...boundaries].sort(([left], [right]) => left - right)) {
    if ([...active.values()].filter(value => value > 0).length > 1) overlap += at - previous;
    for (const [type, delta] of changes) active.set(type, (active.get(type) ?? 0) + delta);
    previous = at;
  }
  const status = coverage(
    [...new Set(combined.flatMap(bucket => bucket.observedTypes))], window.start?.value ?? null, window.through,
    all.length > 0 || combined.some(bucket => bucket.points > 0),
    window.open || combined.some(bucket => bucket.incomplete || bucket.issues > 0 || bucket.missing > 0),
  );
  const wall = window.start === null ? null : window.through - window.start.value;
  const unexplained: Measurement = wall === null || status === "not_applicable" || status === "unavailable"
    ? { status, value: null }
    : status === "complete" ? { status, value: wall - covered }
    : all.some(span => span.estimated) ? { status, value: wall - covered }
      : { status, value: wall - covered, upper_bound: true };
  const estimated = all.some(span => span.estimated);
  return { activity: sections, known_union_ms: measurement(covered, status, estimated),
    cross_type_overlap_ms: measurement(overlap, status, estimated), unexplained_ms: unexplained, estimated };
}

function interventionReport(events: readonly MetricsEvent[], read: ReadCoverage, window: Window) {
  const types = ["decision.requested", "operator.intervened"];
  const requests = reconcile(rowsOf(events, types[0]), byFields("decision_id"));
  const interventions = reconcile(rowsOf(events, types[1]), byFields("intervention_id"));
  const related = new Set(requests.rows.map(row => str(row, "decision_id")));
  const counts = new Map<string, number>();
  let blocking = 0;
  let missing = 0;
  for (const event of [...requests.rows, ...interventions.rows]) {
    const type = event.event_type === types[0] ? "decision_request" : str(event, "intervention_type");
    if (type === "decision_request" && event.event_type === types[1] && related.has(str(event, "decision_id"))) continue;
    if (type === null || typeof event.data.blocking !== "boolean") missing++;
    if (type !== null) counts.set(type, (counts.get(type) ?? 0) + 1);
    if (event.data.blocking === true) blocking++;
  }
  const status = read(types, window.start?.value ?? null, window.through, counts.size > 0,
    window.open || requests.issues + interventions.issues + missing > 0);
  return {
    total: measurement([...counts.values()].reduce((sum, count) => sum + count, 0), status),
    blocking: measurement(blocking, status),
    by_type: Object.fromEntries(["decision_request", "correction", "assignment", "status_question"]
      .map(type => [type, measurement(counts.get(type) ?? 0, status)])),
  };
}

function auditsReport(events: readonly MetricsEvent[], read: ReadCoverage, window: Window) {
  const types = ["audit.started", "audit.finished"];
  const audits = paired(events, types, byFields("audit_id"));
  const snapshots = new Set<string>();
  let incomplete = audits.issues > 0;
  const rows = audits.pairs.flatMap(([start, finish]) => {
    const event = finish ?? start!;
    const subject = str(finish, "subject_id") ?? str(start, "subject_id");
    const subjectType = str(finish, "subject_type") ?? str(start, "subject_type");
    const base = str(finish, "base_sha") ?? str(start, "base_sha");
    const head = str(finish, "head_sha") ?? str(start, "head_sha");
    if (start && finish && ["subject_id", "subject_type", "base_sha", "head_sha", "prior_audit_id", "rewrite_id"]
      .some(field => str(start, field) !== null && str(finish, field) !== null && str(start, field) !== str(finish, field))) {
      incomplete = true;
      return [];
    }
    const outcome = str(finish, "outcome");
    const verdict = str(finish, "verdict");
    if (outcome === "completed") {
      const snapshot = key(subjectType, subject, base, head);
      if (snapshot === null || verdict === null) incomplete = true;
      if (snapshot !== null && verdict !== null) snapshots.add(snapshot);
    }
    const duration = spanBetween(time(start), time(finish));
    if (duration === null || outcome === null) incomplete = true;
    return [{
      audit_id: str(event, "audit_id"), prior_audit_id: str(finish, "prior_audit_id") ?? str(start, "prior_audit_id"),
      subject_id: subject, subject_type: subjectType, base_sha: base, head_sha: head,
      rewrite_id: str(finish, "rewrite_id") ?? str(start, "rewrite_id"), outcome, verdict,
      duration_ms: duration === null ? null : duration.end - duration.start, estimated: duration?.estimated ?? false,
    }];
  });
  const auditStatus = read(types, window.start?.value ?? null, window.through, rows.length > 0, window.open || incomplete);
  const findingsType = ["audit.finding.recorded"];
  const findingRows = reconcile(rowsOf(events, ...findingsType), byFields("finding_occurrence_id"));
  const observations = new Set<string>();
  const causes = new Set<string>();
  const byType = new Map<string, number>();
  const knownAudits = new Set(rows.map(row => row.audit_id));
  let unlinked = false;
  for (const finding of findingRows.rows) {
    const type = str(finding, "finding_type");
    const observation = str(finding, "observation_id");
    const cause = str(finding, "cause_id");
    if (type !== null) byType.set(type, (byType.get(type) ?? 0) + 1);
    if (observation !== null) observations.add(observation);
    if (cause !== null) causes.add(cause);
    if (type === null || !knownAudits.has(str(finding, "audit_id"))) unlinked = true;
  }
  const findingsStatus = read(findingsType, window.start?.value ?? null, window.through, findingRows.rows.length > 0,
    window.open || findingRows.issues > 0 || unlinked);
  const missingObservation = findingRows.rows.some(finding => str(finding, "observation_id") === null);
  const missingCause = findingRows.rows.some(finding => str(finding, "cause_id") === null);
  return {
    attempts: measurement(rows.length, auditStatus),
    failed_attempts: measurement(rows.filter(row => row.outcome === "failed").length, auditStatus),
    cancelled_attempts: measurement(rows.filter(row => row.outcome === "cancelled").length, auditStatus),
    completed_rounds: measurement(rows.filter(row => row.outcome === "completed" && row.verdict !== null).length, auditStatus),
    reviewed_snapshots: measurement(snapshots.size, auditStatus),
    effort_ms: measurement(rows.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0),
      auditStatus, rows.some(row => row.estimated)),
    rows,
    findings: {
      occurrences: measurement(findingRows.rows.length, findingsStatus),
      observations: measurement(observations.size, missingObservation ? "partial" : findingsStatus),
      causes: measurement(causes.size, missingCause ? "partial" : findingsStatus),
      by_type: Object.fromEntries(["a", "b", "c", "d"]
        .map(type => [type, measurement(byType.get(type) ?? 0, findingsStatus)])),
    },
  };
}

function testsReport(events: readonly MetricsEvent[], read: ReadCoverage, window: Window) {
  const attempts = paired(events, testTypes, byFields("suite_id", "attempt_id"));
  let incomplete = attempts.issues > 0;
  const rows = attempts.pairs.flatMap(([start, finish]) => {
    const event = finish ?? start!;
    if (!testAttemptMatches(start, finish)) {
      incomplete = true;
      return [];
    }
    const duration = spanBetween(time(start), time(finish));
    const recorded = num(finish, "duration_ms");
    const elapsed = recorded ?? (duration === null ? null : duration.end - duration.start);
    const checkout = str(event, "checkout_sha") ?? str(start, "checkout_sha");
    const outcome = str(finish, "outcome");
    if (elapsed === null || outcome === null || checkout === null) incomplete = true;
    return [{
      suite_id: str(event, "suite_id"), attempt_id: str(event, "attempt_id"), checkout_sha: checkout,
      worktree_id: str(event, "worktree_id") ?? str(start, "worktree_id"),
      ci_job_id: str(event, "ci_job_id") ?? str(start, "ci_job_id"), outcome, exit_code: num(finish, "exit_code"),
      duration_ms: elapsed, estimated: recorded === null && (duration?.estimated ?? false),
    }];
  });
  const status = read(testTypes, window.start?.value ?? null, window.through, rows.length > 0, window.open || incomplete);
  return {
    attempts: measurement(rows.length, status),
    cancelled_or_interrupted: measurement(rows.filter(row => row.outcome === "cancelled" || row.outcome === "interrupted").length, status),
    effort_ms: measurement(rows.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0),
      status, rows.some(row => row.estimated)),
    rows,
  };
}

function ciReport(events: readonly MetricsEvent[], read: ReadCoverage, window: Window) {
  const runFields = ["repo_id", "run_id", "run_attempt"];
  const jobFields = [...runFields, "job_id"];
  const runKey = byFields(...runFields);
  const jobKey = byFields(...jobFields);
  const runTypes = ["ci.run.started", "ci.run.finished"];
  const jobTypes = ["ci.job.queued", "ci.job.assigned", "ci.job.started", "ci.job.finished"];
  const stepType = "ci.step.finished";
  const runs = paired(events, runTypes, runKey);
  const jobs = paired(events, jobTypes, jobKey);
  const steps = reconcile(rowsOf(events, stepType), byFields(...jobFields, "step_number"));
  const stepsByJob = indexBy(steps.rows, jobKey);
  const heads = new Map<string, Set<string>>();
  for (const row of rowsOf(events, ...runTypes, ...jobTypes, stepType)) {
    const id = runKey(row);
    const head = str(row, "head_sha");
    if (id === null || head === null) continue;
    const known = heads.get(id) ?? new Set<string>();
    known.add(head);
    heads.set(id, known);
  }
  const conflicted = (event: MetricsEvent) => (heads.get(runKey(event) ?? "")?.size ?? 0) > 1;
  let incomplete = runs.issues + jobs.issues + steps.issues > 0;
  const identify = (event: MetricsEvent) => ({
    repo_id: str(event, "repo_id"), run_id: str(event, "run_id"), run_attempt: num(event, "run_attempt"),
    head_sha: str(event, "head_sha") ?? [...heads.get(runKey(event) ?? "") ?? []][0] ?? null,
  });
  const runEnds = new Map(runs.pairs.flatMap(([start, finish]) => {
    const event = finish ?? start;
    return event ? [[runKey(event)!, finish] as const] : [];
  }));
  const jobTransitions = new Map(jobs.pairs.flatMap(pair => {
    const event = pair.find(row => row !== undefined);
    return event ? [[jobKey(event)!, pair] as const] : [];
  }));
  const runEvidence = [...runs.pairs.flat(), ...jobs.pairs.flat(), ...steps.rows].filter(row => row !== undefined);
  const jobEvidence = [...jobs.pairs.flat(), ...steps.rows].filter(row => row !== undefined);
  const runRows = [...indexBy(runEvidence, runKey)].flatMap(([id, [event]]) => {
    if (conflicted(event)) {
      incomplete = true;
      return [];
    }
    const identity = identify(event);
    const outcome = str(runEnds.get(id), "outcome");
    if (identity.head_sha === null || outcome === null) incomplete = true;
    return [{ ...identity, outcome }];
  });
  const jobRows = [...indexBy(jobEvidence, jobKey)].flatMap(([id, [event]]) => {
    const [queued, assigned, started, finished] = jobTransitions.get(id) ?? [];
    if (conflicted(event)) {
      incomplete = true;
      return [];
    }
    const queue = time(queued);
    const assignment = time(assigned);
    const start = time(started);
    const finish = time(finished);
    const queueWait = spanBetween(queue, assignment);
    const queueBound = assignment === null && queue !== null && start !== null &&
      !queue.estimated && !start.estimated ? spanBetween(queue, start) : null;
    const occupied = spanBetween(start, finish);
    const jobSteps = stepsByJob.get(jobKey(event)!) ?? [];
    const failure = jobSteps
      .filter(row => ["failed", "failure"].includes(str(row, "outcome") ?? ""))
      .sort((a, b) => num(a, "step_number")! - num(b, "step_number")!)[0];
    const identity = identify(event);
    const outcome = str(finished, "outcome");
    if (identity.head_sha === null || queueWait === null || occupied === null || outcome === null ||
      (["failed", "failure"].includes(outcome) && (!failure || str(failure, "failure_code") === null ||
        str(failure, "fixture_version") === null))) incomplete = true;
    return [{
      ...identity, job_id: str(event, "job_id"), outcome,
      queued_at: iso(queue?.value ?? null), assigned_at: iso(assignment?.value ?? null),
      started_at: iso(start?.value ?? null), finished_at: iso(finish?.value ?? null),
      queue_wait_ms: queueWait === null ? null : queueWait.end - queueWait.start,
      queue_wait_upper_bound_ms: queueBound === null ? null : queueBound.end - queueBound.start,
      occupied_ms: occupied === null ? null : occupied.end - occupied.start,
      estimated: [queue, assignment, start, finish].some(point => point?.estimated),
      first_observed_failing_step: failure ? {
        step_number: num(failure, "step_number"), failure_code: str(failure, "failure_code"),
        fixture_version: str(failure, "fixture_version"),
      } : null,
      steps: jobSteps.sort((a, b) => num(a, "step_number")! - num(b, "step_number")!).map(step => {
        const start = timestamp(str(step, "started_at"));
        const finish = time(step)!;
        return {
          step_number: num(step, "step_number"), outcome: str(step, "outcome"),
          duration_ms: start !== null && start <= finish.value ? finish.value - start : null,
          estimated: finish.estimated,
        };
      }),
    }];
  });
  const status = read([...runTypes, ...jobTypes, stepType], window.start?.value ?? null, window.through,
    runRows.length > 0 || jobRows.length > 0, window.open || incomplete);
  return {
    run_attempts: measurement(runRows.length, status),
    retries: measurement(runRows.filter(row => (row.run_attempt ?? 0) > 1).length, status),
    jobs: measurement(jobRows.length, status),
    machine_effort_ms: measurement(jobRows.reduce((sum, row) => sum + (row.occupied_ms ?? 0), 0),
      status, jobRows.some(row => row.estimated)),
    runs: runRows, job_rows: jobRows,
  };
}

function controlsReport(events: readonly MetricsEvent[], read: ReadCoverage, window: Window) {
  const permissions = ["permission.review_started", "permission.review_finished"];
  const reviews = paired(events, permissions, byFields("review_id"));
  const reviewSpans = reviews.pairs.map(([start, end]) => spanBetween(time(start), time(end)));
  const reviewStatus = read(permissions, window.start?.value ?? null, window.through, reviews.pairs.length > 0,
    window.open || reviews.issues > 0 || reviewSpans.some(span => span === null));
  const guardTypes = ["guard.activated"];
  const guards = reconcile(rowsOf(events, ...guardTypes), byFields("control_id", "attempt_id"));
  const guardStatus = read(guardTypes, window.start?.value ?? null, window.through, guards.rows.length > 0,
    window.open || guards.issues > 0 || guards.rows.some(row => str(row, "outcome") === null));
  const disputesTypes = ["test.dispute_raised", "test.dispute_resolved"];
  const disputes = paired(events, disputesTypes, byFields("dispute_id"));
  const disputeStatus = read(disputesTypes, window.start?.value ?? null, window.through, disputes.pairs.length > 0,
    window.open || disputes.issues > 0 || disputes.pairs.some(([raised]) => raised === undefined));
  return {
    permission_reviews: {
      attempts: measurement(reviews.pairs.length, reviewStatus),
      effort_ms: measurement(reviewSpans.reduce((sum, span) => sum + (span === null ? 0 : span.end - span.start), 0), reviewStatus),
      estimated: reviewSpans.some(span => span?.estimated),
    },
    guards: {
      activations: measurement(guards.rows.length, guardStatus),
      blocks: measurement(guards.rows.filter(row => str(row, "outcome") === "blocked").length, guardStatus),
      rows: guards.rows.map(row => ({
        control_id: str(row, "control_id"), attempt_id: str(row, "attempt_id"),
        head_sha: str(row, "head_sha"), outcome: str(row, "outcome"),
      })),
    },
    test_disputes: {
      raised: measurement(disputes.pairs.filter(([raised]) => raised !== undefined).length, disputeStatus),
      resolved: measurement(disputes.pairs.filter(([raised, resolved]) => raised && resolved).length, disputeStatus),
      rows: disputes.pairs.map(([raised, resolved]) => {
        const event = raised ?? resolved!;
        return {
          dispute_id: str(event, "dispute_id"), test_id: str(event, "test_id"), criterion_id: str(event, "criterion_id"),
          baseline_sha: str(event, "baseline_sha"), outcome: str(resolved, "outcome"),
        };
      }),
    },
  };
}

function tokenTotals(rows: readonly MetricsEvent[], status: Coverage) {
  const sum = (field: string) => {
    const used = rows.map(row => num(row, field));
    const observed = used.reduce<number>((total, value) => total + (value ?? 0), 0);
    return measurement(observed, used.some(value => value === null) ? "partial" : status);
  };
  return {
    responses: measurement(rows.length, status),
    ...Object.fromEntries(tokenFields.map(field => [field, sum(field)])),
  };
}

function fromTime(events: readonly MetricsEvent[], start: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (time(events[middle])!.value < start) low = middle + 1;
    else high = middle;
  }
  return low;
}

function modelUsage(all: readonly MetricsEvent[], unassigned: readonly MetricsEvent[], taskId: string): Facts {
  const responseKey = byFields("provider_id", "response_id");
  // Join across tasks before selecting a task so conflicting attributions
  // cannot charge the same response to two tasks.
  const assignedUsage = rowsOf(all, ...usageTypes);
  const unresolved = rowsOf(unassigned, ...usageTypes);
  const responses = reconcile([...assignedUsage, ...unresolved], responseKey);
  const taskResponses = new Set(assignedUsage.filter(row => row.task_id === taskId).map(responseKey));
  return {
    rows: responses.rows.filter(row => row.task_id === taskId && taskResponses.has(responseKey(row))),
    issues: responses.issues + unresolved.length,
  };
}

function contextReport(
  events: readonly MetricsEvent[], model: Facts, unassigned: readonly MetricsEvent[],
  read: ReadCoverage, window: Window, thread: Identify,
) {
  const byTime = (left: MetricsEvent, right: MetricsEvent) => time(left)!.value - time(right)!.value;
  const usage = model.rows.filter(row => time(row)!.value <= window.through &&
    (window.start === null || time(row)!.value >= window.start.value)).sort(byTime);
  const unresolvedUsage = model.issues > 0;
  const usageStatus = read(usageTypes, window.start?.value ?? null, window.through, usage.length > 0,
    window.open || unresolvedUsage);
  const compactType = ["context.compacted"];
  const compactions = reconcile(rowsOf(events, ...compactType), byFields("compaction_id"));
  const orderedCompactions = compactions.rows.sort(byTime);
  const compactionThreads = indexBy(orderedCompactions, thread);
  const nextCompactions = new Map<MetricsEvent, MetricsEvent>();
  for (const values of compactionThreads.values()) {
    values.slice(1).forEach((next, index) => nextCompactions.set(values[index], next));
  }
  const stateType = "task.state_changed";
  const actions = reconcile(rowsOf(events, stateType), byFields("operation_id"));
  const actionsByThread = indexBy(actions.rows.sort(byTime), thread);
  const usageByThread = indexBy(usage, thread);
  const recoveries = orderedCompactions.map(compaction => {
    const begin = time(compaction)!;
    const id = str(compaction, "compaction_id");
    const context = thread(compaction);
    const next = nextCompactions.get(compaction);
    const limit = next ? time(next)!.value : window.through;
    const actionsHere = context === null ? [] : actionsByThread.get(context) ?? [];
    let action: MetricsEvent | undefined;
    for (let index = fromTime(actionsHere, begin.value); index < actionsHere.length; index++) {
      const candidate = actionsHere[index];
      if (time(candidate)!.value > limit) break;
      const explicit = str(candidate, "compaction_id");
      if (explicit === id || (explicit === null && (!next || time(candidate)!.value < limit))) {
        action = candidate;
        break;
      }
    }
    const end = time(action);
    const usageHere = context === null ? [] : usageByThread.get(context) ?? [];
    const inside: MetricsEvent[] = [];
    for (let index = fromTime(usageHere, begin.value); index < usageHere.length; index++) {
      const candidate = usageHere[index];
      if (time(candidate)!.value > (end?.value ?? limit)) break;
      inside.push(candidate);
    }
    const beginTurn = str(compaction, "turn_id");
    const endTurn = str(action, "turn_id");
    const known = inside.filter(row => {
      const tokenTime = time(row)!;
      const tokenTurn = str(row, "turn_id");
      return end !== null && !begin.estimated && !end.estimated && !tokenTime.estimated &&
        beginTurn !== null && endTurn !== null && tokenTurn !== null &&
        tokenTurn !== beginTurn && tokenTurn !== endTurn && tokenTime.value > begin.value && tokenTime.value < end.value;
    });
    const status = read(usageTypes, begin.value, end?.value ?? limit, known.length > 0,
      end === null || inside.length !== known.length || unresolvedUsage || actions.issues > 0);
    return {
      session_id: str(compaction, "session_id"), thread_id: str(compaction, "thread_id"),
      compaction_id: id, trigger: str(compaction, "trigger"),
      completed_at: iso(begin.value), first_state_change_at: iso(end?.value ?? null),
      elapsed_ms: end === null ? null : end.value - begin.value, estimated: begin.estimated || (end?.estimated ?? false),
      usage: tokenTotals(known, status),
    };
  });
  const status = read(compactType, window.start?.value ?? null, window.through, compactions.rows.length > 0,
    window.open || compactions.issues > 0 || rowsOf(unassigned, ...compactType).length > 0);
  const byModel = indexBy(usage, row => str(row, "model") ?? "");
  return {
    tokens: {
      ...tokenTotals(usage, usageStatus),
      by_model: [...byModel].map(([model, rows]) => ({
        model: model || null, ...tokenTotals(rows, usageStatus),
      })),
    },
    compactions: {
      count: measurement(compactions.rows.length, status),
      recoveries,
    },
  };
}

function reworkReport(
  events: readonly MetricsEvent[], all: readonly MetricsEvent[], asOf: number, read: ReadCoverage, lead: Window,
) {
  const mergeType = "pull_request.merged";
  const merges = reconcile(rowsOf(events, mergeType), byFields("repo_id", "delivery_id"));
  const classification = "delivery.follow_up_classified";
  const linkedFollowUps = indexBy(rowsOf(all, classification), row => str(row, "delivery_id"));
  const linkedDeliveries = indexBy(rowsOf(all, "pull_request.opened", mergeType), row => str(row, "delivery_id"));
  const windows = merges.rows.map(merge => {
    const delivery = str(merge, "delivery_id")!;
    const merged = time(merge)!;
    const deadline = merged.value + 168 * hour;
    const open = asOf < deadline;
    const through = Math.min(asOf, deadline);
    const linked = linkedFollowUps.get(delivery) ?? [];
    const reduced = reconcile(linked, byFields("follow_up_id", "follow_up_basis"));
    const deliveries = new Set((linkedDeliveries.get(delivery) ?? []).map(row => str(row, "repo_id")));
    const contextAmbiguous = deliveries.size !== 1 || deliveries.has(null);
    let incomplete = contextAmbiguous || merges.issues > 0 || reduced.issues > 0 || merged.estimated;
    const followUps = new Map<string, MetricsEvent[]>();
    for (const event of reduced.rows) {
      const id = str(event, "follow_up_id")!;
      const rows = followUps.get(id) ?? [];
      rows.push(event);
      followUps.set(id, rows);
    }
    const rows = [...followUps].flatMap(([followUp, reports]) => {
      const occurred = (row: MetricsEvent) => timestamp(str(row, "follow_up_at"));
      const inWindow = (at: number) => at >= merged.value && at < deadline && at <= asOf;
      const possiblyInWindow = reports.some(row => occurred(row) === null || inWindow(occurred(row)!));
      const flags = new Set(reports.map(row => row.data.corrects_delivery ?? null));
      if (contextAmbiguous || flags.has(true) && flags.has(false)) {
        if (possiblyInWindow) incomplete = true;
        return [];
      }
      const chosen = reports.find(row => str(row, "follow_up_basis") === "verified_action") ?? reports[0];
      const at = occurred(chosen);
      if (!merged.estimated && flags.has(true) && at !== null && inWindow(at)) {
        const changeType = str(chosen, "change_type");
        if (changeType === null) incomplete = true;
        return [{
          follow_up_id: followUp, follow_up_at: iso(at), basis: str(chosen, "follow_up_basis"), change_type: changeType,
        }];
      }
      if (possiblyInWindow && (flags.has(null) || flags.has(true) && at === null)) incomplete = true;
      return [];
    });
    const status = read([mergeType, classification], merged.value, through, rows.length > 0,
      open || incomplete);
    return {
      repo_id: str(merge, "repo_id"), delivery_id: delivery, merged_at: iso(merged.value),
      deadline: iso(deadline), observed_through: iso(through), open, estimated: merged.estimated,
      verified_actions: measurement(rows.filter(row => row.basis === "verified_action").length, status),
      pr_opened_proxies: measurement(rows.filter(row => row.basis === "pr_opened_proxy").length, status),
      rows,
    };
  });
  const mergeStatus = read([mergeType], lead.start?.value ?? null, asOf, windows.length > 0, merges.issues > 0);
  return { observed_merge_windows: measurement(windows.length, mergeStatus), seven_day_rework: windows };
}

export function summarize(
  journal: JournalRead, taskId: string, asOf: string, coverage: readonly ReportCoverage[] = [],
) {
  const cutoff = timestamp(asOf);
  if (cutoff === null) throw new Error("invalid_report_time");
  const eligible = journal.events.filter(row => Date.parse(row.observed_at) <= cutoff && time(row)!.value <= cutoff)
    .sort((a, b) => time(a)!.value - time(b)!.value || Date.parse(a.observed_at) - Date.parse(b.observed_at) ||
      (a.event_id < b.event_id ? -1 : a.event_id === b.event_id ? 0 : 1));
  const unique = reconcile(eligible, row => row.event_id);
  const thread = threads(unique.rows);
  const { assigned, unassigned } = attribute(unique.rows, thread);
  const events = assigned.filter(row => row.task_id === taskId);
  const gaps = journal.gaps.filter(gap => Date.parse(gap.observed_at) <= cutoff);
  const read = readCoverage(coverage, gaps, unique.issues);
  const startCandidates = rowsOf(events, "task.started", "task.accepted").flatMap(row => {
    const knownStart = timestamp(str(row, "execution_started_at"));
    const occurred = knownStart === null
      ? row.event_type === "task.started" ? time(row) : null
      : { value: knownStart, estimated: false };
    return occurred === null || occurred.value > cutoff ? [] : [occurred];
  });
  const exact = startCandidates.filter(point => !point.estimated);
  const candidates = exact.length > 0 ? exact : startCandidates;
  const start = new Set(candidates.map(point => point.value)).size === 1 ? candidates[0] : null;
  const acceptedTimes = rowsOf(events, "task.accepted").map(row => time(row)!);
  const accepted = new Set(acceptedTimes.map(point => point.value)).size === 1 ? acceptedTimes[0] : null;
  const leadEnd = start !== null && accepted !== null && accepted.value >= start.value ? accepted : null;
  const pastAcceptance = leadEnd?.value ?? cutoff;
  const lead = { start, end: leadEnd, through: pastAcceptance, open: leadEnd === null };
  const opened = reconcile(rowsOf(events, "pull_request.opened"), byFields("repo_id", "delivery_id"));
  const pr = start === null ? undefined : opened.rows
    .filter(row => time(row)!.value >= start.value).sort((a, b) => time(a)!.value - time(b)!.value)[0];
  const prEnd = time(pr);
  const alreadyOpen = start === null ? [] : opened.rows
    .filter(row => !time(row)!.estimated && time(row)!.value < start.value)
    .map(row => ({ repo_id: str(row, "repo_id"), delivery_id: str(row, "delivery_id") }));
  const prePr = { start, end: prEnd, through: prEnd?.value ?? pastAcceptance, open: prEnd === null };
  const usage = modelUsage(assigned, unassigned, taskId);
  const leadActivity = activityReport(events, lead, read, usage);
  const prePrActivity = activityReport(events, prePr, read, usage);
  const working = events.filter(row => time(row)!.value <= lead.through &&
    (start === null || time(row)!.value >= start.value));
  const audits = auditsReport(working, read, lead);
  const rewrites = reconcile(rowsOf(working, "ref.rewritten"), row => row.event_id);
  const rewriteStatus = read(["ref.rewritten"], start?.value ?? null, lead.through, rewrites.rows.length > 0,
    lead.open || rewrites.issues > 0);
  const auditsByRewrite = new Map<string, typeof audits.rows>();
  for (const audit of audits.rows) {
    if (audit.rewrite_id === null) continue;
    const group = auditsByRewrite.get(audit.rewrite_id) ?? [];
    group.push(audit);
    auditsByRewrite.set(audit.rewrite_id, group);
  }
  const rewriteRows = rewrites.rows.map(row => {
    const related = auditsByRewrite.get(row.event_id) ?? [];
    const head = str(row, "new_sha");
    return {
      rewrite_id: row.event_id, repo_id: str(row, "repo_id"), ref_id: str(row, "ref_id"),
      old_sha: str(row, "old_sha"), new_sha: head, operation_type: str(row, "operation_type"),
      matching_audit_ids: related.filter(audit => head !== null && audit.head_sha === head).map(audit => audit.audit_id),
      other_audit_ids: related.filter(audit => head === null || audit.head_sha !== head).map(audit => audit.audit_id),
    };
  });
  const reportWindow = (window: Window, elapsedStatus: Coverage) => {
    const span = spanBetween(window.start, window.end);
    const calendar: Measurement = span === null ? { status: "unavailable", value: null }
      : elapsedStatus === "partial" && !span.estimated ? { status: "partial", value: span.end - span.start, upper_bound: true }
        : { status: elapsedStatus, value: span.end - span.start };
    return {
      start_at: iso(window.start?.value ?? null), end_at: iso(window.end?.value ?? null),
      observed_through: iso(window.through), open: window.open,
      calendar_ms: calendar,
      endpoint_estimated: (window.start?.estimated ?? false) || (window.end?.estimated ?? false),
    };
  };
  const firstPrStatus = read(["pull_request.opened"], start?.value ?? null, prePr.through, pr !== undefined,
    opened.issues > 0);
  const sourceIds = [...new Set([
    ...coverage.map(item => item.source_id), ...eligible.map(row => row.source_id), ...gaps.map(gap => gap.source_id),
  ])].sort();
  return {
    schema_version: 1,
    task_id: taskId,
    as_of: iso(cutoff),
    coverage: {
      window_start: iso(start?.value ?? null), window_through: iso(lead.through),
      sources: sourceIds.map(source => {
        const entries = coverage.filter(entry => entry.source_id === source);
        const types = [...new Set(entries.flatMap(entry => entry.event_types))];
        const seen = eligible.some(row => row.source_id === source && time(row)!.value <= lead.through &&
          (start === null || time(row)!.value >= start.value));
        const status = types.length === 0
          ? (seen ? "partial" : "unavailable")
          : readCoverage(entries, gaps, unique.issues)(types, start?.value ?? null, lead.through, seen);
        return { source_id: source, status };
      }),
      gaps: gaps.map(gap => ({ source_id: gap.source_id, code: gap.code })),
      conflicting_occurrences: unique.issues,
    },
    pre_pr: {
      ...reportWindow(prePr, firstPrStatus), ...prePrActivity,
      delivery_id: str(pr, "delivery_id"), repo_id: str(pr, "repo_id"), already_open_deliveries: alreadyOpen,
    },
    lead_time: { ...reportWindow(lead, "complete"), ...leadActivity },
    interventions: interventionReport(working, read, lead),
    audits,
    tests: testsReport(working, read, lead),
    ci: ciReport(working, read, lead),
    ref_rewrites: { count: measurement(rewriteRows.length, rewriteStatus), rows: rewriteRows },
    ...controlsReport(working, read, lead),
    ...contextReport(working, usage, unassigned, read, lead, thread),
    ...reworkReport(events, assigned, cutoff, read, lead),
  };
}
