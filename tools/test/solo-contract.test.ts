import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("holds excluded, ambiguous, over-cap and unapproved merges and applies a batch to the exact decision", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "solo-contract-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const profile = join(dir, "solo.json"),
    approvals = join(dir, "owner.json");
  const repo = "example/adopter",
    branch = "integration",
    head = "1".repeat(40),
    next = "2".repeat(40);
  const bin = process.env.METHODOLOGY_SOLO_BIN ?? fileURLToPath(new URL("../dist/solo.js", import.meta.url));
  const run = (args: string[], input?: unknown) => {
    const r = spawnSync(process.execPath, [bin, args[0], profile, ...args.slice(1)], {
      input: input === undefined ? "" : JSON.stringify(input),
      encoding: "utf8",
    });
    assert.ifError(r.error);
    return { status: r.status, data: r.stdout.trim() ? JSON.parse(r.stdout) : null, error: r.stderr };
  };
  writeFileSync(
    profile,
    JSON.stringify({
      repository: repo,
      branch,
      pending_limit: 2,
      ledger: join(dir, "decisions.sqlite"),
      approvals,
      classes: { established_ui: { allow_merge: true }, generic_error: { allow_merge: false } },
    }),
    { mode: 0o600 },
  );
  writeFileSync(approvals, "[]", { mode: 0o600 });
  const proposal = (
    id: string,
    task: string,
    decisionClass: string,
    scope = "certain",
    exclusions: string[] = [],
  ) => ({
    id,
    task,
    decision_class: decisionClass,
    scope,
    exclusions,
    choice: "Use existing wording",
    basis: "Screen S §2",
    alternatives: "Detailed copy exposes a customer's email",
    reversal_cost: "Change one string",
    dependent_work: "PR 8",
    impact: "Console only",
    next_action: "implement",
  });
  const put = (id: string, task: string, cls: string, scope?: string, exc?: string[]) =>
    run(["propose"], proposal(id, task, cls, scope, exc));
  const bind = (task: string, pr: string, sha = head) => run(["bind", task, pr, sha]).status;
  const gate = (pr: string, sha = head) => run(["gate", repo, branch, pr, sha]).status;
  assert.equal(gate("8"), 1);
  assert.equal(run(["install-batch"]).status,0);
  const l = put("L", "T1", "established_ui");
  assert.equal(l.status, 0, l.error);
  assert.equal(put("L", "T1", "established_ui").data.digest, l.data.digest);
  assert.equal(run(["propose"], { ...proposal("L", "T1", "established_ui"), choice: "different" }).status, 2);
  assert.equal(bind("T1", "7"), 0);
  assert.equal(gate("7"), 0);
  const e = put("E", "T2", "generic_error");
  assert.equal(e.status, 0);
  assert.equal(bind("T2", "8"), 0);
  assert.equal(gate("8"), 1);
  assert.equal(gate("7", next), 1);
  assert.equal(put("A", "T3", "established_ui", "ambiguous").status, 1);
  assert.equal(put("B", "T4", "generic_error", "certain", ["personal_data"]).status, 1);
  assert.equal(put("C", "T5", "generic_error").status, 1);
  assert.equal(run(["summary"]).data.pending.length, 2);
  const at = new Date().toISOString();
  const confirmed = {
    id: "L",
    digest: l.data.digest,
    status: "confirmed",
    at,
    owner_source: "Owner record 3",
    document: "UI guide §2",
  };
  const changed = {
    id: "E",
    digest: e.data.digest,
    status: "changed",
    at,
    owner_source: "Owner record 3",
    document: "Copy register",
    choice: "Use approved copy",
    rework: "R7",
    superseded_head: head,
  };
  writeFileSync(approvals, JSON.stringify([{ ...confirmed, digest: "0".repeat(64) }, changed]));
  assert.equal(run(["install-batch"]).status, 2);
  assert.equal(run(["summary"]).data.confirmed.length,0);
  writeFileSync(approvals, JSON.stringify([confirmed, changed]));
  assert.equal(run(["install-batch"]).status,0);
  chmodSync(approvals,0o622);
  assert.equal(run(["install-batch"]).status,2);
  chmodSync(approvals,0o600);
  const wrongOwner=join(dir,"different-owner.json");
  writeFileSync(wrongOwner,JSON.stringify({repository:repo,branch,pending_limit:2,classes:{},ledger:join(dir,"decisions.sqlite"),
    approvals,approvals_owner_uid:process.geteuid!()+1}),{mode:0o600});
  const refused=spawnSync(process.execPath,[bin,"install-batch",wrongOwner],{encoding:"utf8"});
  assert.equal(refused.status,2);assert.match(refused.stderr,/owner-controlled approvals directory/);
  const summary = run(["summary"]);
  assert.equal(summary.status, 0, summary.error);
  assert.equal(summary.data.confirmed.length, 1);
  assert.equal(summary.data.changed[0].resolution.rework, "R7");
  assert.equal(gate("8"), 1);
  const replay = put("E", "T2", "generic_error");
  assert.equal(replay.status, 1);
  assert.equal(replay.data.resolution.choice, "Use approved copy");
  assert.equal(put("C", "T5", "generic_error").status, 0);
  assert.equal(bind("T2", "8", next), 0);
  assert.equal(gate("8", next), 1);
  writeFileSync(approvals, JSON.stringify([confirmed, { ...changed, verified_head: head }]));
  assert.equal(run(["install-batch"]).status,2);
  assert.equal(gate("8",head),1);
  writeFileSync(approvals, JSON.stringify([confirmed, { ...changed, verified_head: next }]));
  assert.equal(run(["install-batch"]).status,0);
  assert.equal(gate("8", next), 0);
  assert.equal(gate("8"), 1);
  assert.equal(bind("T3", "9"), 0);
  assert.equal(gate("9"), 1);
  assert.equal(run(["gate", "another/repo", branch, "7", head]).status, 1);
  writeFileSync(approvals, "[]");
  assert.equal(run(["install-batch"]).status,2);
  assert.equal(gate("7"),0);
});
