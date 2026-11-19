import assert from "node:assert/strict";
import test from "node:test";
import type { MetricsEvent } from "../src/metrics/events.ts";
import { summarize, type ReportCoverage } from "../src/metrics/report.ts";

const minute = 60_000;
const origin = Date.parse("2026-11-01T10:00:00Z");
const at = (minutes: number) => new Date(origin + minutes * minute).toISOString();
const oldHead = "a".repeat(40);
const newHead = "b".repeat(40);

function clock() {
  let occurrence = 0;
  const event = (
    event_type: string, minutes: number, data: MetricsEvent["data"],
    task_id: string | null = "T1", source_id = "synthetic",
  ): MetricsEvent => ({
    schema_version: 1, project_id: "bench", event_id: `e${++occurrence}`, source_id, event_type,
    occurred_at: at(minutes), observed_at: at(minutes), actor_role: "automation", task_id, data,
  });
  const start = () => event("task.started", 0, {
    issue_id: "I1", worktree_id: "deleted-worktree", session_id: "S1", thread_id: "main", execution_started_at: at(0),
  });
  const accept = () => event("task.accepted", 100, { issue_id: "I1", execution_started_at: at(0) });
  return { event, start, accept };
}

function coverage(event_types: string[], from = -10, through = 150, source_id = "synthetic"): ReportCoverage {
  return { source_id, event_types, from: at(from), through: at(through), status: "complete" };
}

test("lead and first PR use elapsed time, per-type unions, and actual decision blocks", () => {
  const { event, start, accept } = clock();
  const activity = (activity_type: string, operation_id: string, begins: number, ends: number) => {
    const data = { activity_type, operation_id, resource_id: "synthetic-resource" };
    return [event("activity.started", begins, data), event("activity.finished", ends, data)];
  };
  const args = { repo_id: "repo", run_id: "r1", run_attempt: 1, job_id: "j1", head_sha: oldHead };
  const resolved = event("decision.resolved", 70, { decision_id: "d1", operation_id: "op1", outcome: "yes" });
  resolved.observed_at = at(75);
  const events = [
    start(), accept(),
    event("pull_request.opened", -5, { repo_id: "repo", delivery_id: "earlier", head_sha: oldHead }),
    event("pull_request.opened", 60, { repo_id: "repo", delivery_id: "new", head_sha: newHead }),
    event("pull_request.opened", 80, { repo_id: "repo", delivery_id: "later", head_sha: newHead }),
    ...activity("operator", "o1", 0, 15),
    ...activity("agent", "a1", 10, 30),
    ...activity("agent", "a2", 20, 50),
    ...activity("machine", "m1", 30, 40),
    ...activity("machine", "m2", 35, 55),
    event("ci.job.started", 35, args), event("ci.job.finished", 45, { ...args, outcome: "success" }),
    event("decision.requested", 20, { decision_id: "d1", operation_id: "op1", blocking: true }),
    event("operator.intervened", 20, { decision_id: "d1", intervention_id: "int1", intervention_type: "decision_request", blocking: true }),
    event("decision.blocked", 40, { decision_id: "d1", operation_id: "op1" }),
    resolved,
    event("decision.requested", 75, { decision_id: "d2", operation_id: "op2", blocking: false }),
    event("decision.resolved", 76, { decision_id: "d2", operation_id: "op2", outcome: "yes" }),
  ];
  const proof = [coverage([
    "pull_request.opened", "activity.started", "activity.finished", "decision.blocked", "decision.resolved",
    "decision.requested", "operator.intervened", "ci.job.started", "ci.job.finished",
    "test.started", "test.finished", "model.usage",
  ])];
  const result = summarize({ events, gaps: [] }, "T1", at(110), proof);
  assert.deepEqual(result.pre_pr.calendar_ms, { status: "complete", value: 60 * minute });
  assert.equal(result.pre_pr.delivery_id, "new");
  assert.deepEqual(result.pre_pr.already_open_deliveries, [{ repo_id: "repo", delivery_id: "earlier" }]);
  assert.equal(result.pre_pr.activity.operator.duration_ms.value, 15 * minute);
  assert.equal(result.pre_pr.activity.agent.duration_ms.value, 40 * minute);
  assert.equal(result.pre_pr.activity.agent.summed_interval_ms.value, 50 * minute);
  assert.equal(result.pre_pr.activity.machine.duration_ms.value, 25 * minute);
  assert.equal(result.pre_pr.activity.machine.summed_interval_ms.value, 30 * minute);
  assert.equal(result.pre_pr.activity.operator_block.duration_ms.value, 20 * minute);
  assert.equal(result.pre_pr.cross_type_overlap_ms.value, 30 * minute);
  assert.equal(result.pre_pr.unexplained_ms.value, 0);
  assert.equal(result.lead_time.calendar_ms.value, 100 * minute);
  assert.equal(result.lead_time.activity.operator_block.duration_ms.value, 30 * minute);
  assert.equal(result.lead_time.unexplained_ms.value, 30 * minute);
  assert.deepEqual(result.interventions.total, { status: "complete", value: 2 });
  assert.equal(result.interventions.blocking.value, 1);
  assert.deepEqual(summarize({ events: events.toReversed(), gaps: [] }, "T1", at(110), proof), result);
});

