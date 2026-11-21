import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { add, fixture, git } from "./train-runtime-fixture.ts";

const cli = process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js", import.meta.url));
const repository = "example/disposable", branch = "integration/nightly", workflow = ".github/workflows/test.yml";
const repoPath = "/repos/" + repository;

function setup(t: TestContext) {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin"), remote = join(root, "remote.git"), edit = join(root, "author");
  mkdirSync(bin);
  mkdirSync(join(edit, ".github/workflows"), { recursive: true });
  writeFileSync(join(edit, workflow), "fixture workflow bytes");
  git(edit, "add", "."); git(edit, "commit", "-m", "commission workflow");
  git(edit, "push", remote, "HEAD:refs/heads/main", "HEAD:refs/heads/" + branch);
  const base = git(edit, "rev-parse", "HEAD"), blob = git(edit, "rev-parse", base + ":" + workflow);
  const profile = { repository, branch, ownerLogin: "fixture-owner", controlBase: base, defaultControlBase: base, protectedPaths: ["ops"],
    checks: [{ name: "Required", appId: 808 }], workflows: [{ id: 12, path: workflow, blob,
      jobs: [{ name: "Linux", steps: ["Stack"] }] }] };
  const endpoints: Record<string,unknown> = {
    "/user": {login: "fixture-owner"}, [repoPath]: {full_name: repository, default_branch: "main"},
  };
  const profileFile = join(root, "profile.json"), batchFile = join(root, "batch.json"), apiFile = join(root, "api.json");
  function save(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); }
  function pull(pr: number, path: string, dependencies: number[] = []) {
    const head = add(root, pr, path), ref = "work/" + pr;
    endpoints[repoPath + "/pulls/" + pr] = {number: pr, head: {sha: head, ref, repo: {full_name: repository}},
      base: {ref: branch, sha: base}, labels: [], state: "open", merged: false, draft: false};
    endpoints[repoPath + "/commits/" + head + "/check-runs?filter=all&per_page=100&page=1"] = {
      check_runs: [{id: pr * 10, name: "Required", head_sha: head, app: {id: 808}, status: "completed", conclusion: "success"}],
    };
    return {pr, head, dependencies, review: {repository, branch, base, pr, head, ref, verdict: "PASS",
      reviewer: "fixture-independent-" + pr, evidence: "fixture-review-record-" + pr}};
  }

  // The installed entry point uses ordinary git with real objects and leases. Translate just
  // its one permitted HTTPS endpoint to the isolated bare origin. No network or account writes.
  const realGit = spawnSync("which", ["git"], {encoding:"utf8"}).stdout.trim();
  writeFileSync(join(bin,"git"), `#!/usr/bin/env node
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
let args = process.argv.slice(2);
const url = ${JSON.stringify("https://github.com/" + repository + ".git")};
if (args.includes(url)) {
  if (process.env.GIT_ALLOW_PROTOCOL !== "https" || process.env.GIT_CONFIG_VALUE_0 !== "!gh auth git-credential" ||
      process.env.GIT_CONFIG_GLOBAL !== "/dev/null" || args[1] !== "core.hooksPath=/dev/null" || process.env.GH_TOKEN) process.exit(98);
  args = args.map(a => a === url ? ${JSON.stringify(remote)} : a);
  process.env.GIT_ALLOW_PROTOCOL = "file";
  if (args.includes("push")) fs.appendFileSync(${JSON.stringify(join(root, "pushes"))}, args.at(-1) + "\\n");
}
process.exit(spawnSync(${JSON.stringify(realGit)}, args, {stdio:"inherit"}).status ?? 99);
`, {mode:0o700});
  writeFileSync(join(bin,"gh"), `#!/usr/bin/env node
const fs = require("node:fs"), {execFileSync} = require("node:child_process");
const args = process.argv.slice(2);
if (args.length !== 6 || args.slice(0,5).join(" ") !== "api --hostname github.com -X GET" ||
    process.env.GH_CONFIG_DIR !== ${JSON.stringify(root)} || process.env.GH_TOKEN || process.env.GITHUB_TOKEN) process.exit(91);
const endpoints = JSON.parse(fs.readFileSync(${JSON.stringify(apiFile)}));
let value = endpoints[args[5]];
if (args[5].includes("/pulls?state=open&")) {
  value = Object.entries(endpoints).filter(([key]) => key.startsWith(${JSON.stringify(repoPath + "/pulls/")})).map(([,row]) => row);
}
if (args[5].includes("/pulls/") && value) {
  const gitArgs = ["--git-dir",${JSON.stringify(remote)}];
  const tip = execFileSync(${JSON.stringify(realGit)}, [...gitArgs,"rev-parse",${JSON.stringify(branch)}],{encoding:"utf8"}).trim();
  if (tip !== ${JSON.stringify(base)}) {
    if (endpoints.after?.number === value.number) value = endpoints.after;
    else if (require("node:child_process").spawnSync(${JSON.stringify(realGit)}, [...gitArgs,"merge-base","--is-ancestor",value.head.sha,tip]).status === 0) {
      const observed = ${JSON.stringify(join(root, "indirect-merge-reads"))};
      const count = fs.existsSync(observed) ? Number(fs.readFileSync(observed,"utf8")) : 0;
      fs.writeFileSync(observed,String(count+1));
      if (count > 0) value = {...value, state:"closed", merged:true};
    }
  }
}
if (value === undefined) { console.error(args[5]); process.exit(92); }
console.log(JSON.stringify(value));
`, {mode:0o700});
  function run(op: string, pulls: ReturnType<typeof pull>[], candidate?: string, currentBase = base) {
    save(profileFile, profile); save(batchFile, {base: currentBase, pulls}); save(apiFile, endpoints);
    const args = [cli, op, profileFile, batchFile];
    if (candidate) args.push(candidate);
    return spawnSync(process.execPath, args, {cwd: root, encoding:"utf8", env:{
      ...process.env, PATH: bin + ":" + process.env.PATH, GH_CONFIG_DIR: root,
      GH_TOKEN: "fixture-must-not-be-forwarded", GITHUB_TOKEN: "fixture-must-not-be-forwarded",
    }});
  }
  function prepare(pulls: ReturnType<typeof pull>[]) {
    const result = run("owner-prepare", pulls);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).candidate as string;
  }
  function result(candidate: string, outcome?: "success" | "failure") {
    const name = "methodology-candidates/" + candidate;
    const url = repoPath + "/actions/workflows/12/runs?" + new URLSearchParams({ event:"push", branch:name, head_sha:candidate }) +
      "&per_page=100&page=1";
    endpoints[repoPath + "/contents/" + workflow + "?ref=" + candidate] = {type:"file", sha:blob};
    endpoints[url] = { workflow_runs: outcome ? [{id: 100, run_attempt: 1, workflow_id: 12, path: workflow, event:"push",
      head_branch: name, head_sha: candidate, status:"completed", conclusion: outcome,
      repository:{full_name:repository}, head_repository:{full_name:repository}}] : [] };
    endpoints[repoPath + "/actions/runs/100/attempts/1/jobs?per_page=100&page=1"] = {jobs:[{ name:"Linux",
      run_id:100, head_sha:candidate, status:"completed", conclusion:outcome, steps:[{name:"Stack",status:"completed",conclusion:outcome}]}]};
  }
  return {root,remote,edit,profile,base,pull,run,prepare,result,endpoints,profileFile,batchFile};
}

