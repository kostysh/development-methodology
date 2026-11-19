import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AdapterContext } from "../src/metrics/adapters.ts";
import { adaptGithub } from "../dist/metrics/github.js";

const start = "2026-11-19T15:00:00Z";
const end = "2026-11-19T15:01:05Z";
const sha = "a".repeat(40);
const repository = { id: 408, full_name: "private-owner/private-project" };
const job = {
  id: 12, run_id: 3, run_attempt: 2, head_sha: sha, runner_id: 508, status: "completed",
  started_at: start, completed_at: end, conclusion: "failure", runner_name: "secret-runner",
  steps: [{ number: 1, name: "private step", status: "completed", conclusion: "failure",
    started_at: start, completed_at: end }],
};

function context(gaps: string[] = []): AdapterContext {
  return { projectId: "test-project", sourceId: "actions", observedAt: end, taskId: "task1",
    alias: (field, val) => createHash("sha256").update(field + ":" + val).digest("hex"),
    category: (_field, value) => typeof value === "string" ? value : null,
    reportGap: (code) => gaps.push(code) };
}

test("REST and webhook identify the same job attempt and steps without inventing assignment", () => {
  const jobs = adaptGithub("github_jobs", { repository, jobs: [job], total_count: 1 }, context());
  const hook = adaptGithub("github_webhook", { repository, workflow_job: job, action: "completed" }, context());
  assert.deepEqual(jobs, hook);
  assert.deepEqual(jobs.map(e => e.event_type), ["ci.job.started", "ci.job.finished", "ci.step.finished"]);
  assert.equal(jobs[2].data.step_number, 1);
  assert.equal(jobs[2].data.outcome, "failure");
  assert.equal(jobs[0].data.run_attempt, 2);
  assert.equal(jobs[0].task_id, "task1");
  assert.doesNotMatch(JSON.stringify(jobs), /private|secret-runner/u);
  const later = adaptGithub("github_jobs", { repository, jobs: [{ ...job, run_attempt: 3 }] }, context());
  assert.notEqual(later[0].event_id, jobs[0].event_id);
  const gaps: string[] = [];
  adaptGithub("github_jobs", { repository, jobs: [job], total_count: 2 }, context(gaps));
  assert.deepEqual(gaps, ["github_incomplete_jobs_page"]);
});

test("queue and run timestamps use the observed transition; a record update cannot prove finish time", () => {
  const queued = { ...job, status: "queued", started_at: null, completed_at: null, created_at: start, steps: [] };
  const result = adaptGithub("github_webhook", { repository, action: "queued", workflow_job: queued }, context());
  assert.deepEqual(result.map(e => [e.event_type, e.occurred_at]), [["ci.job.queued", null]]);
  const run = { id: 3, run_attempt: 2, head_sha: sha, run_started_at: start,
    updated_at: end, conclusion: "cancelled" };
  const hook = { repository, action: "completed", workflow_run: run };
  const [completed] = adaptGithub("github_webhook", hook, context());
  assert.equal(completed.data.outcome, "cancelled");
  assert.equal(completed.occurred_at, null);
  const timed = adaptGithub("github_webhook", hook, { ...context(), occurredAt: end });
  assert.equal(timed[0].occurred_at, end);
});

test("delivery timestamps follow actual PR transitions and normal pushes do not count as ref rewrites", () => {
  const pr = { number: 42, created_at: start, merged_at: end, head: { sha }, merged: true,
    merge_commit_sha: "b".repeat(40), title: "confidential", body: "confidential", url: "private" };
  const [opened] = adaptGithub("github_webhook", { repository, action: "opened", pull_request: pr }, context());
  const [merged] = adaptGithub("github_webhook", { repository, action: "closed", pull_request: pr }, context());
  assert.equal(opened.data.delivery_id, merged.data.delivery_id);
  assert.equal(merged.occurred_at, end);
  assert.notEqual(merged.event_id, opened.event_id);
  assert.doesNotMatch(JSON.stringify(merged), /confidential|private/u);
  assert.deepEqual(adaptGithub("github_webhook", { repository, action: "closed", pull_request: { ...pr, merged: false } }, context()), []);
  const push = { repository, forced: true, before: sha, after: "b".repeat(40), ref: "refs/heads/private-branch" };
  const wrapped = { payload: push, delivery_id: "01234567-1234-4abc-8012-123456789012" };
  const first = adaptGithub("github_webhook", wrapped, context());
  assert.equal(first.length, 1);
  assert.equal(first[0].event_type, "ref.rewritten");
  assert.deepEqual(adaptGithub("github_webhook", wrapped, context()), first);
  assert.doesNotMatch(JSON.stringify(first), /private-branch/u);
  assert.deepEqual(adaptGithub("github_webhook", { ...push, forced: false }, context()), []);
  const gaps: string[] = [];
  assert.deepEqual(adaptGithub("github_webhook", push, context(gaps)), []);
  assert.deepEqual(gaps, ["github_missing_rewrite_identity"]);
});
