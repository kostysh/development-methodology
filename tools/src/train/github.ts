import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { useToken, type Credential } from "./credential.js";
import type { Admission, Config, Gate, WorkflowAuthority } from "./config.js";
import { oid } from "./git.js";
import { command } from "./process.js";

export type Review = {id:number; user:{id:number} | null; commit_id:string; state:string; body:string | null};
export type Pull = { number: number; head: string; ref: string; open: boolean; merged: boolean;
  authorId?:number; baseSha?:string; draft: boolean; target: string; sameRepo: boolean; labels: string[] };
type ApiPull = { user?: {id:number}; number: number; head: { sha: string; ref: string; repo: {full_name: string} | null };
  base: { ref: string; sha?:string }; labels: { name: string }[]; state: string; merged?: boolean; merged_at?: string | null; draft: boolean };
type Rule = { type: string; ruleset_id: number; ruleset_source_type: string; ruleset_source: string };
type SetInfo = { id: number; name: string; updated_at?:string; target?:string; source?:string; source_type?:string; bypass_actors?: { actor_type: string; actor_id: number; bypass_mode: string }[];
  conditions?: { ref_name?: { include: string[]; exclude: string[] } }; rules?: {type: string}[]; enforcement?: string };
type Check = { id: number; name: string; head_sha: string; status: string; conclusion: string | null; app: { id: number }; output?: {summary?: string}; check_suite?: { id: number } };

export function submissionTask(p: Pick<Pull,"head"|"ref">) {
  const match = /^ready\/([A-Za-z0-9][A-Za-z0-9_-]{0,80})-([a-f0-9]{40})$/.exec(p.ref);
  return match && match[2] === p.head ? match[1] : undefined;
}

export function submissionIdentityIssue(p: Pull, policy: Admission) {
  if (!Number.isSafeInteger(p.authorId) || !p.authorId || p.authorId < 1) return "Missing numeric PR author ID";
  if (p.authorId === policy.reviewerId) return "PR author and reviewer share GitHub ID " + p.authorId;
  if (policy.submitterId !== undefined && p.authorId !== policy.submitterId)
    return "PR author " + p.authorId + " differs from the configured submitter " + policy.submitterId;
}