test("distinguish source coverage, inferred remainder, missing intervals and observed-time estimates", () => {
  const { event, start, accept } = clock();
  const events = [start(), accept()];
  const types = ["decision.blocked", "decision.resolved"];
  const proof = [
    coverage(types),
    { ...coverage(["activity.started", "activity.finished"], 0, 100, "no-activity"), status: "not_applicable" as const },
  ];
  const withoutActivity = summarize({ events, gaps: [] }, "T1", at(100), proof);
  assert.deepEqual(withoutActivity.lead_time.activity.operator.duration_ms, { status: "not_applicable", value: null });
  assert.deepEqual(withoutActivity.lead_time.activity.operator_block.duration_ms, { status: "complete", value: 0 });
  assert.deepEqual(withoutActivity.tests.attempts, { status: "unavailable", value: null });
  assert.deepEqual(withoutActivity.observed_merge_windows, { status: "unavailable", value: null });
  const phase = { decision_id: "d1", operation_id: "o1" };
  events.push(event("decision.blocked", 0, phase), event("decision.resolved", 20, phase));
  events.push(event("decision.blocked", 40, { decision_id: "d2", operation_id: "o2" }));
  const gaps = [{ source_id: "synthetic", code: "source_changed", observed_at: at(65) }];
  const partial = summarize({ events, gaps }, "T1", at(100), proof);
  assert.deepEqual(partial.lead_time.activity.operator_block.duration_ms, { status: "partial", value: 20 * minute, lower_bound: true });
  assert.equal(partial.lead_time.activity.operator_block.open_intervals.value, 1);
  assert.deepEqual(partial.lead_time.unexplained_ms, { status: "partial", value: 80 * minute, upper_bound: true });
  events[3].occurred_at = null;
  const estimated = summarize({ events, gaps }, "T1", at(100), proof);
  assert.equal(estimated.lead_time.activity.operator_block.estimated, true);
  assert.equal(estimated.lead_time.unexplained_ms.upper_bound, undefined);
  const incompleteSecondSource = summarize({ events: [start(), accept()], gaps: [] }, "T1", at(100), [
    coverage(types), coverage(types, 1, 100, "second-source"),
  ]);
  assert.deepEqual(incompleteSecondSource.lead_time.activity.operator_block.duration_ms, { status: "unavailable", value: null });
});