test("owner train exercises preparation, CI, diagnosis and exact publication through the CLI", t => {
  const f = setup(t);
  const good = f.pull(1,"ok"), bad = f.pull(2,"broken"), dependent = f.pull(3,"dependent",[2]);
  const all = [good,bad,dependent];
  const full = f.prepare(all);
  assert.equal(git(f.remote,"rev-parse","methodology-candidates/" + full), full);
  const tip = () => git(f.remote,"rev-parse",branch);
  f.result(full);
  assert.equal(f.run("owner-publish",all,full).status, 75);
  f.result(full, "failure");
  const failed = f.run("owner-publish",all,full);
  assert.equal(failed.status,1,failed.stderr);
  assert.deepEqual(JSON.parse(failed.stdout).tests, ["12/Linux/Stack"]);
  const isolated = f.prepare([bad]);
  f.result(isolated, "failure");
  assert.equal(f.run("owner-check",[bad],isolated).status,1);
  assert.match(f.run("owner-prepare",[good,dependent]).stderr, /dependency #2/);
  const kept = f.prepare([good]);
  f.result(kept, "success");
  assert.equal(f.run("owner-check",[good],kept).status,0);
  assert.equal(tip(), f.base);
  const published = f.run("owner-publish",[good],kept);
  assert.equal(published.status,0,published.stderr);
  assert.equal(JSON.parse(published.stdout).status,"published");
  assert.equal(tip(),kept);
  assert.equal(readFileSync(join(f.root,"indirect-merge-reads"),"utf8"),"2");
  assert.deepEqual(JSON.parse(readFileSync(f.profileFile+".tip.json","utf8")), {repository,branch,tip:kept});
  assert.equal(git(f.remote,"rev-parse","main"),f.base);
  assert.equal(git(f.remote,"show","-s","--format=%P",kept),f.base+" "+good.head);
  assert.deepEqual(readFileSync(join(f.root,"pushes"),"utf8").trim().split("\n").map(p=>p.split(":")[1]),
    [full,isolated,kept].map(id=>"refs/heads/methodology-candidates/"+id).concat("refs/heads/"+branch));
  assert.match(f.run("owner-publish",[good],kept).stderr,/Integration base moved/);
});

test("owner train holds unsafe or changed admission before publication", t => {
  const f = setup(t);
  const good = f.pull(1,"ok"), extra = f.pull(2,"other"), control = f.pull(3,".github/workflows/unsafe.yml");
  assert.match(f.run("owner-prepare",[control]).stderr,/Protected CI/);
  git(f.remote,"update-ref","refs/heads/main",control.head);
  assert.match(f.run("owner-prepare",[good]).stderr,/Protected CI/);
  git(f.remote,"update-ref","refs/heads/main",f.base);
  const old = {...good, review:{...good.review, base:"1".repeat(40)}};
  assert.match(f.run("owner-prepare",[old]).stderr,/independent PASS/);
  f.profile.branch = "main";
  assert.match(f.run("owner-prepare",[good]).stderr,/integration\/nightly/);
  f.profile.branch = branch;
  f.profile.ownerLogin = "other-owner";
  assert.match(f.run("owner-prepare",[good]).stderr,/Active gh login/);
  f.profile.ownerLogin = "fixture-owner";
  git(f.remote,"update-ref","refs/heads/"+branch,extra.head);
  const external = {...good, review:{...good.review, base:extra.head}};
  assert.match(f.run("owner-prepare",[external],undefined,extra.head).stderr,/last confirmed tip/);
  git(f.remote,"update-ref","refs/heads/"+branch,f.base);
  const checkpoint = f.profileFile + ".tip.json";
  writeFileSync(checkpoint, "{}", {mode:0o600});
  assert.match(f.run("owner-prepare",[good]).stderr,/Invalid integration tip checkpoint/);
  rmSync(checkpoint);
  // An ordinary source branch can already contain the head of an omitted open PR.
  const hidden = {...f.endpoints[repoPath+"/pulls/2"] as object, number:4, head:{
    sha:good.head, ref:"hidden-source", repo:{full_name:repository}}};
  f.endpoints[repoPath+"/pulls/4"] = hidden;
  git(f.remote,"update-ref","refs/pull/4/head",good.head);
  assert.match(f.run("owner-prepare",[good]).stderr,/unselected PR #4/);
  delete f.endpoints[repoPath+"/pulls/4"];
  const single = f.prepare([good]);
  // Reject a genuine remote candidate with an extra reviewed parent absent from this batch.
  const both = f.prepare([good,extra]);
  assert.match(f.run("owner-publish",[good],both).stderr,/reconstructed batch/);
  const providerPR = f.endpoints[repoPath+"/pulls/1"] as {head: {sha:string};draft:boolean};
  providerPR.head.sha = extra.head;
  assert.match(f.run("owner-publish",[good],single).stderr,/eligibility or reviewed revision/);
  providerPR.head.sha = good.head;
  const checks = f.endpoints[repoPath+"/commits/"+good.head+"/check-runs?filter=all&per_page=100&page=1"] as {
    check_runs:{conclusion:string}[]};
  checks.check_runs[0].conclusion = "failure";
  assert.match(f.run("owner-publish",[good],single).stderr,/unsuccessful checks/);
  checks.check_runs[0].conclusion = "success";
  f.result(single, "success");
  // SHA-identical candidate is usable on retries. A collision pointing elsewhere holds.
  git(f.remote,"update-ref","refs/heads/methodology-candidates/"+single,both);
  assert.match(f.run("owner-prepare",[good]).stderr,/Candidate branch changed/);
  git(f.remote,"update-ref","refs/heads/methodology-candidates/"+single,single);
  f.endpoints.after = {...providerPR, draft: true};
  const raced = f.run("owner-publish",[good],single);
  assert.equal(raced.status,2,raced.stderr);
  assert.match(raced.stderr,/Publication occurred; reconcile/);
  assert.equal(git(f.remote,"rev-parse",branch),single);
  assert.deepEqual(JSON.parse(readFileSync(checkpoint,"utf8")), {repository,branch,tip:f.base,pending:single});
  assert.match(f.run("owner-prepare",[good]).stderr, /Unconfirmed prior publication/);
  chmodSync(f.root,0o755);
  assert.match(f.run("owner-prepare",[good]).stderr,/private operator directories/);
});
