import { spawnSync } from "node:child_process";
import {
  appendFileSync, closeSync, constants, fstatSync, fsyncSync, openSync, readSync,
} from "node:fs";
import {
  isTrustedIdentity, normalizeEvent, parseUtc, recordObject, timeKey, trainObservation, type MetricsEvent,
} from "./events.js";
import { coverageFile, type MetricsProfile } from "./profile.js";

export type CoverageGap = {
  source_id: string | null;
  code: string;
  observed_at: string;
};
type StoredGap = CoverageGap & { event_id?: string };
type DisputedTaskReceipt = Pick<MetricsEvent, "event_type" | "task_id" | "occurred_at">;
export type JournalRead = {
  events: MetricsEvent[];
  gaps: CoverageGap[];
  disputedTaskReceipts?: DisputedTaskReceipt[];
};
const maxFileBytes = 32 * 1024 * 1024;
// A trusted spool import must not resolve helpers through the workspace PATH.
const coordinatorLock = "/usr/bin/flock";

const gapCodes = new Set([
  "test_coverage_gap", "git_rewrite_unverified", "github_sync_failed", "session_binding_required", "tool_occurrence_identity_missing", "adapter_gap", "conflicting_event", "invalid_event", "invalid_input",
  "journal_invalid", "coverage_invalid", "journal_missing", "line_limit",
  "source_missing", "source_unreadable", "source_unconfigured", "source_changed",
  "usage_response_identity_missing", "usage_counts_partial", "compaction_occurrence_identity_missing",
  "compaction_outcome_missing", "guardian_review_identity_missing",
  "github_missing_repository", "github_missing_job_identity", "github_missing_step_identity",
  "github_incomplete_jobs_page", "github_missing_jobs", "github_missing_run_identity",
  "github_missing_delivery_identity", "github_missing_rewrite_identity", "github_unknown_conclusion",
]);

export function coverageGap(code: string, source_id: string | null = null, observed_at = new Date().toISOString()): CoverageGap {
  return { code: gapCodes.has(code) ? code : "adapter_gap", source_id, observed_at };
}

function systemCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

function openPrivate(path: string, write: boolean) {
  const flags = write
    ? constants.O_CREAT | constants.O_APPEND | constants.O_RDWR
    : constants.O_RDONLY;
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const file = fstatSync(fd);
    if (!file.isFile() || (file.mode & 0o077) !== 0 || file.nlink !== 1) throw new Error("journal_permissions");
    if (file.size > maxFileBytes) throw new Error("journal_limit");
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function enforceLock(fd: number, write: boolean, lockCommand: string): void {
  // The child inherits the open file description. The parent holds the lock until close.
  const lock = spawnSync(lockCommand, [write ? "-x" : "-s", "-w", "2", "3"], {
    stdio: ["ignore", "ignore", "ignore", fd],
    timeout: 3000,
  });
  if (lock.error || lock.signal) throw new Error("journal_lock_unavailable");
  if (lock.status !== 0) throw new Error("journal_lock_busy");
  if (fstatSync(fd).size > maxFileBytes) throw new Error("journal_limit");
}

function inspectLines<T>(contents: string, parse: (value: unknown) => T, invalid: () => void): T[] {
  if (!contents) return [];
  const result: T[] = [];
  let offset = 0;
  while (offset < contents.length) {
    const newline = contents.indexOf("\n", offset);
    const end = newline === -1 ? contents.length : newline;
    const line = contents.slice(offset, end);
    offset = end + 1;
    if (!line) { invalid(); continue; }
    try {
      result.push(parse(JSON.parse(line)));
    } catch {
      invalid();
    }
  }
  return result;
}

// Keep the first receipt and source, and fill facts they did not establish.
// Return the original object for a replay that adds no evidence.
function mergeProjection(first: MetricsEvent, next: MetricsEvent): MetricsEvent | undefined {
  if (first.schema_version !== next.schema_version || first.project_id !== next.project_id
      || first.event_type !== next.event_type
      || (first.task_id !== null && next.task_id !== null && first.task_id !== next.task_id)
      || (first.occurred_at !== null && next.occurred_at !== null
        && timeKey(first.occurred_at) !== timeKey(next.occurred_at))
      || (first.actor_role !== "unknown" && next.actor_role !== "unknown" && first.actor_role !== next.actor_role)) {
    return;
  }

  const task_id = first.task_id ?? next.task_id;
  const occurred_at = first.occurred_at ?? next.occurred_at;
  const actor_role = first.actor_role === "unknown" ? next.actor_role : first.actor_role;
  let data = first.data;
  for (const [key, value] of Object.entries(next.data)) {
    if (value === null) continue;
    const prior = first.data[key];
    if (prior != null) {
      if (prior !== value && !(key.endsWith("_at") && typeof prior === "string" && typeof value === "string"
         && timeKey(prior) === timeKey(value))) return;
    } else {
      if (data === first.data) data = { ...first.data };
      data[key] = value;
    }
  }
  if (task_id === first.task_id && occurred_at === first.occurred_at && actor_role === first.actor_role
      && data === first.data) return first;
  return { ...first, task_id, occurred_at, actor_role, data };
}

function readGap(raw: unknown, profile: MetricsProfile): StoredGap {
  const row = recordObject(raw);
  const observed_at = parseUtc(row?.observed_at);
  if (!row || !observed_at || typeof row.code !== "string" || !gapCodes.has(row.code)
      || (row.source_id !== null && (typeof row.source_id !== "string"
          || !Object.hasOwn(profile.sources, row.source_id)))
      || (row.event_id !== undefined && (row.code !== "conflicting_event"
          || !isTrustedIdentity(row.event_id, profile)))) throw new Error("coverage_invalid");
  return { code: row.code, source_id: row.source_id, observed_at, event_id: row.event_id as string | undefined };
}

function appendLines(fd: number, contents: string, rows: readonly unknown[], limit = maxFileBytes): void {
  if (!rows.length) return;
  const prefix = contents && !contents.endsWith("\n") ? "\n" : "";
  const payload = prefix + rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  if (fstatSync(fd).size + Buffer.byteLength(payload) > limit) throw new Error("journal_limit");
  appendFileSync(fd, payload, "utf8");
  fsyncSync(fd);
}

type OpenJournal = {
  fd: number;
  coverageFd: number | undefined;
  contents: string;
  coverageContents: string;
  rows: MetricsEvent[];
  gaps: StoredGap[];
};

// Spool files are supplied by a workspace process which can ignore advisory locks.
function boundedRead(fd: number, limit = maxFileBytes): string {
  const size = fstatSync(fd).size;
  if (size > limit) throw new Error("journal_limit");
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(fd, buffer, offset, size - offset, offset);
    if (!count) throw new Error("journal_unavailable");
    offset += count;
  }
  return buffer.toString("utf8");
}