test("usage follows its turn across switches, forks and child work without charging copied history", () => {
  const { event, start, accept } = clock();
  const session = { session_id: "S1", thread_id: "main" };
  const usage = (
    response_id: string | null, minutes: number, input_tokens: number, context: MetricsEvent["data"],
    task_id: string | null = null,
  ) => event("model.usage", minutes, {
    provider_id: "prov", ...session, response_id, model: "model_one",
    input_tokens, cached_input_tokens: input_tokens / 2, cache_write_input_tokens: 0,
    output_tokens: input_tokens / 2, reasoning_output_tokens: input_tokens / 2, ...context,
  }, task_id);
  const recovered = usage("R2", 20, 30, { turn_id: "middle" });
  const copied = { ...recovered, event_id: "copy", observed_at: at(44), data: {
    ...recovered.data, session_id: "S2", thread_id: "fork", private_marker: "sample-private-text",
  } };
  const events = [
    start(), accept(),
    event("task.state_changed", 10, { ...session, turn_id: "old", operation_id: "op1" }),
    event("context.compacted", 15, { ...session, turn_id: "old", compaction_id: "C1", trigger: "auto" }),
    usage("R1", 18, 10, { turn_id: "old" }),
    recovered, { ...recovered, event_id: "alternate", source_id: "reconciled-projection" },
    event("task.state_changed", 25, { ...session, turn_id: "resume", operation_id: "op2", compaction_id: "C1" }),
    event("context.compacted", 26, { ...session, turn_id: "old", compaction_id: "C2", trigger: "manual" }),
    event("task.switched", 30, { ...session, previous_task_id: "T1", worktree_id: "W2" }, "T2"),
    usage("ambiguous", 31, 86, { turn_id: "new-without-binding" }),
    event("task.state_changed", 32, { ...session, turn_id: "new", operation_id: "op3" }, "T2"),
    usage("R3", 35, 50, { turn_id: "old" }),
    usage("R4", 37, 62, { turn_id: "new" }),
    event("session.forked", 40, { session_id: "S2", thread_id: "fork", source_thread_id: "main", source_turn_id: "old" }, null),
    copied, usage("R5", 41, 70, { session_id: "S2", thread_id: "fork", turn_id: "own" }),
    event("session.child_started", 45, { session_id: "S3", thread_id: "child", parent_thread_id: "main", parent_turn_id: "old" }, null),
    usage("R6", 52, 90, { session_id: "S3", thread_id: "child", turn_id: "child-turn", root_turn_id: "old", parent_thread_id: "main" }),
    usage("R7", 53, 400, { turn_id: "old" }), usage("R7", 53, 800, { turn_id: "old" }),
    usage(null, 55, 1000, { turn_id: "old" }),
  ];
  const result = summarize({ events, gaps: [] }, "T1", at(100));
  assert.deepEqual(result.tokens.responses, { status: "partial", value: 5, lower_bound: true });
  assert.equal(result.tokens.input_tokens.value, 250);
  assert.equal(result.tokens.cached_input_tokens.value, 125);
  assert.equal(result.tokens.output_tokens.value, 125);
  assert.equal(result.tokens.reasoning_output_tokens.value, 125);
  assert.equal(result.tokens.by_model.length, 1);
  assert.equal(result.compactions.count.value, 2);
  assert.equal(result.compactions.recoveries[0].elapsed_ms, 10 * minute);
  assert.deepEqual(result.compactions.recoveries[0].usage.input_tokens, { status: "partial", value: 30, lower_bound: true });
  assert.equal(result.compactions.recoveries[1].first_state_change_at, null);
  assert.equal(summarize({ events, gaps: [] }, "T2", at(100)).tokens.input_tokens.value, 62);
  assert.doesNotMatch(JSON.stringify(result), /sample-private-text|deleted-worktree/);
});

