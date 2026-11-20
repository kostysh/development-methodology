import { Repository } from "../baseline/git.js";
import { changes, loadBaseline } from "../baseline/manifest.js";
import { readAdmission } from "./config.js";
import { GitHub, submissionTask } from "./github.js";
import { oid } from "./git.js";

export function evidence(op: string, path: string, pr: string, expectedHead: string, expectedRef: string) {
  const policy = readAdmission(path,op === "admission");
  const token = process.env.GH_TOKEN;
  if (!token || !/^[1-9]\d*$/.test(pr) || !Number.isSafeInteger(Number(pr)))
    throw new Error("Supply the PR number and a scoped GitHub read token");
  const gh = new GitHub(policy,token,Date.now()+5*60000);
  const pull = gh.get(Number(pr));
  if (!gh.eligible(pull) || pull.head !== oid(expectedHead) || pull.ref !== expectedRef)
    throw new Error("PR target, head or ref differs");
  const results = gh.results(pull,policy.required).map((r,i)=>({id:policy.required[i].id,...r}));
  if (op === "export-checks") return {results};
  if (!submissionTask(pull) || !gh.audit(pull,policy)) throw new Error("Missing independent audit on this immutable submission");
  if (results.some(r=>r.exitCode !== 0)) throw new Error("Missing verified required result");
  if (policy.baseline) {
    const repo = new Repository(process.cwd());
    const baseline = loadBaseline(repo,repo.commit(policy.baseline.commit,"baseline"),policy.baseline.manifest);
    const changed = changes(repo,baseline,repo.commit(pull.head,"candidate"));
    if (changed.length) throw new Error(changed.join("\n"));
  }
  return {pr:pull.number,head:pull.head,reviewerId:policy.reviewerId,results};
}
