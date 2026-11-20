import { adaptGithub } from "./github.js";
import { mapIdentity, recordObject, type MetricsEvent } from "./events.js";
import { appendJournal, coverageGap } from "./journal.js";
import type { MetricsProfile } from "./profile.js";

// Query only the chosen PR, then jobs for workflow attempts on its actual head.
// Recheck the head after pagination before accepting the observation.
export async function syncGithub(profile: MetricsProfile, source: string, repo: string, pr: string) {
  const config = profile.sources[source];
  if (!config?.task_id || config.kind !== "github_jobs" || !/^[\w.-]+\/[\w.-]+$/u.test(repo) ||
      repo.split("/").some(part => part === "." || part === "..") || !/^[1-9]\d{0,14}$/u.test(pr)) throw new Error("invalid_arguments");
  const observedAt = new Date().toISOString();
  const events: MetricsEvent[] = [];
  const gaps: ReturnType<typeof coverageGap>[] = [];
  const context = { projectId: profile.project_id, sourceId: source, taskId: config.task_id, observedAt,
    alias: (ns: string, value: string) => mapIdentity(profile, ns, value),
    category: (name: string, value: unknown) => typeof value === "string" && profile.categories[name]?.includes(value) ? value : null,
    reportGap: (code: string) => gaps.push(coverageGap(code, source, observedAt)) };
  const get = async (path: string) => {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GH_TOKEN) headers.Authorization = "Bearer " + process.env.GH_TOKEN;
    const res = await fetch("https://api.github.com/repos/" + repo + path, { headers, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error();
    const row = recordObject(await res.json());
    if (!row) throw new Error();
    return row;
  };
  async function* pages(path: string, field: string) {
    let total = 0;
    for (let page = 1; page <= 100; page++) {
      const row = await get(path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page);
      const values = row[field];
      if (!Array.isArray(values)) throw new Error();
      for (const value of values) { const item = recordObject(value); if (!item) throw new Error(); yield item; }
      total += values.length;
      if (values.length < 100) {
        if (typeof row.total_count === "number" && total < row.total_count) throw new Error();
        return;
      }
    }
    throw new Error();
  }
  try {
    const repository = await get("");
    const pull_request = await get("/pulls/" + pr);
    const head = recordObject(pull_request.head)?.sha;
    if (typeof head !== "string" || !/^[a-f0-9]{40,64}$/u.test(head)) throw new Error();
    // A REST read establishes the PR timestamps and merge commit. Its current
    // head does not establish which revision the original lifecycle event saw.
    const snapshot = { number: pull_request.number, created_at: pull_request.created_at,
      merged: pull_request.merged, merged_at: pull_request.merged_at, merge_commit_sha: pull_request.merge_commit_sha };
    for (const action of ["opened", "closed"]) {
      events.push(...adaptGithub("github_webhook", { repository, pull_request: snapshot, action }, context));
    }
    // GitHub can clear run.pull_requests after merge. The same producer repository,
    // branch and exact head are eligible if GitHub links that head to this PR alone.
    const headRef = recordObject(pull_request.head);
    const headRepo = recordObject(headRef?.repo)?.id;
    let uniqueHead: boolean | undefined;
    async function linkedHead() {
      if (uniqueHead === undefined) {
        const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
        if (process.env.GH_TOKEN) headers.Authorization = "Bearer " + process.env.GH_TOKEN;
        const response = await fetch("https://api.github.com/repos/" + repo + "/commits/" + head + "/pulls?per_page=100",
          { headers, redirect: "error", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error();
        const linked: unknown = await response.json();
        uniqueHead = Array.isArray(linked) && !response.headers.get("link")?.includes('rel="next"') &&
          linked.length === 1 && recordObject(linked[0])?.number === Number(pr);
      }
      return uniqueHead;
    }
    for await (const run of pages("/actions/runs?head_sha=" + head, "workflow_runs")) {
      const pulls = run.pull_requests;
      if (run.head_sha !== head || !Array.isArray(pulls)) continue;
      const direct = pulls.some(p => recordObject(p)?.number === Number(pr));
      if (!direct && (pulls.length || run.head_branch !== headRef?.ref || !headRepo ||
          recordObject(run.head_repository)?.id !== headRepo || !await linkedHead())) continue;
      if (!Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt)) throw new Error();
      for (let attempt = 1; attempt <= Number(run.run_attempt); attempt++) {
        const path = "/actions/runs/" + run.id + "/attempts/" + attempt;
        const revision = await get(path);
        if (revision.id !== run.id || revision.head_sha !== head || revision.run_attempt !== attempt) throw new Error();
        events.push(...adaptGithub("github_webhook", { repository, workflow_run: revision, action: "in_progress" }, context));
        if (revision.status === "completed") events.push(...adaptGithub("github_webhook",
          { repository, workflow_run: revision, action: "completed" }, context));
        for await (const job of pages(path + "/jobs", "jobs")) {
          if ((job.run_attempt !== undefined && job.run_attempt !== attempt) || job.head_sha !== head || job.run_id !== run.id) throw new Error();
          events.push(...adaptGithub("github_jobs", { repository, jobs: [{ ...job, run_attempt: attempt }] }, context));
        }
      }
    }
    if (recordObject((await get("/pulls/" + pr)).head)?.sha !== head) throw new Error();
  } catch {
    appendJournal(profile, [], [coverageGap("github_sync_failed", source, observedAt)]);
    return 1;
  }
  return appendJournal(profile, events, gaps).gaps ? 1 : 0;
}
