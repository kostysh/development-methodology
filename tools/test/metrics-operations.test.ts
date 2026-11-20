import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "operations-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const project = join(root, "project");
  const journal = join(root, "journal");
  const profile = join(root, "profile");
  mkdirSync(project);
  assert.equal(spawnSync("git", ["init", "-q", project]).status, 0);
  writeFileSync(join(project, ".gitignore"), "/.methodology/operation-spool-*\n");
  writeFileSync(profile, JSON.stringify({
    project_id: "trial", project_root: project, identity_key: "bc".repeat(32), issued_ids: ["T1", "T2"], journal,
    sources: { ops: { kind: "operation_spool", task_id: "T1" }, owner: { kind: "task", task_id: "T1" },
      other: { kind: "operation_spool", task_id: "T2" } }, categories: { outcome: ["success", "failure"] },
  }), { mode: 0o600 });
  const installed = process.env.METHODOLOGY_METRICS_BIN;
  const cli = fileURLToPath(new URL("../dist/metrics.js", import.meta.url));
  const run = (args: string[], input = "") => spawnSync(installed ?? process.execPath,
    [...(installed ? [] : [cli]), args[0], profile, ...args.slice(1)], { cwd: project, encoding: "utf8", input });
  const mark = (event: string, occurrence: string, data = {}, src = "ops") =>
    run(["mark", src, event, occurrence], JSON.stringify(data));
  const rows = () => readFileSync(journal, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const spool = () => {
    const dir = join(project, ".methodology");
    return join(dir, readdirSync(dir).find(file => !file.endsWith(".coverage.jsonl"))!);
  };
  return { project, journal, profile, run, mark, rows, spool };
}

test("task-scoped workspace observations reach the owner summary once with fresh opaque IDs", t => {
  const { journal, run, mark, rows, spool } = fixture(t);
  assert.equal(mark("task.started", "start").status, 0);
  const fields = { decision_id: "fresh-decision", operation_id: "fresh-operation" };
  assert.equal(mark("decision.blocked", "block", fields).status, 0);
  assert.equal(mark("decision.resolved", "resume", fields).status, 0);
  assert.equal(mark("audit.started", "review", { audit_id: "fresh-audit" }).status, 0);
  assert.equal(run(["run-test", "ops", "fresh-suite", "fresh-attempt", "--", process.execPath, "-e", "process.exit(3)"]).status, 3);
  assert.equal(existsSync(journal), false);
  assert.doesNotMatch(readFileSync(spool(), "utf8"), /fresh-|process.exit/u);
  assert.equal(run(["import-spool", "ops"]).status, 0);
  assert.equal(mark("task.accepted", "accept", {}, "owner").status, 0);
  const initial = rows();
  assert.equal(initial.length, 7);
  assert.equal(initial[1].data.decision_id, initial[2].data.decision_id);
  assert.equal(initial[4].data.attempt_id, initial[5].data.attempt_id);
  assert.equal(initial[5].data.exit_code, 3);
  assert.equal(initial[6].actor_role, "operator");
  assert.match(run(["import-spool", "ops"]).stdout, /0 events, 6 repeats, 0 gaps/u);
  assert.deepEqual(rows(), initial);
  const summary = JSON.parse(run(["summary", "T1", "--as-of", new Date().toISOString()]).stdout);
  assert.equal(summary.lead_time.endpoint_estimated, false);
  assert.equal(summary.lead_time.calendar_ms.value > 0, true);
  assert.equal(summary.lead_time.activity.operator_block.duration_ms.value > 0, true);
  assert.equal(summary.tests.attempts.value, 1);
  assert.equal(mark("decision.blocked", "block", fields, "other").status, 0);
  assert.equal(run(["import-spool", "other"]).status, 0);
  assert.notEqual(rows().at(-1).data.decision_id, initial[1].data.decision_id);
  const retry = run(["run-test", "ops", "fresh-suite", "fresh-attempt", "--", process.execPath, "-e", "process.exit(4)"]);
  assert.equal(retry.status, 4);
  assert.match(retry.stderr, /test_coverage_gap/u);
  assert.equal(run(["import-spool", "ops"]).status, 1);
  const gapsFile = journal + ".coverage.jsonl";
  const gaps = readFileSync(gapsFile, "utf8");
  assert.equal(JSON.parse(gaps).code, "test_coverage_gap");
  assert.equal(run(["import-spool", "ops"]).status, 1);
  assert.equal(readFileSync(gapsFile, "utf8"), gaps);
});

test("trusted import rejects foreign scope, owner claims, malformed data, future clocks and workspace links", t => {
  const { project, run, mark, journal, spool } = fixture(t);
  assert.equal(mark("task.accepted", "accept").status, 2);
  assert.equal(mark("solo.confirmed", "pass", { decision_id: "A" }).status, 2);
  assert.equal(run(["mark", "ops", "task.started", "start", "--actor", "operator"], "{}").status, 2);
  assert.equal(mark("task.started", "start").status, 0);
  const input = spool();
  const good = readFileSync(input, "utf8");
  const base = JSON.parse(good);
  for (const change of [{ task_id: "T2" }, { source_id: "other", task_id: "T2" }, { actor_role: "operator" },
    { event_type: "task.accepted" }, { occurred_at: "2099-01-01T00:00:00Z" }, { observed_at: "bad" },
    { data: { private: "private-message" } }, { data: { session_id: "T2" } }, { event_id: "unissued" }, { event_type: "test.started", data: {} }]) {
    writeFileSync(input, good + JSON.stringify({ ...base, ...change }) + "\n");
    const result = run(["import-spool", "ops"]);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stderr, /private-message/u);
    assert.equal(existsSync(journal), false);
  }
  rmSync(input);
  const bait = join(project, "unrelated");
  writeFileSync(bait, good, { mode: 0o600 });
  symlinkSync(bait, input);
  assert.equal(run(["import-spool", "ops"]).status, 2);
  assert.equal(existsSync(journal), false);
});

test("valid wrapper executes once on missing telemetry and malformed invocations leave the command untouched", t => {
  const { project, journal, profile, run } = fixture(t);
  const command = [process.execPath, "-e", "require('node:fs').appendFileSync('executed','x');process.exit(9)"];
  const count = join(project, "executed");
  const attempt = ["run-test", "owner", "fresh-suite", "fresh-attempt", "--", ...command];
  mkdirSync(journal);
  assert.equal(run(["run-test", "owner", "fresh-suite", "fresh-attempt", ...command]).status, 2);
  assert.equal(existsSync(count), false);
  const result = run(attempt);
  assert.equal(result.status, 9);
  assert.match(result.stderr, /test_coverage_gap/u);
  assert.equal(readFileSync(count, "utf8"), "x");
  rmSync(profile);
  assert.equal(run(attempt).status, 9);
  assert.equal(readFileSync(count, "utf8"), "xx");
  assert.equal(run(["run-test", "owner", "fresh-suite", "fresh-attempt", "--", "-e", ...command]).status, 2);
  assert.equal(readFileSync(count, "utf8"), "xx");
});