function view(fd: number, coverageFd: number | undefined, profile: MetricsProfile): OpenJournal {
  const contents = boundedRead(fd, profile.spoolByteLimit);
  const coverageContents = coverageFd === undefined ? "" : boundedRead(coverageFd, profile.spoolByteLimit);
  const glitches = new Set<string>();
  const gaps = inspectLines(coverageContents, (row) => readGap(row, profile), () => glitches.add("coverage_invalid"));
  const rows = inspectLines(contents, (row) => normalizeEvent(row, profile), () => glitches.add("journal_invalid"));
  for (const code of glitches) gaps.push(coverageGap(code));
  return { fd, coverageFd, contents, coverageContents, rows, gaps };
}

function reconcileReceipts(rows: readonly MetricsEvent[], legacyConflicts: ReadonlySet<string>, cutoff?: string) {
  const receipts = rows.map((event) => ({ event, time: timeKey(event.observed_at) }))
    .filter(({ time }) => cutoff === undefined || time <= cutoff)
    .sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
  const events = new Map<string, MetricsEvent>();
  const sources = new Map<string, Set<string>>();
  const conflicted = new Set<string>();
  const gaps: CoverageGap[] = [];

  for (const { event } of receipts) {
    const { event_id, source_id, observed_at } = event;
    if (legacyConflicts.has(event_id)) continue;
    const participating = sources.get(event_id) ?? new Set<string>();
    if (conflicted.has(event_id)) {
      if (!participating.has(source_id)) gaps.push(coverageGap("conflicting_event", source_id, observed_at));
      participating.add(source_id);
      continue;
    }

    participating.add(source_id);
    sources.set(event_id, participating);
    const previous = events.get(event_id);
    const merged = previous ? mergeProjection(previous, event) : event;
    if (merged) {
      events.set(event_id, merged);
    } else {
      events.delete(event_id);
      conflicted.add(event_id);
      for (const source of participating) gaps.push(coverageGap("conflicting_event", source, observed_at));
    }
  }
  return { events: [...events.values()], gaps, conflicted };
}

function projectionKey(event: MetricsEvent): string {
  const { observed_at: _time, source_id: _source, ...fact } = event;
  return JSON.stringify(fact);
}