test("audit observations and causes, CI reruns, stale HEAD tests and control attempts remain distinct", () => {
  const { event, start, accept } = clock();
  const audit = (audit_id: string, begin: number, outcome: string, verdict: string | null, head_sha: string, rewrite_id: string | null = null) => {
    const data = { audit_id, subject_type: "implementation", subject_id: "subject", base_sha: oldHead, head_sha, rewrite_id };
    return [event("audit.started", begin, data), event("audit.finished", begin + 2, { ...data, outcome, verdict })];
  };
  const rewrite = event("ref.rewritten", 45, { repo_id: "repo", ref_id: "ref", old_sha: oldHead, new_sha: newHead });
  const attempt = (attempt_id: string, checkout_sha: string, t1: number, t2: number, outcome: string) => {
    const data = { attempt_id, checkout_sha, worktree_id: "deleted-worktree", suite_id: "e2e", ci_job_id: "j1" };
    return [event("test.started", t1, data), event("test.finished", t2, { ...data, outcome, duration_ms: (t2 - t1) * minute })];
  };
  const tests = attempt("a1", oldHead, 30, 50, "cancelled");
  const run = (run_id: string, run_attempt: number, head_sha: string) => ({ repo_id: "repo", run_id, run_attempt, head_sha });
  const oldRun = run("r1", 1, oldHead);
  const retry = run("r1", 2, oldHead);
  const newRun = run("r2", 1, newHead);
  const retryJob = { ...retry, job_id: "j1" };
  const ciEvents = [
    event("ci.run.finished", 30, { ...oldRun, outcome: "failure" }),
    event("ci.run.finished", 51, { ...retry, outcome: "failure" }),
    event("ci.run.finished", 64, { ...newRun, outcome: "success" }),
    event("ci.job.queued", 35, retryJob),
    event("ci.job.started", 38, retryJob),
    event("ci.job.finished", 51, { ...retryJob, outcome: "failure" }),
    event("ci.job.started", 40, { ...retry, job_id: "j2" }),
    event("ci.job.finished", 50, { ...retry, job_id: "j2", outcome: "success" }),
    event("ci.step.finished", 49, { ...retryJob, step_number: 7, started_at: at(47), outcome: "failure", failure_code: "SECOND" }),
    event("ci.step.finished", 46, { ...retryJob, step_number: 3, started_at: at(39), outcome: "failure", failure_code: "FIRST", fixture_version: "f1" }),
  ];
  const finding = (audit_id: string, id: string, finding_type: string, observation_id: string, cause_id: string | null, minute: number) =>
    event("audit.finding.recorded", minute, { audit_id, finding_type, finding_occurrence_id: id, observation_id, cause_id });
  const firstFinding = finding("audit1", "f1", "a", "obs1", "c1", 15);
  const review = { review_id: "g1", session_id: "S1", thread_id: "main", turn_id: "guard-turn" };
  const guard = { control_id: "rule", attempt_id: "run", head_sha: oldHead, outcome: "blocked" };
  const dispute = { dispute_id: "d1", test_id: "test1", criterion_id: "criterion1", baseline_sha: oldHead };
  const events = [
    start(), accept(), rewrite, ...tests, { ...tests[1], event_id: "reported-again" }, ...attempt("a2", newHead, 53, 60, "success"),
    ...audit("audit1", 12, "completed", "FAIL", oldHead), ...audit("audit2", 20, "failed", null, oldHead),
    ...audit("audit3", 60, "completed", "PASS", newHead, rewrite.event_id),
    firstFinding, { ...firstFinding, observed_at: at(16) }, finding("audit3", "f2", "a", "obs1", "c1", 63),
    finding("audit3", "f3", "d", "obs2", null, 65),
    ...ciEvents,
    event("permission.review_started", 32, review), event("permission.review_finished", 34, { ...review, outcome: "approved" }),
    event("guard.activated", 38, guard), event("guard.activated", 38, guard),
    event("test.dispute_raised", 65, dispute), event("test.dispute_raised", 65, dispute),
    event("test.dispute_resolved", 67, { ...dispute, outcome: "upheld" }),
  ];
  const result = summarize({ events, gaps: [] }, "T1", at(100));
  assert.equal(result.audits.attempts.value, 3);
  assert.equal(result.audits.failed_attempts.value, 1);
  assert.equal(result.audits.completed_rounds.value, 2);
  assert.equal(result.audits.reviewed_snapshots.value, 2);
  assert.equal(result.audits.findings.occurrences.value, 3);
  assert.equal(result.audits.findings.observations.value, 2);
  assert.deepEqual(result.audits.findings.causes, { status: "partial", value: 1, lower_bound: true });
  assert.equal(result.audits.findings.by_type.a.value, 2);
  assert.equal(result.audits.findings.by_type.d.value, 1);
  assert.deepEqual(result.ref_rewrites.rows[0].matching_audit_ids, ["audit3"]);
  assert.equal(result.tests.attempts.value, 2);
  assert.equal(result.tests.cancelled_or_interrupted.value, 1);
  assert.deepEqual(result.tests.rows.map(row => row.checkout_sha), [oldHead, newHead]);
  assert.equal(result.ci.run_attempts.value, 3);
  assert.equal(result.ci.retries.value, 1);
  assert.equal(result.ci.machine_effort_ms.value, 23 * minute);
  assert.equal(result.ci.job_rows[0].queue_wait_ms, null);
  assert.equal(result.ci.job_rows[0].queue_wait_upper_bound_ms, 3 * minute);
  assert.deepEqual(result.ci.job_rows[0].first_observed_failing_step, { step_number: 3, failure_code: "FIRST", fixture_version: "f1" });
  assert.equal(result.permission_reviews.attempts.value, 1);
  assert.equal(result.permission_reviews.effort_ms.value, 2 * minute);
  assert.equal(result.guards.activations.value, 1);
  assert.equal(result.guards.blocks.value, 1);
  assert.equal(result.test_disputes.raised.value, 1);
  assert.equal(result.test_disputes.resolved.value, 1);
});

