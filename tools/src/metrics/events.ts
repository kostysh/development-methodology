import { createHmac, timingSafeEqual } from "node:crypto";
import type { MetricsProfile, MetricsSource } from "./profile.js";

export type MetricsEvent = {
  schema_version: 1;
  project_id: string;
  event_id: string;
  source_id: string;
  event_type: string;
  occurred_at: string | null;
  observed_at: string;
  actor_role: "operator" | "agent" | "automation" | "unknown";
  task_id: string | null;
  data: Record<string, string | number | boolean | null>;
};

export const sourceKey = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
export const issuedAlias = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
export const trainObservation = "train.observed";

export function isTrainSource(source: MetricsSource): boolean {
  return source.kind === "normalized" && source.task_id !== undefined;
}

export function recordObject(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

export function parseUtc(value: unknown): string | null {
  if (typeof value !== "string"
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/u.test(value)) return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)
      || new Date(instant).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return value;
}

export function timeKey(value: string): string {
  const [seconds, fraction = ""] = value.slice(0, -1).split(".");
  return seconds + fraction.padEnd(9, "0");
}

function digest(profile: MetricsProfile, ...parts: string[]): string {
  return createHmac("sha256", Buffer.from(profile.identityKey, "hex"))
    .update(JSON.stringify([profile.project_id, ...parts])).digest("hex").slice(0, 32);
}

export function mapIdentity(profile: MetricsProfile, namespace: string, verifiedId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,254}$/u.test(namespace) || typeof verifiedId !== "string" || !verifiedId || verifiedId.length > 1024) {
    throw new Error("invalid_identity");
  }
  const key = digest(profile, "alias", namespace, verifiedId);
  return `m_${key}_${digest(profile, "proof", key)}`;
}

export function isTrustedIdentity(value: unknown, profile: MetricsProfile): value is string {
  if (typeof value !== "string") return false;
  if (profile.issuedIds.has(value)) return true;
  const [, key, proof] = /^m_([a-f0-9]{32})_([a-f0-9]{32})$/u.exec(value) ?? [];
  return key !== undefined && timingSafeEqual(
    Buffer.from(proof, "hex"), Buffer.from(digest(profile, "proof", key), "hex"),
  );
}

const task = "issue_id worktree_id execution_started_at";
const thread = "session_id thread_id";
const delivery = "repo_id delivery_id head_sha";
const activity = "operation_id activity_type resource_id action_type";
const decision = "decision_id operation_id";
const audit = "audit_id prior_audit_id subject_id subject_type base_sha head_sha rewrite_id";
const test = "suite_id attempt_id checkout_sha worktree_id ci_job_id";
const ciRun = "repo_id run_id run_attempt head_sha";
const ciJob = `${ciRun} job_id`;
const review = `review_id ${thread} turn_id`;
const dispute = "dispute_id test_id criterion_id baseline_sha";
const trainMeasurements = [
  "queue_entries", "queue_wait_ms", "duration_ms", "full_suite_runs", "flaky_tests",
  "excluded_conflict", "excluded_test", "excluded_interaction", "excluded_dependency",
  "excluded_other", "excluded_unknown",
];
const fields: ReadonlyMap<string, string[]> = new Map(Object.entries({
  "task.started": `${task} ${thread}`,
  "task.accepted": task,
  "task.switched": `${thread} previous_task_id worktree_id`,
  "task.thread_bound": `${thread} worktree_id`,
  "pull_request.opened": delivery,
  "pull_request.merged": `${delivery} merge_sha`,
  "activity.started": activity,
  "activity.finished": `${activity} outcome`,
  "decision.requested": `${decision} blocking`,
  "decision.blocked": decision,
  "decision.resolved": `${decision} outcome`,
  "operator.intervened": "intervention_id intervention_type blocking decision_id",
  "audit.started": audit,
  "audit.finished": `${audit} outcome verdict`,
  "audit.finding.recorded": "audit_id finding_occurrence_id observation_id cause_id finding_type",
  "test.started": test,
  "test.finished": `${test} duration_ms outcome exit_code`,
  "ci.run.started": ciRun,
  "ci.run.finished": `${ciRun} outcome`,
  "ci.job.queued": ciJob,
  "ci.job.assigned": ciJob,
  "ci.job.started": ciJob,
  "ci.job.finished": `${ciJob} outcome`,
  "ci.step.finished": `${ciJob} step_number started_at outcome failure_code fixture_version`,
  "ref.rewritten": "repo_id ref_id old_sha new_sha operation_type",
  "context.compacted": `${thread} turn_id compaction_id trigger`,
  "task.state_changed": `operation_id action_type ${thread} turn_id compaction_id`,
  "session.forked": `${thread} source_thread_id source_turn_id`,
  "session.child_started": `${thread} parent_thread_id parent_turn_id`,
  "model.usage": `provider_id ${thread} turn_id root_turn_id parent_thread_id response_id model duration_ms input_tokens cached_input_tokens cache_write_input_tokens output_tokens reasoning_output_tokens`,
  "permission.review_started": review,
  "permission.review_finished": `${review} outcome`,
  "guard.activated": "control_id attempt_id operation_id head_sha outcome",
  "test.dispute_raised": dispute,
  "test.dispute_resolved": `${dispute} outcome`,
  [trainObservation]: `train_mode train_result ${trainMeasurements.join(" ")}`,
  "delivery.follow_up_classified": "delivery_id follow_up_id follow_up_at follow_up_basis change_type corrects_delivery",
}).map(([event, names]) => [event, names.split(" ")]));

