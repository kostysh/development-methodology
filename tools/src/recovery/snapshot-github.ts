import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { recordObject } from "../metrics/events.js";

export type GithubSelection = { repository: string; issue?: number; pr?: number; run?: number };
type LocalHead = { branch: string | null; head_oid: string | null };

const repositoryName = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u;
const runStates = new Set(["requested", "pending", "waiting", "queued", "in_progress", "completed"]);
const conclusions = new Set(["success", "failure", "cancelled", "neutral", "skipped", "timed_out",
  "action_required", "stale", "startup_failure"]);

function api(cwd: string, endpoint: string): Record<string, unknown> | undefined {
  const result = spawnSync("gh", ["api", "--hostname", "github.com", "--method", "GET", endpoint], {
    cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 2_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, PATH: process.env.PATH?.split(":").filter(isAbsolute).join(":") || "/usr/bin:/bin",
      GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1", GH_DEBUG: "" },
  });
  if (result.status !== 0 || result.error) return undefined;
  try {
    return recordObject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.stdout)));
  } catch {
    return undefined;
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function repository(value: unknown) {
  const object = recordObject(value);
  const name = object?.full_name;
  const id = positiveInteger(object?.id);
  return typeof name === "string" && repositoryName.test(name) && id !== null ? { name, id } : null;
}

function oid(value: unknown): string | null {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value) && /[1-9a-f]/u.test(value)
    ? value : null;
}

