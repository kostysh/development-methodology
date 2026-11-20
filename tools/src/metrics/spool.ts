import { spawnSync } from "node:child_process";
import { closeSync, constants, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { mapIdentity, normalizeEvent, timeKey, type MetricsEvent } from "./events.js";
import { appendJournal, spoolReceipts } from "./journal.js";
import type { MetricsProfile } from "./profile.js";

// Agent observations can describe work and waits. The owner supplies acceptance,
// operator actions, audit verdicts, and confirmed decisions on independent sources.
const required = new Map<string, string[]>(Object.entries({
  "task.started": [], "task.state_changed": ["operation_id"],
  "activity.started": ["operation_id", "activity_type"], "activity.finished": ["operation_id", "activity_type"],
  "decision.requested": ["decision_id", "blocking"], "decision.blocked": ["decision_id", "operation_id"],
  "decision.resolved": ["decision_id", "operation_id"],
  "audit.started": ["audit_id"], "audit.finished": ["audit_id", "outcome"],
  "audit.finding.recorded": ["audit_id", "finding_occurrence_id", "finding_type"],
  "test.started": ["attempt_id", "suite_id"], "test.finished": ["attempt_id", "suite_id", "duration_ms"],
  "test.dispute_raised": ["dispute_id"], "test.dispute_resolved": ["dispute_id"],
  "ref.rewritten": ["ref_id", "old_sha", "new_sha"],
}));

export function checkObservation(event: MetricsEvent, source: string, task: string, now: string) {
  const fields = required.get(event.event_type);
  if (!fields || event.task_id !== task || event.source_id !== source ||
      (event.actor_role !== "agent" && event.actor_role !== "automation") ||
      event.data.activity_type === "operator" || event.data.verdict != null ||
      // Provider binding and CI correlation come from their independently configured sources.
      ["session_id", "thread_id", "turn_id", "compaction_id", "ci_job_id"].some(key => event.data[key] != null) ||
      !event.occurred_at || timeKey(event.occurred_at) > timeKey(event.observed_at) ||
      timeKey(event.observed_at) > timeKey(now) ||
      Object.entries(event.data).some(([key, value]) => key.endsWith("_at") && typeof value === "string" && timeKey(value) > timeKey(event.observed_at)) ||
      fields.some(key => event.data[key] == null)) throw new Error("invalid_spool_observation");
}

// Open the one configured directory without following workspace links. Keep the
// descriptor pinned while journal code opens both regular files under it (Linux).
export function withSpool<T>(profile: MetricsProfile, source: string, writing: boolean, work: (storage: MetricsProfile) => T): T {
  const config = profile.sources[source];
  if (config?.kind !== "operation_spool" || !config.task_id) throw new Error("invalid_arguments");
  const name = "operation-spool-" + mapIdentity(profile, "spool", JSON.stringify([source, config.task_id])) + ".jsonl";
  const root = openSync(profile.projectRoot, constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const directory = `/proc/self/fd/${root}/.methodology`;
    if (writing) {
      const paths = [name, name + ".coverage.jsonl"].map(file => ".methodology/" + file);
      for (const path of paths) {
        if (spawnSync("git", ["check-ignore", "--quiet", "--", path], { cwd: profile.projectRoot, timeout: 5000 }).status !== 0) {
          throw new Error("spool_ignore_required");
        }
      }
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    const dir = openSync(directory, constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { return work({ ...profile, spoolByteLimit: 2 * 1024 * 1024, journal: join("/proc/self/fd", String(dir), name) }); }
    finally { closeSync(dir); }
  } finally { closeSync(root); }
}

export function importSpool(profile: MetricsProfile, source: string) {
  return withSpool(profile, source, false, storage => {
    const input = spoolReceipts(storage);
    if (!input) throw new Error("spool_unavailable");
    const now = new Date().toISOString();
    if (input.gaps.some(gap => !["git_rewrite_unverified", "test_coverage_gap"].includes(gap.code) ||
        gap.source_id !== source || timeKey(gap.observed_at) > timeKey(now))) throw new Error("invalid_spool_observation");
    const task = profile.sources[source].task_id!;
    const events = input.rows.map(row => {
      checkObservation(row, source, task, now);
      // A file editor cannot choose the ID of an existing trusted receipt.
      const id = mapIdentity(profile, "spool.receipt", JSON.stringify([source, task, row.event_type, row.event_id]));
      return normalizeEvent({ ...row, event_id: id, observed_at: now }, profile);
    });
    return appendJournal(profile, events, input.gaps, { importSpool: true });
  });
}