function withJournal<T>(profile: MetricsProfile, write: boolean, act: (state: OpenJournal) => T, lockCommand = "flock"): T | undefined {
  let fd: number | undefined;
  let coverageFd: number | undefined;
  try {
    fd = openPrivate(profile.journal, write);
    enforceLock(fd, write, lockCommand);
    try {
      coverageFd = openPrivate(coverageFile(profile.journal), write);
    } catch (error) {
      if (write || systemCode(error) !== "ENOENT") throw error;
    }
    return act(view(fd, coverageFd, profile));
  } catch (error) {
    if (!write && fd === undefined && systemCode(error) === "ENOENT") return;
    if (error instanceof Error && /^journal_[a-z_]+$/u.test(error.message)) throw error;
    throw new Error("journal_unavailable");
  } finally {
    if (coverageFd !== undefined) closeSync(coverageFd);
    if (fd !== undefined) closeSync(fd);
  }
}

export function spoolReceipts(profile: MetricsProfile) {
  return withJournal(profile, false, ({ rows, gaps }) => ({ rows, gaps }), coordinatorLock);
}

export function readJournal(profile: MetricsProfile, asOf?: string): JournalRead {
  const cutoff = asOf === undefined ? undefined : timeKey(asOf);
  return withJournal(profile, false, ({ rows, gaps }) => {
    const knownGaps = gaps.filter(({ observed_at }) => cutoff === undefined || timeKey(observed_at) <= cutoff);
    const legacyConflicts = new Set(knownGaps.flatMap(({ event_id }) => event_id ? [event_id] : []));
    const reconciled = reconcileReceipts(rows, legacyConflicts, cutoff);
    const disputedTaskReceipts = rows.filter(row =>
      (row.event_type === trainObservation || row.event_type === "task.started" || row.event_type === "task.accepted") &&
      (legacyConflicts.has(row.event_id) || reconciled.conflicted.has(row.event_id)) &&
      (cutoff === undefined || timeKey(row.observed_at) <= cutoff))
      .map(({ event_type, task_id, occurred_at }) => ({ event_type, task_id, occurred_at }));
    return {
      events: reconciled.events,
      gaps: [...knownGaps.map(({ source_id, code, observed_at }) => ({ source_id, code, observed_at })), ...reconciled.gaps],
      disputedTaskReceipts,
    };
  }) ?? { events: [], gaps: [coverageGap("journal_missing")] };
}

export function appendJournal(profile: MetricsProfile, entries: readonly MetricsEvent[], gaps: readonly CoverageGap[], options: { operationClock?: boolean; importSpool?: boolean } = {}) {
  return withJournal(profile, true, (state) => {
    // A replay of an actual operation reuses its first local occurrence clock while holding the journal lock.
    const clockById = new Map(options.operationClock ? state.rows.map(row => [row.event_id, row.occurred_at] as const) : []);
    const validated = entries.map(entry => normalizeEvent({ ...entry,
      occurred_at: clockById.get(entry.event_id) ?? entry.occurred_at }, profile));
    const affected = new Set(validated.map(({ event_id }) => event_id));
    const priorRows = state.rows.filter(({ event_id }) => affected.has(event_id));
    const earliest = new Map<string, string>();
    for (const event of priorRows) {
      const key = projectionKey(event);
      const observed = timeKey(event.observed_at);
      const previous = earliest.get(key);
      if (previous === undefined || observed < previous) earliest.set(key, observed);
    }
    const contributions: MetricsEvent[] = [];
    let repeat = 0;
    for (const event of validated) {
      const key = projectionKey(event);
      const observed = timeKey(event.observed_at);
      const previous = earliest.get(key);
      if (previous !== undefined && observed >= previous) {
        repeat += 1;
      } else {
        earliest.set(key, observed);
        contributions.push(event);
      }
    }

    const checkedGaps = gaps.map((gap) => readGap(gap, profile));
    const knownGaps = new Set(options.importSpool ? state.gaps.map(gap => JSON.stringify(gap)) : []);
    const newGaps = checkedGaps.filter(gap => {
      if (!options.importSpool) return true;
      const key = JSON.stringify(gap);
      if (knownGaps.has(key)) return false;
      knownGaps.add(key);
      return true;
    });
    const legacyConflicts = new Set(state.gaps.flatMap(({ event_id }) => event_id && affected.has(event_id) ? [event_id] : []));
    const inferred = reconcileReceipts([...priorRows, ...contributions], legacyConflicts).gaps;
    // Both sanitized contributions remain available for historical reconciliation.
    appendLines(state.coverageFd!, state.coverageContents, newGaps, profile.spoolByteLimit);
    appendLines(state.fd, state.contents, contributions, profile.spoolByteLimit);
    return { appended: contributions.length, repeat, gaps: checkedGaps.length + legacyConflicts.size + inferred.length };
  }, options.importSpool ? coordinatorLock : "flock")!;
}