export function isEventType(value: unknown): value is string {
  return typeof value === "string" && fields.has(value);
}

const fixedCategories = new Map<string, readonly string[]>([
  ["activity_type", ["operator", "agent", "machine"]],
  ["intervention_type", ["decision_request", "correction", "assignment", "status_question"]],
  ["audit.finished.outcome", ["completed", "failed", "cancelled"]],
  ["verdict", ["PASS", "FAIL", "BLOCKED"]],
  ["finding_type", ["a", "b", "c", "d"]],
  ["trigger", ["manual", "auto"]],
  ["follow_up_basis", ["verified_action", "pr_opened_proxy"]],
  ["train_mode", ["dry", "enabled"]],
  ["train_result", ["completed", "interrupted", "skipped"]],
]);

function valueFor(field: string, value: unknown, event: string, profile: MetricsProfile) {
  if (value === null) return null;
  if (field.endsWith("_id") && isTrustedIdentity(value, profile)) return value;
  if (field.endsWith("_sha") && typeof value === "string"
      && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(value)) return value.toLowerCase();
  if (field.endsWith("_at") && parseUtc(value)) return value as string;
  if ((field === "blocking" || field === "corrects_delivery") && typeof value === "boolean") return value;
  if (field === "exit_code" || field === "duration_ms" || field.endsWith("_tokens")
      || field === "run_attempt" || field === "step_number"
      || (event === trainObservation && trainMeasurements.includes(field))) {
    if (typeof value === "number" && Number.isSafeInteger(value) && (field === "exit_code" || value >= 0)) {
      return value;
    }
    throw new Error("invalid_event");
  }
  const categories = fixedCategories.get(`${event}.${field}`) ?? fixedCategories.get(field);
  if (categories) {
    if (typeof value === "string" && categories.includes(value)) return value;
  } else if (!field.endsWith("_id") && !field.endsWith("_sha") && !field.endsWith("_at")
      && field !== "blocking" && field !== "corrects_delivery"
      && typeof value === "string" && Object.hasOwn(profile.categories, field)
      && profile.categories[field].includes(value)) {
    return value;
  }
  throw new Error("invalid_event");
}

const envelope = new Set([
  "schema_version", "project_id", "event_id", "source_id", "event_type",
  "occurred_at", "observed_at", "actor_role", "task_id", "data",
]);

export function normalizeEvent(raw: unknown, profile: MetricsProfile): MetricsEvent {
  const input = recordObject(raw);
  if (!input || Object.keys(input).some((field) => !envelope.has(field))) throw new Error("invalid_event");
  const { source_id, event_type, event_id, task_id, actor_role } = input;
  const keys = typeof event_type === "string" ? fields.get(event_type) : undefined;
  const dataInput = recordObject(input.data);
  const occurred_at = parseUtc(input.occurred_at);
  const observed_at = parseUtc(input.observed_at);
  if (input.schema_version !== 1 || input.project_id !== profile.project_id
      || typeof source_id !== "string" || !Object.hasOwn(profile.sources, source_id)
      || !isTrustedIdentity(event_id, profile) || (task_id !== null && !isTrustedIdentity(task_id, profile))
      || (profile.sources[source_id].task_id !== undefined && task_id !== profile.sources[source_id].task_id)
      || (event_type === trainObservation && !isTrainSource(profile.sources[source_id]))
      || (!occurred_at && input.occurred_at !== null) || !observed_at
      || (actor_role !== "operator" && actor_role !== "agent" && actor_role !== "automation" && actor_role !== "unknown")
      || !keys || typeof event_type !== "string" || !dataInput
      || Object.keys(dataInput).some((field) => !keys.includes(field))) throw new Error("invalid_event");
  const data: MetricsEvent["data"] = {};
  for (const key of keys) {
    if (Object.hasOwn(dataInput, key)) data[key] = valueFor(key, dataInput[key], event_type, profile);
  }
  if (event_type === trainObservation) {
    const { train_mode, train_result, queue_entries, queue_wait_ms } = data;
    if (train_mode == null || train_result == null
        || (train_result === "skipped" && trainMeasurements.some(field => Object.hasOwn(data, field)))
        || ((queue_entries == null) !== (queue_wait_ms == null))
        || (queue_entries === 0 && queue_wait_ms !== 0)) throw new Error("invalid_event");
  }
  return {
    schema_version: 1, project_id: profile.project_id, event_id, source_id, event_type,
    occurred_at, observed_at, actor_role, task_id, data,
  };
}