test("seven-day windows exclude the deadline, prefer verified first actions and keep proxies separate", () => {
  const { event, start, accept } = clock();
  const merge = 110;
  const deadline = merge + 168 * 60;
  const follow = (follow_up_id: string, followUpAt: number, follow_up_basis: string, corrects_delivery: boolean | null, observed = followUpAt) =>
    event("delivery.follow_up_classified", observed, {
      delivery_id: "PR1", follow_up_id, follow_up_basis, corrects_delivery,
      follow_up_at: at(followUpAt), change_type: "correction",
    }, "T2");
  const events = [
    start(), accept(), event("pull_request.merged", merge, { repo_id: "repo", delivery_id: "PR1", merge_sha: newHead }),
    follow("prior", merge - 1, "verified_action", true),
    follow("begin", merge, "verified_action", true),
    follow("choose", merge + 13, "pr_opened_proxy", true),
    follow("choose", merge + 5, "verified_action", true, deadline + 1),
    follow("proxy", deadline - 1, "pr_opened_proxy", true),
    follow("deadline", deadline, "verified_action", true),
    follow("later", deadline + 2, "verified_action", true),
    follow("routine", deadline - 3, "verified_action", false),
  ];
  const proof = [coverage(["pull_request.merged", "delivery.follow_up_classified"], merge, deadline)];
  const early = summarize({ events, gaps: [] }, "T1", at(deadline - 2), proof).seven_day_rework[0];
  assert.equal(early.open, true);
  assert.deepEqual(early.verified_actions, { status: "partial", value: 1, lower_bound: true });
  assert.deepEqual(early.pr_opened_proxies, { status: "partial", value: 1, lower_bound: true });
  const exact = summarize({ events, gaps: [] }, "T1", at(deadline + 2), proof).seven_day_rework[0];
  assert.equal(exact.open, false);
  assert.equal(exact.deadline, at(deadline));
  assert.deepEqual(exact.verified_actions, { status: "complete", value: 2 });
  assert.deepEqual(exact.pr_opened_proxies, { status: "complete", value: 1 });
  assert.deepEqual(exact.rows.map(row => row.follow_up_id).sort(), ["begin", "choose", "proxy"]);
  events.push(follow("unclassified", deadline - 5, "verified_action", null, deadline + 1));
  const partial = summarize({ events, gaps: [] }, "T1", at(deadline + 2), proof).seven_day_rework[0];
  assert.deepEqual(partial.verified_actions, { status: "partial", value: 2, lower_bound: true });
});

