import { lstatSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { trustedPath } from "./config.js";
import { readPull } from "./evidence.js";
import type { Review } from "./github.js";
import { checkReviewControls } from "./review-policy.js";

function singleLine(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= 512 && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(value);
}

export function publishReview(path: string, pr: string, head: string, ref: string, verdictPath: string, ownerMessage?: string) {
  const {gh,pull,policy} = readPull(path,pr,head,ref,true,true);
  const base = pull.baseSha;
  if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error("Missing GitHub PR base SHA");
  trustedPath(dirname(verdictPath),true);
  trustedPath(verdictPath);
  if (lstatSync(dirname(verdictPath)).mode & 0o077 || lstatSync(verdictPath).nlink !== 1)
    throw new Error("Use a private orchestration directory and a regular verdict with one link");
  const v = JSON.parse(readFileSync(verdictPath,"utf8"));
  if (!v || v.repository !== policy.repository || v.branch !== pull.target || v.base !== base || v.pr !== pull.number ||
      v.head !== head || v.ref !== ref || !["PASS","FAIL"].includes(v.verdict) || !singleLine(v.reviewer) || !singleLine(v.evidence))
    throw new Error("Independent review record must identify the exact target, base, PR, head, ref, reviewer, evidence and verdict");
  if (ownerMessage !== undefined && !singleLine(ownerMessage)) throw new Error("Supply one owner message reference");
  const pass = v.verdict === "PASS";
  const controls = pass ? checkReviewControls(policy.reviewControls,base,head,ownerMessage) : undefined;
  const lines = ["Methodology audit: "+v.verdict,"Review base: "+base,"Independent reviewer: "+v.reviewer,"Evidence: "+v.evidence];
  if (controls?.ownerMessage) lines.push("Owner confirmation: "+controls.ownerMessage);
  const body = lines.join("\n");
  const state = pass ? "APPROVED" : "CHANGES_REQUESTED";
  const installation = gh.api<{total_count:number; repositories:{full_name:string}[]}>("/installation/repositories?per_page=1");
  if (installation.total_count !== 1 || installation.repositories[0]?.full_name.toLowerCase() !== policy.repository.toLowerCase())
    throw new Error("Supply an installation token scoped to the review target repository");
  const viewer = gh.api<{data:{viewer:{databaseId:number | null}}}>("graphql","POST",{query:"{viewer{databaseId}}"});
  if (viewer.data?.viewer?.databaseId !== policy.reviewerId) throw new Error("App identity differs from the configured review publisher");

  const endpoint = gh.repo("pulls/"+pr+"/reviews");
  const reviews = gh.decisions(pull,policy.reviewerId);
  let latest = reviews.at(-1);
  if (latest?.commit_id !== head || latest.body !== body || latest.state !== state) {
    if (reviews.some(r => r.commit_id === head && r.body?.split(/\r?\n/).includes("Evidence: "+v.evidence)))
      throw new Error("A later decision or dismissal superseded this review; obtain a fresh independent verdict");
    const posted = gh.api<Review>(endpoint,"POST",{commit_id:head,event:pass ? "APPROVE" : "REQUEST_CHANGES",body});
    latest = gh.decisions(pull,policy.reviewerId).at(-1);
    if (!latest || latest.id !== posted.id) throw new Error("Published review is not the latest App decision");
  }
  const current = gh.get(pull.number);
  if (!gh.eligible(current) || current.head !== head || current.baseSha !== base || current.ref !== ref ||
      current.authorId !== pull.authorId || latest.user?.id !== policy.reviewerId || latest.commit_id !== head ||
      latest.state !== state || latest.body !== body || !Number.isSafeInteger(latest.id) || latest.id < 1)
    throw new Error("PR or published review readback differs from the independent verdict");
  return {pr:pull.number,base,head,authorId:pull.authorId,reviewerId:policy.reviewerId,reviewId:latest.id,state};
}
