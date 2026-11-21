import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const binary = process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js", import.meta.url));
const { candidateCi, validateOwnerWorkflow } = await import(
  pathToFileURL(join(dirname(realpathSync(binary)), "train", "owner-ci.js")).href
);
const repository = "example/service";
const sha = "a".repeat(40);
const branch = "methodology-candidates/" + sha;
const workflow = { id: 8, path: ".github/workflows/test.yml", blob: "b".repeat(40),
  jobs: [{ name: "Linux", steps: ["Check", "Stack suite"] }] };

// Model the read-only Actions REST contract. Each response belongs to the exact route
// GitHub uses for that workflow, branch, candidate SHA and run attempt.
function fixture() {
  const blob = { type: "file", sha: workflow.blob };
  const run = { id: 23, run_attempt: 2, workflow_id: workflow.id, path: workflow.path, event: "push",
    head_branch: branch, head_sha: sha, status: "completed", conclusion: "success",
    repository: { full_name: repository }, head_repository: { full_name: repository } };
  const runs = [run];
  const job = { run_id: run.id, head_sha: sha, name: "Linux", status: "completed", conclusion: "success",
    steps: ["Check", "Stack suite"].map(name => ({ name, status: "completed", conclusion: "success" })) };
  const jobs = [job];
  const repo = (path: string) => "/repos/" + repository + "/" + path;
  const api = {
    repo,
    api(path: string) {
      assert.equal(path, repo("contents/.github/workflows/test.yml?ref=" + sha));
      return blob;
    },
    pages(path: string, key: string) {
      const url = new URL(path, "https://api.github.com");
      if (key === "workflow_runs") {
        assert.equal(url.pathname, repo("actions/workflows/8/runs"));
        assert.deepEqual(Object.fromEntries(url.searchParams), { event: "push", branch, head_sha: sha });
        return runs;
      }
      assert.equal(key, "jobs");
      assert.equal(url.pathname, repo("actions/runs/23/attempts/2/jobs"));
      return jobs;
    },
  };
  return { blob, run, runs, job, jobs, check: () => candidateCi(api, repository, branch, sha, [workflow]) };
}

test("accepts successful required jobs and steps for the exact push and links the verified attempt", () => {
  assert.deepEqual(validateOwnerWorkflow(workflow), workflow);
  assert.deepEqual(fixture().check(), { status: "pass", tests: [],
    runs: [{ id: 23, attempt: 2, workflow: 8, url: "https://github.com/example/service/actions/runs/23/attempts/2" }] });
});

test("waits for the candidate run and holds changed workflows, unrelated or ambiguous runs", () => {
  const notStarted = fixture();
  notStarted.runs.pop();
  assert.equal(notStarted.check().status, "pending");
  const running = fixture();
  running.run.status = "in_progress";
  assert.equal(running.check().status, "pending");
  for (const change of [
    { event: "pull_request" }, { head_branch: "main" }, { head_sha: "f".repeat(40) }, { workflow_id: 7 },
    { path: ".github/workflows/other.yml" }, { head_repository: { full_name: "fork/service" } },
    { repository: { full_name: "example/other" } },
  ]) {
    const f = fixture();
    Object.assign(f.run, change);
    assert.equal(f.check().status, "hold", JSON.stringify(change));
  }
  const drift = fixture();
  drift.blob.sha = "c".repeat(40);
  assert.equal(drift.check().status, "hold");
  const ambiguous = fixture();
  ambiguous.runs.push({ ...ambiguous.run, id: 24 });
  assert.equal(ambiguous.check().status, "hold");
});

test("a successful workflow cannot substitute for a missing, skipped, ambiguous or stale job or step", () => {
  const skipped = fixture();
  skipped.job.steps[1].conclusion = "skipped";
  assert.equal(skipped.check().status, "hold");
  const absent = fixture();
  absent.job.steps.pop();
  assert.equal(absent.check().status, "hold");
  const duplicate = fixture();
  duplicate.jobs.push({ ...duplicate.job });
  assert.equal(duplicate.check().status, "hold");
  const stale = fixture();
  stale.job.head_sha = "d".repeat(40);
  assert.equal(stale.check().status, "hold");
});

test("only an observed required step failure produces a diagnosable failure", () => {
  const f = fixture();
  f.run.conclusion = "failure";
  f.job.conclusion = "failure";
  f.job.steps[0].conclusion = "skipped";
  f.job.steps[1].conclusion = "skipped";
  assert.equal(f.check().status, "hold");
  f.job.steps[0].conclusion = "failure";
  assert.equal(f.check().status, "fail");
  assert.deepEqual(f.check().tests, ["8/Linux/Check"]);
  f.run.conclusion = "cancelled";
  assert.equal(f.check().status, "hold");
});

test("rejects incomplete or ambiguous workflow authorities", () => {
  for (const change of [
    { id: 0 }, { path: "../test.yml" }, { blob: "main" }, { jobs: [] },
    { jobs: [{ name: "Linux", steps: [] }] }, { jobs: [{ name: "Linux", steps: ["test", "test"] }] },
    { jobs: [...workflow.jobs, ...workflow.jobs] },
  ]) assert.throws(() => validateOwnerWorkflow({ ...workflow, ...change }));
  assert.equal(candidateCi({}, repository, "main", sha, [workflow]).status, "hold");
  assert.equal(candidateCi({}, repository, branch, sha, []).status, "hold");
});