test("conflicting occurrence IDs are withheld and reported without event payloads", () => {
  const { event, start, accept } = clock();
  const first = event("activity.started", 0, { activity_type: "agent", resource_id: "r", operation_id: "op" });
  const privateContext = "private-message-marker";
  const finish = event("activity.finished", 40, {
    activity_type: "agent", resource_id: "r", operation_id: "op", rejected_extra: privateContext,
  });
  const conflicting = { ...finish, occurred_at: at(45) };
  const result = summarize({ events: [start(), accept(), first, finish, conflicting, finish], gaps: [] }, "T1", at(100));
  assert.equal(result.coverage.conflicting_occurrences, 1);
  assert.equal(result.lead_time.activity.agent.duration_ms.value, null);
  assert.equal(result.lead_time.activity.agent.open_intervals.value, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-message-marker/);
});

test("native compaction with a thread and no session can join the first state mutation", () => {
  const { event, start, accept } = clock();
  const compacted = event("context.compacted", 10, {
    session_id: null, thread_id: "main", turn_id: "compacting", compaction_id: "native-compact", trigger: "auto",
  }, null);
  const recovery = event("task.state_changed", 15, {
    session_id: "S1", thread_id: "main", turn_id: "resume", operation_id: "mutate",
  });
  const events = [start(), accept(), compacted, recovery];
  const summary = summarize({ events, gaps: [] }, "T1", at(100));
  assert.equal(summary.compactions.count.value, 1);
  assert.equal(summary.compactions.recoveries[0].compaction_id, "native-compact");
  assert.equal(summary.compactions.recoveries[0].elapsed_ms, 5 * minute);
  const sameName = event("task.thread_bound", 1, { session_id: "S2", thread_id: "main", worktree_id: "another" }, "T2");
  const ambiguous = summarize({ events: [...events, sameName], gaps: [] }, "T1", at(100));
  assert.equal(ambiguous.compactions.count.value, null);
});

test("job and step evidence identify CI attempts with a missing run lifecycle", () => {
  const { event, start, accept } = clock();
  const ids = { repo_id: "repo", run_id: "older-run", run_attempt: 2, job_id: "j1", head_sha: oldHead };
  const events = [
    start(), accept(), event("ci.job.started", 30, ids),
    event("ci.step.finished", 35, { ...ids, job_id: "j2", step_number: 1, outcome: "failure" }),
  ];
  const summary = summarize({ events, gaps: [] }, "T1", at(100));
  assert.deepEqual(summary.ci.run_attempts, { status: "partial", value: 1, lower_bound: true });
  assert.equal(summary.ci.retries.value, 1);
  assert.equal(summary.ci.jobs.value, 2);
  assert.deepEqual(summary.ci.runs[0], {
    repo_id: "repo", run_id: "older-run", run_attempt: 2, head_sha: oldHead, outcome: null,
  });
  assert.equal(summary.ci.job_rows[1].first_observed_failing_step?.step_number, 1);
  assert.equal(summary.ci.job_rows[1].occupied_ms, null);
});