function branch(value: unknown): string | null {
  if (typeof value !== "string" || /[\x00-\x20\x7f~^:?*\[\\]|\.\.|@\{/u.test(value)
      || value === "@" || value.endsWith(".")
      || value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) return null;
  return value;
}

function headFacts(repo: unknown, ref: unknown, sha: unknown) {
  const source = repository(repo);
  return { repository: source?.name ?? null, repository_id: source?.id ?? null, ref: branch(ref), oid: oid(sha) };
}

function matchesLocal(head: ReturnType<typeof headFacts>, local: LocalHead): boolean | null {
  if ((head.ref !== null && local.branch !== null && head.ref !== local.branch)
      || (head.oid !== null && local.head_oid !== null && head.oid !== local.head_oid)) return false;
  return head.repository !== null && head.ref !== null && head.oid !== null
    && local.branch !== null && local.head_oid !== null ? true : null;
}

function issueState(state: unknown): "open" | "closed" | null {
  return state === "open" || state === "closed" ? state : null;
}

function readIssue(cwd: string, endpoint: string, number: number, gaps: string[]) {
  const issue = api(cwd, `${endpoint}/issues/${number}`);
  if (issue?.number !== number || issue.pull_request !== undefined || typeof issue.repository_url !== "string"
      || issue.repository_url.toLowerCase() !== `https://api.github.com/${endpoint}`.toLowerCase()) {
    gaps.push("github.issue.identity");
    return null;
  }
  const state = issueState(issue.state);
  if (state === null) gaps.push("github.issue.state");
  return { number, state };
}

function readPull(cwd: string, endpoint: string, selection: GithubSelection, number: number,
  local: LocalHead, gaps: string[]) {
  const pull = api(cwd, `${endpoint}/pulls/${number}`);
  const base = repository(recordObject(pull?.base)?.repo);
  if (pull?.number !== number || base?.name.toLowerCase() !== selection.repository.toLowerCase()) {
    gaps.push("github.pr.identity");
    return null;
  }
  const head = recordObject(pull.head);
  const published_head = headFacts(head?.repo, head?.ref, head?.sha);
  const state = pull.state === "closed" && pull.merged === true ? "merged" : issueState(pull.state);
  if (state === null) gaps.push("github.pr.state");
  if (published_head.repository === null) gaps.push("github.pr.head_repository");
  if (published_head.oid === null) gaps.push("github.pr.head_oid");
  if (published_head.ref === null) gaps.push("github.pr.head_ref");
  else if (local.branch !== null && published_head.ref !== local.branch) gaps.push("github.pr.head_ref_mismatch");
  return { number, base_repository_id: base.id, state, published_head, head_matches_local: matchesLocal(published_head, local) };
}

function associationRepository(value: unknown, id: number, name: string): boolean {
  const source = recordObject(value);
  return source?.id === id && (source.full_name === undefined
    || (typeof source.full_name === "string" && source.full_name.toLowerCase() === name.toLowerCase()));
}

function readRun(cwd: string, endpoint: string, selection: GithubSelection, id: number,
  pull: ReturnType<typeof readPull> | undefined, local: LocalHead, gaps: string[]) {
  const run = api(cwd, `${endpoint}/actions/runs/${id}`);
  const source = repository(run?.repository);
  if (run?.id !== id || source?.name.toLowerCase() !== selection.repository.toLowerCase()) {
    gaps.push("github.run.identity");
    return null;
  }
  const attempt = positiveInteger(run.run_attempt);
  const head = headFacts(run.head_repository, run.head_branch, run.head_sha);
  if (attempt === null) gaps.push("github.run.attempt");
  if (head.repository === null) gaps.push("github.run.head_repository");
  if (head.ref === null) gaps.push("github.run.head_ref");
  if (head.oid === null) gaps.push("github.run.head_oid");

  let association: number | null | undefined = selection.pr === undefined ? undefined : null;
  if (selection.pr !== undefined && pull && source.id === pull.base_repository_id
      && head.repository_id !== null && head.repository !== null && head.ref !== null && head.oid !== null
      && head.repository_id === pull.published_head.repository_id && head.ref === pull.published_head.ref
      && head.repository.toLowerCase() === pull.published_head.repository?.toLowerCase()
      && Array.isArray(run.pull_requests)) {
    // A run can belong to an earlier PR revision. The attached PR entry must
    // match the run SHA, while the current PR supplies its repository and branch.
    const repoId = head.repository_id;
    const repoName = head.repository;
    if (run.pull_requests.some((entry) => {
      const candidate = recordObject(entry);
      const candidateHead = recordObject(candidate?.head);
      const candidateBase = recordObject(candidate?.base);
      return candidate?.number === pull.number && candidateHead?.ref === head.ref && candidateHead.sha === head.oid
        && associationRepository(candidateHead.repo, repoId, repoName)
        && associationRepository(candidateBase?.repo, source.id, source.name);
    })) association = pull.number;
  }
  if (association === null) gaps.push("github.run.pr_association");

  let status = null;
  let conclusion = null;
  if (attempt !== null && head.repository !== null && head.ref !== null && head.oid !== null && association !== null) {
    status = typeof run.status === "string" && runStates.has(run.status) ? run.status : null;
    if (status === null) gaps.push("github.run.status");
    if (status === "completed") {
      conclusion = typeof run.conclusion === "string" && conclusions.has(run.conclusion) ? run.conclusion : null;
      if (conclusion === null) gaps.push("github.run.conclusion");
    }
  }
  return { id, attempt, head, pr: association, status, conclusion, head_matches_local: matchesLocal(head, local) };
}

export function readGithub(selection: GithubSelection, cwd: string, local: LocalHead, gaps: string[]) {
  const endpoint = `repos/${selection.repository}`;
  let publication = null;
  if (local.branch !== null) {
    const ref = "refs/heads/" + local.branch;
    const encoded = local.branch.split("/").map(encodeURIComponent).join("/");
    const current = api(cwd, `${endpoint}/git/ref/heads/${encoded}`);
    const object = recordObject(current?.object);
    const remoteOid = current?.ref === ref && object?.type === "commit" ? oid(object.sha) : null;
    if (remoteOid === null) gaps.push("github.publication");
    publication = { ref, oid: remoteOid,
      head_matches_local: remoteOid !== null && local.head_oid !== null ? remoteOid === local.head_oid : null };
  }
  const issue = selection.issue === undefined ? undefined : readIssue(cwd, endpoint, selection.issue, gaps);
  const pr = selection.pr === undefined ? undefined : readPull(cwd, endpoint, selection, selection.pr, local, gaps);
  const run = selection.run === undefined ? undefined : readRun(cwd, endpoint, selection, selection.run, pr, local, gaps);
  return { repository: selection.repository, publication, issue, pr, run };
}
