import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { verify } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Executed only by the disposable CLI harness. The real train uses its normal
// Git, credential, REST, review, check, verifier and publication code paths.
const [, , tool, root, ...args] = process.argv;
const read = (file: string) => readFileSync(join(root, file), "utf8");
const remote = join(root, "remote.git");
const git = (...args: string[]) => execFileSync(read("real-git"), ["-C", remote, ...args], { encoding: "utf8" }).trim();
const repo = "example/disposable";
const state = JSON.parse(read("provider.json"));
const base = () => git("rev-parse", "refs/heads/main");

function moveUnselectedPull() {
  const [selected, unselected] = state.submissions;
  git("update-ref", "refs/heads/" + unselected.ref, selected.head);
  git("update-ref", "refs/pull/" + unselected.number + "/head", selected.head);
}

if (tool === "curl") {
  const match = /Bearer ([\w.-]+)/.exec(readFileSync(0, "utf8"));
  assert.ok(match);
  const [header, claims, signature] = match[1].split(".");
  assert.ok(verify("RSA-SHA256", Buffer.from(header + "." + claims), read("public.pem"), Buffer.from(signature, "base64url")));
  assert.equal(JSON.parse(Buffer.from(claims, "base64url").toString()).iss, 123);
  assert.equal(args.at(-1), "https://api.github.com/app/installations/321/access_tokens");
  assert.deepEqual(JSON.parse(args[args.indexOf("--data-binary") + 1]).repositories, ["disposable"]);
  console.log(JSON.stringify({ token: "local-installation", expires_at: new Date(Date.now() + 3600000).toISOString() }));
} else if (tool === "docker") {
  if (args[0] === "ps") process.exit(0);
  assert.equal(args[0], "run");
  const mount = args.find(arg => arg.includes(",dst=/candidate,"));
  assert.ok(mount);
  const snapshot = mount.split(",dst=")[0].split(",src=")[1];
  for (const [file, contents] of Object.entries(state.expectedFiles)) {
    assert.equal(readFileSync(join(snapshot, file), "utf8").trim(), contents);
  }
  writeFileSync(join(root, "verified"), args.at(-1)!);
  if (state.afterSuite === "unselected during suite") moveUnselectedPull();
  if (state.afterSuite === "source") git("update-ref", "refs/heads/" + state.submissions[0].ref, base());
  if (state.afterSuite === "pull") git("update-ref", "refs/pull/1/head", base());
  console.log('{"result":"pass"}');
} else {
  assert.equal(tool, "gh");
  assert.equal(process.env.GH_TOKEN, "local-installation");
  const method = args[args.indexOf("-X") + 1];
  const endpoint = args[args.indexOf("-X") + 2];
  const url = new URL(endpoint, "https://api.github.com");
  const path = url.pathname;
  appendFileSync(join(root, "requests"), method + " " + path + "\n");
  function response() {
    if (path === "/installation/repositories") return state.installation;
    if (path === "/repos/" + repo) return state.installation.repositories[0];
    assert.ok(path.startsWith("/repos/" + repo + "/"), path);
    const route = path.slice(("/repos/" + repo + "/").length);
    if (route.startsWith("rules/")) throw new Error("Rules unavailable for this private repository");
    if (route === "git/ref/heads/main") return {
      ref: state.servedRef ?? "refs/heads/main", object: { type: "commit", sha: base() },
    };
    const afterSuite = existsSync(join(root, "verified")) ? state.afterSuite : undefined;
    function pull(p: { number: number; ref: string; head: string }) {
      if (afterSuite?.startsWith("unselected after push") && base() !== state.submissions[0].reviewBase) {
        moveUnselectedPull();
      }
      const head = git("rev-parse", "refs/pull/" + p.number + "/head");
      const stillOpen = afterSuite === "unselected after push still open" && p.number === 2;
      const merged = !stillOpen && git("merge-base", head, "main") === head;
      return { number: p.number, head: { sha: head, ref: p.ref, repo: {full_name: repo} },
        base: { ref: "main", sha: afterSuite === "API base" ? head : base() }, labels: [], user: {id: 73},
        state: merged ? "closed" : "open", merged, draft: p.number === 2 && state.afterSuite.startsWith("unselected ") };
    }
    const submissions = state.submissions as { number: number; head: string; ref: string; reviewBase: string }[];
    if (route === "pulls") return submissions.map(pull).filter(pr => url.searchParams.get("state") === "all" || !pr.merged);
    const pr = submissions.find(p => route === "pulls/" + p.number || route === "pulls/" + p.number + "/reviews");
    if (pr && route.endsWith("/reviews")) {
      const reviewBase = afterSuite === "review base" || afterSuite === "API base" ? pr.head : pr.reviewBase;
      return [{ id: pr.number, user: {id: afterSuite === "reviewer" ? 73 : 81}, state: "APPROVED", commit_id: pr.head,
        body: "Methodology audit: PASS" + (afterSuite === "missing review base" ? "" : "\nReview base: " + reviewBase) }];
    }
    if (pr) {
      const current = pull(pr);
      if (current.merged && afterSuite === "target reset") git("update-ref", "refs/heads/main", pr.reviewBase);
      return current;
    }
    const workflow = ".github/workflows/admission.yml";
    const byHead = submissions.find(p => route === "commits/" + p.head + "/check-runs" || url.searchParams.get("head_sha") === p.head);
    if (byHead && route.endsWith("/check-runs")) {
      const check = { head_sha: byHead.head, status: "completed", conclusion: "success" };
      return { check_runs: [
        { ...check, id: byHead.number * 10, name: "admission", app: {id: 15368}, check_suite: {id: byHead.number} },
        { ...check, id: byHead.number * 10 + 1, name: "fast", app: {id: 124}, conclusion: afterSuite === "check" ? "failure" : "success" },
      ] };
    }
    if (route === "contents/" + workflow) return { type: "file", sha: "c".repeat(40) };
    if (byHead && route === "actions/workflows/81/runs") return { workflow_runs: [{
      id: byHead.number, check_suite_id: byHead.number, workflow_id: 81, head_sha: byHead.head, head_branch: byHead.ref,
      path: workflow, head_repository: {full_name: repo}, event: "workflow_dispatch", status: "completed", conclusion: "success",
    }] };
    const job = submissions.find(p => route === "actions/runs/" + p.number + "/jobs");
    if (job) return { jobs: [{ name: "admission", run_id: job.number, head_sha: job.head, status: "completed",
      conclusion: "success", check_run_url: "https://api.github.com/repos/" + repo + "/check-runs/" + job.number * 10 }] };
    if (method === "POST" && /^issues\/\d+\/(labels|comments)$/.test(route)) return {};
    throw new Error("Unexpected API route " + method + " " + endpoint);
  }
  console.log(JSON.stringify(response()));
}
