import { Repository } from "../baseline/git.js";
import { changes, loadBaseline } from "../baseline/manifest.js";
import { reviewCredential } from "./credential.js";
import { readAdmission } from "./config.js";
import { GitHub, submissionIdentityIssue, submissionTask } from "./github.js";
import { oid } from "./git.js";

export function readPull(path: string, pr: string, expectedHead: string, expectedRef: string, reviewRequired = true, publish = false) {
  const policy = readAdmission(path,reviewRequired);
  const deadline = Date.now()+5*60000;
  const token = publish ? reviewCredential(policy.repository,deadline) : process.env.GH_TOKEN;
  if (!token || !/^[1-9]\d*$/.test(pr) || !Number.isSafeInteger(Number(pr)))
    throw new Error("Supply the PR number and a scoped GitHub token");
  const gh = new GitHub(policy,token,deadline);
  const pull = gh.get(Number(pr));
  if (pull.number !== Number(pr) || !gh.eligible(pull) || pull.head !== oid(expectedHead) || pull.ref !== expectedRef)
    throw new Error("PR target, head or ref differs");
  if (reviewRequired) {
    const issue = submissionIdentityIssue(pull,policy);
    if (issue) throw new Error(issue + ". Check the configured PR author and independent review publisher.");
  }
  return {gh,pull,policy};
}

export function evidence(op: string, path: string, pr: string, expectedHead: string, expectedRef: string) {
  const {gh,pull,policy} = readPull(path,pr,expectedHead,expectedRef,op !== "export-checks");
  if (op !== "export-checks") {
    if (!submissionTask(pull)) throw new Error("Missing ready ref matching the exact PR head");
    if (op === "identity") return {pr:pull.number,head:pull.head,authorId:pull.authorId,reviewerId:policy.reviewerId};
    if (!gh.audit(pull,policy)) throw new Error("Missing independent audit on this submission head");
  }
  const results = gh.results(pull,policy.required).map((r,i)=>({id:policy.required[i].id,...r}));
  if (op === "export-checks") return {results};
  if (results.some(r=>r.exitCode !== 0)) throw new Error("Missing verified required result");
  if (policy.baseline) {
    const repo = new Repository(process.cwd());
    const baseline = loadBaseline(repo,repo.commit(policy.baseline.commit,"baseline"),policy.baseline.manifest);
    const changed = changes(repo,baseline,repo.commit(pull.head,"candidate"));
    if (changed.length) throw new Error(changed.join("\n"));
  }
  return {pr:pull.number,head:pull.head,reviewerId:policy.reviewerId,results};
}
