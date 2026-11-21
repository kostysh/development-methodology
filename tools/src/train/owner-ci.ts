import type { WorkflowAuthority } from "./config.js";
import type { GitHub } from "./github.js";

type Requirement = { name: string; steps: string[] };
export type OwnerWorkflow = Pick<WorkflowAuthority, "id" | "path" | "blob"> & { jobs: Requirement[] };
type RunLink = { id: number; attempt: number; workflow: number; url: string };
export type CandidateCi = {
  status: "pending" | "pass" | "fail" | "hold";
  runs: RunLink[];
  tests: string[];
  detail?: string;
};
type Reader = Pick<GitHub, "api" | "pages" | "repo">;
type Run = {
  id: number; run_attempt: number; workflow_id: number; path: string; event: string;
  head_branch: string; head_sha: string; status: string; conclusion: string | null;
  repository: { full_name: string }; head_repository: { full_name: string } | null;
};
type Step = { name: string; status: string; conclusion: string | null };
type Job = Step & { head_sha: string; run_id: number; steps: Step[] };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function name(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[\x00-\x1f\x7f]/u.test(value);
}
function unique(values: string[]) {
  return new Set(values).size === values.length;
}

export function validateOwnerWorkflow(value: unknown): OwnerWorkflow {
  if (!record(value) || !positive(value.id) || typeof value.path !== "string" ||
      !/^\.github\/workflows\/[a-zA-Z0-9._-]+\.ya?ml$/.test(value.path) ||
      typeof value.blob !== "string" || !/^[a-f0-9]{40}$/.test(value.blob) ||
      !Array.isArray(value.jobs) || !value.jobs.length)
    throw new Error("Specify a pinned candidate workflow and its required jobs");
  const jobs = value.jobs.map((job: unknown) => {
    if (!record(job) || !name(job.name) || !Array.isArray(job.steps) || !job.steps.length ||
        !job.steps.every(name) || !unique(job.steps))
      throw new Error("Specify uniquely named required steps for every candidate job");
    return { name: job.name, steps: job.steps as string[] };
  });
  if (!unique(jobs.map(job => job.name))) throw new Error("Duplicate required candidate job");
  return { id: value.id, path: value.path, blob: value.blob, jobs };
}

// The caller publishes this exact immutable candidate ref only after checking the trusted
// workflow and trigger surface. A push can start jobs before their results become readable.
export function candidateCi(api: Reader, repository: string, branch: string, sha: string,
  workflows: OwnerWorkflow[]): CandidateCi {
  const runs: RunLink[] = [];
  const tests: string[] = [];
  const result = (status: CandidateCi["status"], detail?: string): CandidateCi =>
    ({ status, runs, tests, ...(detail ? { detail } : {}) });
  if (!/^[a-f0-9]{40}$/.test(sha) || branch !== "methodology-candidates/" + sha || !workflows.length)
    return result("hold", "Candidate SHA, candidate ref or required workflows missing or invalid");
  const repo = repository.toLowerCase();
  for (const w of workflows) {
    const blob = api.api<{ type: string; sha: string }>(api.repo("contents/" + w.path + "?ref=" + sha));
    if (blob?.type !== "file" || blob.sha !== w.blob) return result("hold", "Unapproved workflow blob: " + w.path);
    const query = new URLSearchParams({ event: "push", branch, head_sha: sha });
    const rows = api.pages<Run>(api.repo("actions/workflows/" + w.id + "/runs?" + query), "workflow_runs");
    if (!rows.length) return result("pending", "Waiting for candidate workflow " + w.path);
    if (rows.length !== 1) return result("hold", "Ambiguous push runs for " + w.path);
    const run = rows[0];
    if (!positive(run.id) || !positive(run.run_attempt) || run.workflow_id !== w.id || run.path !== w.path ||
        run.event !== "push" || run.head_sha !== sha || run.head_branch !== branch ||
        run.repository?.full_name?.toLowerCase() !== repo || run.head_repository?.full_name?.toLowerCase() !== repo)
      return result("hold", "Candidate workflow run identity mismatch: " + w.path);
    runs.push({ id: run.id, attempt: run.run_attempt, workflow: w.id,
      url: "https://github.com/" + repository + "/actions/runs/" + run.id + "/attempts/" + run.run_attempt });
    if (run.status !== "completed") return result("pending", "Waiting for candidate run " + run.id);
    if (run.conclusion !== "success" && run.conclusion !== "failure")
      return result("hold", "Candidate run " + run.id + " concluded " + run.conclusion);
    const jobs = api.pages<Job>(api.repo("actions/runs/" + run.id + "/attempts/" + run.run_attempt + "/jobs"), "jobs");
    const failed: string[] = [];
    const missing: string[] = [];
    for (const required of w.jobs) {
      const matches = jobs.filter(j => j.name === required.name);
      if (matches.length !== 1 || matches[0].head_sha !== sha || matches[0].run_id !== run.id)
        return result("hold", "Required candidate job missing, ambiguous or stale: " + required.name);
      const job = matches[0];
      if (job.status !== "completed" || job.conclusion !== "success") missing.push(required.name);
      for (const label of required.steps) {
        const steps = job.steps?.filter(s => s.name === label) ?? [];
        const id = w.id + "/" + required.name + "/" + label;
        if (steps.length !== 1 || steps[0].status !== "completed") missing.push(id);
        else if (steps[0].conclusion === "failure" && job.conclusion === "failure" && job.status === "completed") failed.push(id);
        else if (steps[0].conclusion !== "success") missing.push(id);
      }
    }
    if (run.conclusion === "failure" && failed.length) tests.push(...failed);
    else if (run.conclusion !== "success" || missing.length || failed.length)
      return result("hold", "Candidate run " + run.id + " lacks successful required evidence: " + missing.concat(failed).join(", "));
  }
  return result(tests.length ? "fail" : "pass");
}
