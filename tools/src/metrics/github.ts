import type { AdapterContext } from "./adapters.js";
import { parseUtc, recordObject, type MetricsEvent } from "./events.js";

// Numeric GitHub IDs can arrive as strings in a local export.
function githubId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d{0,19}$/u.test(value)) return value;
}

function oid(value: unknown): string | null {
  return typeof value === "string" && /^(?:[a-f\d]{40}|[a-f\d]{64})$/iu.test(value)
    && !/^0+$/u.test(value) ? value.toLowerCase() : null;
}

const conclusions = new Set(["success", "failure", "cancelled", "neutral", "skipped",
  "timed_out", "action_required", "stale", "startup_failure"]);

export function adaptGithub(kind: string, raw: unknown, ctx: AdapterContext): MetricsEvent[] {
  const input = recordObject(raw);
  const body = recordObject(input?.payload) ?? input;
  const repo = githubId(recordObject(body?.repository)?.id);
  const events: MetricsEvent[] = [];
  if (!body || !repo) {
    ctx.reportGap?.("github_missing_repository");
    return events;
  }
  const repo_id = ctx.alias("github.repo", repo);
  const alias = (field: string, key: string) => ctx.alias(`github.${field}`, `${repo}:${key}`);
  function emit(type: string, key: string, time: unknown, data: MetricsEvent["data"]) {
    events.push({
      schema_version: 1, project_id: ctx.projectId, source_id: ctx.sourceId,
      event_id: ctx.alias(`event.${type}`, `${repo}:${key}`), event_type: type,
      occurred_at: parseUtc(time), observed_at: ctx.observedAt, actor_role: "automation",
      task_id: ctx.taskId ?? null, data: { repo_id, ...data },
    });
  }
  function outcome(value: unknown) {
    if (typeof value === "string" && conclusions.has(value)) {
      const accepted = ctx.category?.("outcome", value);
      if (accepted) return accepted;
    }
    ctx.reportGap?.("github_unknown_conclusion");
    return null;
  }
  function jobEvents(value: unknown, action?: unknown) {
    const job = recordObject(value);
    const jobKey = githubId(job?.id);
    const runKey = githubId(job?.run_id);
    const attempt = job?.run_attempt;
    if (!job || !jobKey || !runKey || typeof attempt !== "number"
        || !Number.isSafeInteger(attempt) || attempt < 1) {
      ctx.reportGap?.("github_missing_job_identity");
      return;
    }
    const key = `${runKey}:${attempt}:${jobKey}`;
    const data = { run_id: alias("run", runKey), run_attempt: attempt,
      job_id: alias("job", jobKey), head_sha: oid(job.head_sha) };
    if (action === "queued") emit("ci.job.queued", key, ctx.occurredAt, data);
    if (parseUtc(job.started_at)) emit("ci.job.started", key, job.started_at, data);
    if (job.status === "completed" || action === "completed") {
      emit("ci.job.finished", key, job.completed_at, { ...data, outcome: outcome(job.conclusion) });
    }
    // An assigned runner ID on a finished job gives no assignment time.
    if (!Array.isArray(job.steps)) return;
    for (const row of job.steps) {
      const step = recordObject(row);
      if (step?.status !== "completed") continue;
      const n = step.number;
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) {
        ctx.reportGap?.("github_missing_step_identity");
        continue;
      }
      emit("ci.step.finished", `${key}:${n}`, step.completed_at, {
        ...data, step_number: n, started_at: parseUtc(step.started_at), outcome: outcome(step.conclusion),
      });
    }
  }
  if (kind === "github_jobs") {
    if (Array.isArray(body.jobs)) {
      for (const job of body.jobs) jobEvents(job);
      if (typeof body.total_count === "number" && body.total_count > body.jobs.length) {
        ctx.reportGap?.("github_incomplete_jobs_page");
      }
    } else ctx.reportGap?.("github_missing_jobs");
    return events;
  }
  if (kind !== "github_webhook") return events;
  if (body.workflow_job) {
    jobEvents(body.workflow_job, body.action);
  } else if (body.workflow_run) {
    const run = recordObject(body.workflow_run);
    const id = githubId(run?.id);
    const attempt = run?.run_attempt;
    if (!run || !id || typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 1) {
      ctx.reportGap?.("github_missing_run_identity");
      return events;
    }
    const key = `${id}:${attempt}`;
    const data = { run_id: alias("run", id), run_attempt: attempt, head_sha: oid(run.head_sha) };
    if (body.action === "in_progress") emit("ci.run.started", key, run.run_started_at, data);
    if (body.action === "completed") {
      // updated_at is a record update, not a documented execution finish time.
      emit("ci.run.finished", key, ctx.occurredAt, { ...data, outcome: outcome(run.conclusion) });
    }
  } else if (body.pull_request) {
    const pr = recordObject(body.pull_request);
    const id = githubId(pr?.number ?? body.number);
    if (!pr || !id) {
      ctx.reportGap?.("github_missing_delivery_identity");
      return events;
    }
    const data = { delivery_id: alias("pr", id), head_sha: oid(recordObject(pr.head)?.sha) };
    if (body.action === "opened") emit("pull_request.opened", id, pr.created_at, data);
    if (body.action === "closed" && pr.merged === true) {
      emit("pull_request.merged", id, pr.merged_at, { ...data, merge_sha: oid(pr.merge_commit_sha) });
    }
  } else if (body.forced === true) {
    const old_sha = oid(body.before);
    const new_sha = oid(body.after);
    const ref = body.ref;
    const delivery = input?.delivery_id;
    // Local webhook archives may retain X-GitHub-Delivery separately from the payload.
    const key = typeof delivery === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(delivery)
      ? delivery.toLowerCase() : ctx.occurrenceId;
    if (old_sha && new_sha && old_sha !== new_sha && typeof ref === "string"
        && /^refs\/(?:heads|tags)\/[^\s\x00-\x1f]{1,900}$/u.test(ref) && key) {
      emit("ref.rewritten", key, ctx.occurredAt, {
        ref_id: alias("ref", ref), old_sha, new_sha,
        operation_type: ctx.category?.("operation_type", "force_push") ?? null,
      });
    } else ctx.reportGap?.("github_missing_rewrite_identity");
  }
  return events;
}