test("runner and provider durations feed activity unions, while effort keeps its source totals", () => {
  const { event, start, accept } = clock();
  const attempt = { suite_id: "suite", attempt_id: "local-attempt", checkout_sha: oldHead };
  const job = { repo_id: "repo", run_id: "ci", run_attempt: 1, job_id: "job", head_sha: oldHead };
  const direct = { operation_id: "active-op", activity_type: "agent", resource_id: "agent-resource" };
  const response = event("model.usage", 15, {
    provider_id: "model-provider", response_id: "measured", duration_ms: 10 * minute,
    input_tokens: 10, cached_input_tokens: 0, output_tokens: 1,
  });
  const cold = event("model.usage", 6, {
    provider_id: "model-provider", response_id: "cold", duration_ms: 6 * minute,
    input_tokens: 12, cached_input_tokens: 0, output_tokens: 1,
  });
  cold.occurred_at = null;
  const events = [
    start(), accept(),
    event("pull_request.opened", 20, { repo_id: "repo", delivery_id: "new", head_sha: oldHead }),
    event("test.started", 7, attempt), event("test.finished", 17, { ...attempt, duration_ms: 10 * minute, outcome: "success" }),
    event("ci.job.started", 12, job), event("ci.job.finished", 22, { ...job, outcome: "success" }),
    event("activity.started", 10, direct), event("activity.finished", 18, direct),
    response, { ...response, event_id: "replayed-usage" }, cold,
  ];
  const result = summarize({ events, gaps: [] }, "T1", at(100));
  assert.deepEqual(result.pre_pr.activity.machine.duration_ms, { status: "partial", value: 13 * minute, lower_bound: true });
  assert.equal(result.lead_time.activity.machine.duration_ms.value, 15 * minute);
  assert.equal(result.pre_pr.activity.agent.duration_ms.value, 13 * minute);
  assert.equal(result.pre_pr.activity.agent.summed_interval_ms.value, 8 * minute);
  assert.equal(result.pre_pr.cross_type_overlap_ms.value, 11 * minute);
  assert.equal(result.pre_pr.known_union_ms.value, 15 * minute);
  assert.equal(result.tests.effort_ms.value, 10 * minute);
  assert.equal(result.ci.machine_effort_ms.value, 10 * minute);
  assert.equal(result.tokens.responses.value, 2);
});

test("a cold receipt or conflicting runner endpoints cannot establish an occupied interval", () => {
  const { event, start, accept } = clock();
  const receipt = event("model.usage", 10, {
    provider_id: "model-provider", response_id: "no-native-time", duration_ms: 3 * minute, input_tokens: 10,
  });
  receipt.occurred_at = null;
  const attempt = { suite_id: "suite", attempt_id: "local-attempt" };
  const events = [
    start(), accept(), receipt,
    event("test.started", 15, { ...attempt, checkout_sha: oldHead }),
    event("test.finished", 20, { ...attempt, checkout_sha: newHead, duration_ms: 5 * minute, outcome: "success" }),
  ];
  const proof = [coverage(["activity.started", "activity.finished", "model.usage", "ci.job.started", "ci.job.finished",
    "test.started", "test.finished"])];
  const result = summarize({ events, gaps: [] }, "T1", at(100), proof);
  assert.deepEqual(result.lead_time.activity.agent.duration_ms, { status: "partial", value: null });
  assert.deepEqual(result.lead_time.activity.machine.duration_ms, { status: "partial", value: null });
  assert.equal(result.tokens.responses.value, 1);
});

test("a hosted runner supplies measured occupancy when its parent job is missing", () => {
  const { event, start, accept } = clock();
  const attempt = { suite_id: "suite", attempt_id: "hosted", ci_job_id: "missing-job", checkout_sha: oldHead };
  const events = [start(), accept(),
    event("test.started", 7, attempt), event("test.finished", 12, { ...attempt, duration_ms: 5 * minute }),
    event("pull_request.opened", 20, { repo_id: "repo", delivery_id: "new", head_sha: oldHead })];
  const result = summarize({ events, gaps: [] }, "T1", at(100));
  assert.equal(result.pre_pr.activity.machine.duration_ms.value, 5 * minute);
});