export class GitHub {
  constructor(readonly c: Pick<Config,"repository"|"branch"> & Partial<Pick<Config,"admission"|"mode"|"writerAppId"|"queueLabel"|"ruleEvidence">>, readonly token: Credential, readonly deadline: number) {}
  api<T>(path: string, method = "GET", data?: object): T {
    const args = ["api", "--hostname", "github.com", "-X", method, path];
    if (data) args.push("--input", "-");
    const r = command("gh", args, { deadline: this.deadline, env: { GH_TOKEN: useToken(this.token), GH_PROMPT_DISABLED: "1" },
      input: data ? JSON.stringify(data) : undefined });
    return (r.out ? JSON.parse(r.out) : undefined) as T;
  }
  repo(path: string) { return "/repos/" + this.c.repository + "/" + path; }
  pages<T>(path: string, key?: string, publicRead = false): T[] {
    const result: T[] = [];
    for (let page = 1; ; page++) {
      const url = path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page;
      const data = publicRead ? JSON.parse(command("curl", ["-q", "--silent", "--show-error", "--fail", "--proto", "=https",
        "--", "https://api.github.com" + url], {deadline:this.deadline}).out) : this.api<T[] | Record<string, T[]>>(url);
      const rows = key ? (data as Record<string, T[]>)[key] : data;
      if (!Array.isArray(rows)) throw new Error("Unrecognized GitHub response");
      result.push(...rows);
      if (rows.length < 100) return result;
    }
  }
  pull(p: ApiPull): Pull {
    return { number: p.number, head: oid(p.head.sha), ref: p.head.ref, open: p.state === "open", merged: p.merged === true || typeof p.merged_at === "string",
      authorId:p.user?.id, baseSha:p.base.sha, draft: p.draft, target: p.base.ref, sameRepo: p.head.repo?.full_name.toLowerCase() === this.c.repository.toLowerCase(),
      labels: p.labels.map(l => l.name) };
  }
  list(state: "open" | "all" = "open") {
    return this.pages<ApiPull>(this.repo("pulls?state=" + state + "&base=" + encodeURIComponent(this.c.branch))).map(p => this.pull(p));
  }
  get(n: number) { return this.pull(this.api<ApiPull>(this.repo("pulls/" + n))); }
  workflow(p: Pull, w: WorkflowAuthority, check: Check) {
    const suite = check.check_suite?.id;
    if (!suite) return false;
    const blob = this.api<{type:string;sha:string}>(this.repo("contents/" + w.path + "?ref=" + p.head));
    if (blob.type !== "file" || blob.sha !== w.blob) return false;
    if (w.publicRead && this.api<{private:boolean}>("/repos/" + this.c.repository).private !== false) return false;
    type Run = {id:number; workflow_id:number; path:string; head_sha:string; head_branch:string; event:string; check_suite_id:number;
      status:string; conclusion:string; head_repository:{full_name:string} | null};
    const event = w.event ?? "push";
    const runs = this.pages<Run>(this.repo("actions/workflows/" + w.id + "/runs?event=" + event + "&head_sha=" + p.head),
      "workflow_runs", w.publicRead);
    const run = runs.find(r => r.workflow_id === w.id && r.path === w.path && r.head_sha === p.head && r.head_branch === p.ref &&
      r.event === event && r.head_repository?.full_name.toLowerCase() === this.c.repository.toLowerCase() &&
      r.check_suite_id === suite && r.status === "completed" && r.conclusion === "success");
    if (!run || !Number.isSafeInteger(run.id)) return false;
    type Job = {run_id:number; head_sha:string; status:string; conclusion:string; name:string; check_run_url:string};
    const jobs = this.pages<Job>(this.repo("actions/runs/"+run.id+"/jobs?filter=latest"),"jobs",w.publicRead);
    const url = "https://api.github.com"+this.repo("check-runs/"+check.id);
    return jobs.some(job=>job.name === check.name && job.head_sha === p.head && job.run_id === run.id &&
      job.status === "completed" && job.conclusion === "success" && job.check_run_url?.toLowerCase() === url.toLowerCase());
  }
  eligible(p: Pull) { return p.open && !p.draft && p.sameRepo && p.target === this.c.branch && p.ref !== this.c.branch; }
  results(p: Pull, required: (Gate & {minimum?:number})[]) {
    const runs = this.pages<Check>(this.repo("commits/" + p.head + "/check-runs?filter=all"), "check_runs");
    return required.map(g => {
      const latest = runs.filter(r => r.head_sha === p.head && r.name === g.name && r.app?.id === g.appId)
        .sort((a, b) => b.id - a.id)[0];
      const passed = latest?.status === "completed" && latest.conclusion === "success" &&
        (g.appId !== 15368 || (g.workflow !== undefined && this.workflow(p,g.workflow,latest)));
      const result = {candidate:p.head,status:passed ? "completed" : "unverified",exitCode:passed ? 0 : 1};
      if (!passed || g.minimum === undefined) return result;
      let numbers: {threshold?:unknown; measured?:unknown};
      try { numbers = JSON.parse(latest.output?.summary ?? "null") ?? {}; } catch { numbers = {}; }
      const {threshold,measured} = numbers;
      if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < g.minimum ||
          typeof measured !== "number" || !Number.isFinite(measured) || measured < threshold)
        return {...result,status:"unverified",exitCode:1};
      return {...result,threshold,measured};
    });
  }
  decisions(p: Pull, reviewerId: number) {
    return this.pages<Review>(this.repo("pulls/"+p.number+"/reviews"))
      .filter(r => r.user?.id === reviewerId && ["APPROVED","CHANGES_REQUESTED","DISMISSED"].includes(r.state));
  }
  audit(p: Pull, a: Admission, ownerRequired = false) {
    if (submissionIdentityIssue(p,a)) return false;
    const latest = this.decisions(p,a.reviewerId).at(-1);
    const lines = latest?.body?.split(/\r?\n/) ?? [];
    const bases = lines.filter(line => line.startsWith("Review base:"));
    const currentBase = bases.length === 1 && !!p.baseSha && /^[a-f0-9]{40}$/.test(p.baseSha) &&
      bases[0] === "Review base: " + p.baseSha;
    return latest?.state === "APPROVED" && latest.commit_id === p.head && lines.includes("Methodology audit: PASS") &&
      (currentBase || (bases.length === 0 && !a.reviewControls)) &&
      (!ownerRequired || lines.filter(l => l.startsWith("Owner confirmation:")).length === 1 &&
        lines.some(l => /^Owner confirmation: [^\x00-\x1f\x7f]{1,512}$/u.test(l) && l.slice(20).trim().length > 0));
  }
  gates(p: Pull, required: Gate[], ownerRequired = false) {
    if (!this.eligible(p)) return false;
    const a = this.c.admission;
    if (a && (!submissionTask(p) || !this.audit(p,a,ownerRequired))) return false;
    return this.results(p,a ? [...required,...a.required] : required).every(row=>row.exitCode === 0);
  }
  mark(p: Pull, on: boolean) {
    if (this.c.mode === "dry" || p.labels.includes(this.c.queueLabel!) === on) return;
    const path = this.repo("issues/" + p.number + "/labels");
    if (on) this.api(path, "POST", {labels: [this.c.queueLabel]});
    else this.api(path + "/" + encodeURIComponent(this.c.queueLabel!), "DELETE");
  }
  comment(n: number, message: string) {
    if (this.c.mode === "enabled") this.api(this.repo("issues/" + n + "/comments"), "POST", { body: message });
  }
  rules(branch: string) { return this.pages<Rule>(this.repo("rules/branches/" + encodeURIComponent(branch))); }
  actors(branch: string, r: Rule, s: SetInfo) {
    if (Array.isArray(s.bypass_actors)) return s.bypass_actors;
    if (!this.c.ruleEvidence) return;
    const evidence = JSON.parse(readFileSync(this.c.ruleEvidence,"utf8")) as {
      repository:string; repositoryId:number; byBranch?:Record<string,SetInfo[]>; rulesets?:SetInfo[];
    };
    const repo = this.api<{id:number; full_name:string}>("/repos/" + this.c.repository);
    if (repo.id !== evidence.repositoryId || evidence.repository !== repo.full_name ||
      evidence.repository.toLowerCase() !== this.c.repository.toLowerCase()) return;
    const prior = (evidence.rulesets ?? evidence.byBranch?.[branch])?.find(old => old.id === r.ruleset_id);
    // GitHub omits actor lists from least-privilege reads. Bind the owner's
    // complete read to the same effective rule and high-resolution revision.
    if (!prior || !Array.isArray(prior.bypass_actors) || !s.updated_at ||
      !/\.\d{3,}(Z|[+-]\d{2}:\d{2})$/.test(s.updated_at) || !Number.isFinite(Date.parse(s.updated_at)) ||
      prior.updated_at !== s.updated_at || s.id !== r.ruleset_id || s.target !== "branch" || prior.target !== s.target ||
      prior.source_type !== s.source_type || s.source_type !== "Repository" || prior.source !== s.source ||
      s.source !== r.ruleset_source || prior.enforcement !== s.enforcement || s.enforcement !== "active" ||
      !isDeepStrictEqual(prior.conditions,s.conditions) || !isDeepStrictEqual(prior.rules,s.rules)) return;
    return prior.bypass_actors;
  }
  verifyWriter() {
    // Requires an installation token. A personal token cannot establish this installation boundary.
    this.api("/installation/repositories?per_page=1");
    const active = this.rules(this.c.branch);
    const repositoryRule = (r: Rule) => r.ruleset_source_type === "Repository" &&
      r.ruleset_source.toLowerCase() === this.c.repository.toLowerCase();
    for (const kind of ["update", "deletion", "non_fast_forward"]) {
      const verified = active.filter(r => r.type === kind && repositoryRule(r)).some(r => {
        const s = this.api<SetInfo>(this.repo("rulesets/" + r.ruleset_id));
        const actors = this.actors(this.c.branch,r,s);
        if (s.enforcement !== "active" || !Array.isArray(actors)) return false;
        if (kind !== "update") return actors.length === 0;
        return actors.length === 1 && actors[0].actor_type === "Integration" &&
          actors[0].actor_id === this.c.writerAppId && actors[0].bypass_mode === "always";
      });
      if (!verified) throw new Error("Missing verified branch rule: " + kind);
    }
  }
  verifyImmutable(branch: string) {
    const active = this.rules(branch);
    for (const kind of ["update", "deletion"]) {
      if (!active.some(r => {
        if (r.type !== kind || r.ruleset_source_type !== "Repository" ||
          r.ruleset_source.toLowerCase() !== this.c.repository.toLowerCase()) return false;
        const set = this.api<SetInfo>(this.repo("rulesets/" + r.ruleset_id));
        const actors = this.actors(branch,r,set);
        return set.enforcement === "active" && Array.isArray(actors) && !actors.length;
      })) throw new Error("Missing immutable source branch rule: " + kind);
    }
  }
}
