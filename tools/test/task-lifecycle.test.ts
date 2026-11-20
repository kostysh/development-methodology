import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "task lifecycle "));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const project = join(root, "primary"), linked = join(root, "linked"), home = join(root, "private");
  mkdirSync(project);
  const installed = process.env.METHODOLOGY_TASK_BIN ?? (process.env.METHODOLOGY_METRICS_BIN && join(dirname(process.env.METHODOLOGY_METRICS_BIN), "methodology-task"));
  const bin = installed ? dirname(installed) : join(root, "bin");
  if (!installed) {
    mkdirSync(bin);
    for (const name of ["task", "metrics", "recovery"]) {
      const file = fileURLToPath(new URL("../dist/" + name + ".js", import.meta.url));
      const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
      writeFileSync(join(bin, "methodology-" + name), "#!/bin/sh\nexec " + quote(process.execPath) + " " + quote(file) + ' "$@"\n', { mode: 0o700 });
    }
  }
  const env = { PATH: bin + ":" + process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", METHODOLOGY_TASK_HOME: home };
  function run(name: string, args: string[], status = 0, cwd = project, input = "", overrides: NodeJS.ProcessEnv = {}) {
    const child = spawnSync(name, args, { cwd, env: { ...env, ...overrides }, input, encoding: "utf8", timeout: 12000 });
    assert.ifError(child.error);
    assert.equal(child.status, status, child.stderr + "\n" + child.stdout);
    return child.stdout;
  }
  run("git", ["init", "-q"]);
  run("git", ["-c", "user.name=Test", "-c", "user.email=t@example.invalid", "commit", "--allow-empty", "-qm", "base"]);
  run("git", ["worktree", "add", "-q", "--detach", linked]);
  const task = (args: string[], expected = 0) => {
    const output = run("methodology-task", args, expected);
    return output ? JSON.parse(output) : undefined;
  };
  const beginInBackground = (args: string[]) => new Promise<void>((resolve, reject) => {
    execFile("methodology-task", args, { cwd: project, env, timeout: 12000 }, (error, stdout, stderr) => {
      try {
        assert.equal(error?.code, 1, stderr + "\n" + stdout);
        assert.equal(JSON.parse(stdout).status, "awaiting_callback");
        resolve();
      } catch (failure) { reject(failure); }
    });
  });
  const hooks = join(project, ".codex", "hooks.json");
  mkdirSync(dirname(hooks));
  const original = '{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "true" }] }] } }\n';
  writeFileSync(hooks, original);
  function dispatch(cwd: string, session: string, event: string, role = "metrics", client = "codex", transcript?: string) {
    const path = client === "codex" ? hooks : join(cwd, ".claude", "settings.local.json");
    const rows = JSON.parse(readFileSync(path, "utf8")).hooks[event];
    const command: string = rows.flatMap((r: { hooks: { command: string }[] }) => r.hooks)
      .find((h: { command: string }) => h.command === "methodology-" + role + " dispatch-hook " + client).command;
    return run("/bin/sh", ["-c", command], 0, cwd, JSON.stringify({
      hook_event_name: event, source: "compact", cwd, session_id: session, transcript_path: transcript, tool_use_id: "call", tool_name: "Bash",
    }));
  }
  return { root, project, linked, home, hooks, original, run, task, dispatch, beginInBackground };
}

test("begins and finishes an installed task with a workspace spool and explicit acceptance", t => {
  const f = fixture(t);
  f.run("git", ["add", "--force", ".codex/hooks.json"]);
  f.run("git", ["-c", "user.name=Test", "-c", "user.email=t@example.invalid", "commit", "-qm", "tracked hooks"]);
  const setup = ["setup", "project", "--clients", "codex,claude", "--recovery"];
  const moved = join(f.root, "moved-checkout");
  mkdirSync(moved);
  writeFileSync(join(moved, ".git"), "gitdir: ../unavailable\n");
  const unsafe = join(moved, "private");
  f.run("methodology-task", setup, 2, f.project, "", { METHODOLOGY_TASK_HOME: unsafe });
  assert.equal(existsSync(unsafe), false);
  assert.deepEqual(f.task(setup), f.task(setup));
  const begin = ["begin", "T1", f.linked, "codex=actual", "claude=panel"];
  const first = f.task(begin, 1);
  assert.equal(first.status, "awaiting_callback");
  assert.equal(f.run("git", ["status", "--porcelain", "--untracked-files=all"]), " M .codex/hooks.json\n");
  assert.deepEqual(first.doctors.map((d: { callback: string }) => d.callback), ["unobserved", "unobserved"]);
  const profile = JSON.parse(readFileSync(first.metrics_profile, "utf8"));
  assert.equal(statSync(first.metrics_profile).mode & 0o777, 0o600);
  assert.ok(first.metrics_profile.startsWith(f.home + "/"));
  assert.doesNotMatch(readFileSync(f.hooks, "utf8"), new RegExp(profile.identity_key));
  assert.equal(f.run("git", ["check-ignore", "--", ".methodology/operation-spool-test", ".methodology/task-state/T1.md"], 0, f.linked).trim().split("\n").length, 2);
  f.run("methodology-recovery", ["write", first.recovery_profile], 0, f.linked, "Current acceptance check.\n");
  assert.equal(f.dispatch(f.linked, "foreign", "SessionStart", "recovery"), "");
  assert.match(f.dispatch(f.linked, "actual", "SessionStart", "recovery"), /Current acceptance check/u);
  f.dispatch(f.linked, "actual", "PreToolUse");
  f.dispatch(f.linked, "panel", "SessionStart", "metrics", "claude");
  assert.equal(f.task(begin).status, "ready");
  f.run("methodology-metrics", ["run-test", first.metrics_profile, "ops", "suite", "try1", "--", process.execPath, "-e", "process.exit(0)"], 0, f.linked);
  const finished = f.task(["finish", "T1", "--accepted"]);
  assert.equal(finished.accepted, true);
  assert.equal(finished.summary.tests.attempts.value, 1);
  assert.equal(finished.summary.lead_time.endpoint_estimated, false);
  assert.equal(finished.spool.appended, 2);
  assert.deepEqual(f.task(["finish", "T1", "--accepted"]), finished);
  assert.equal(readFileSync(f.hooks, "utf8"), f.original);
  assert.equal(f.run("git", ["status", "--porcelain", "--untracked-files=all"]), "");
  assert.equal(existsSync(join(f.linked, ".claude/settings.local.json")), false);
  const events = readFileSync(join(dirname(first.metrics_profile), profile.journal), "utf8").trim().split("\n").map(line => JSON.parse(line));
  for (const type of ["task.started", "task.accepted", "test.started", "test.finished"]) assert.equal(events.filter(e => e.event_type === type).length, 1, type);
});

test("finish includes the selected session's deferred transcript observations before sealing the receipt", t => {
  const f = fixture(t);
  f.task(["setup", "project", "--clients", "codex"]);
  f.task(["begin", "T1", f.linked, "codex=one"], 1);
  const transcript = join(f.root, "rollout.jsonl");
  writeFileSync(transcript, "");
  f.dispatch(f.linked, "one", "SessionStart", "metrics", "codex", transcript);
  f.dispatch(f.linked, "one", "PostCompact", "metrics", "codex", transcript);
  // The host stores its compaction record after the synchronous callback.
  writeFileSync(transcript, JSON.stringify({ type: "compacted", timestamp: new Date().toISOString(), payload: {} }) + "\n");
  const finished = f.task(["finish", "T1", "--accepted"]);
  assert.equal(finished.summary.compactions.count.value, 1);
  assert.deepEqual(f.task(["finish", "T1", "--accepted"]), finished);
});

test("isolates linked tasks and preserves a missing callback on finish", async t => {
  const f = fixture(t);
  rmSync(dirname(f.hooks), { recursive: true });
  const exclude = join(f.project, ".git/info/exclude");
  const originalExcludes = "\xEF\xBB\xBF/user-only\n/.methodology/operation-spool-*\n/.methodology/task-state/\n# User's rule \xE9";
  writeFileSync(exclude, originalExcludes, "latin1");
  const status = () => f.run("git", ["status", "--porcelain", "--untracked-files=all"]);
  f.task(["setup", "project", "--clients", "codex", "--recovery"]);
  f.task(["begin", "T1", f.linked, "codex=one"], 1);
  assert.ok(existsSync(f.hooks));
  assert.equal(status(), "");
  assert.equal(f.run("git", ["check-ignore", "--", "user-only"]), "user-only\n");
  f.task(["begin", "T2", f.project, "codex=one"], 2);
  await Promise.all([
    f.beginInBackground(["begin", "T1"]),
    f.beginInBackground(["begin", "T2", f.project, "codex=two"]),
  ]);
  f.task(["begin", "T3", f.linked, "codex=two"], 2);
  assert.equal(status(), "");
  assert.equal(f.run("git", ["check-ignore", "--", ".codex/hooks.json"]), ".codex/hooks.json\n");
  const newerUserRule = "\n/another-user-file\n";
  appendFileSync(exclude, newerUserRule);
  f.dispatch(f.project, "one", "SessionStart");
  assert.equal(f.task(["begin", "T2"], 1).doctors[0].callback, "unobserved");
  assert.equal(f.task(["begin", "T1"], 1).doctors[0].callback, "unobserved");
  const final = f.task(["finish", "T1"], 1);
  assert.equal(final.accepted, false);
  assert.equal(final.doctors[0].callback, "unobserved");
  assert.equal(final.summary.lead_time.open, true);
  assert.equal(final.summary.lead_time.end_at, null);
  assert.deepEqual(f.task(["finish", "T1"], 1), final);
  f.task(["finish", "T1", "--accepted"], 2);
  assert.ok(existsSync(f.hooks));
  assert.equal(status(), "");
  f.dispatch(f.project, "two", "SessionStart");
  assert.equal(f.task(["begin", "T2"]).status, "ready");
  const last = f.task(["finish", "T2"]);
  assert.deepEqual(f.task(["finish", "T2"]), last);
  assert.equal(existsSync(f.hooks), false);
  assert.equal(status(), "");
  assert.equal(f.run("git", ["check-ignore", "--", ".codex/hooks.json"], 1), "");
  assert.equal(readFileSync(exclude, "latin1"), originalExcludes + newerUserRule);

  // An ignore rule already owned by the user survives task rollback.
  const userIgnoresHooks = originalExcludes + newerUserRule + "/.codex/hooks.json\n";
  writeFileSync(exclude, userIgnoresHooks, "latin1");
  f.task(["begin", "T3", f.linked, "codex=three"], 1);
  assert.equal(status(), "");
  assert.equal(readFileSync(exclude, "latin1"), userIgnoresHooks);
  f.task(["finish", "T3"], 1);
  assert.equal(existsSync(f.hooks), false);
  assert.equal(readFileSync(exclude, "latin1"), userIgnoresHooks);

  const userWantsVisible = "!/.codex/hooks.json\n";
  const originalRules = originalExcludes + newerUserRule;
  for (const [task, rules, contents] of [
    ["T4", exclude, originalRules + userWantsVisible],
    ["T5", join(f.project, ".gitignore"), userWantsVisible],
  ]) {
    writeFileSync(exclude, originalRules, "latin1");
    writeFileSync(rules, contents, "latin1");
    f.task(["begin", task, f.linked, "codex=" + task], 1);
    assert.equal(f.run("git", ["status", "--porcelain", "--untracked-files=all", "--", ".codex/hooks.json"]),
      "?? .codex/hooks.json\n");
    f.task(["finish", task], 1);
    assert.equal(existsSync(f.hooks), false);
    assert.equal(readFileSync(rules, "latin1"), contents);
  }
  assert.equal(readFileSync(exclude, "latin1"), originalRules);
});

test("retries a failed spool import without closing or accepting the task", t => {
  const f = fixture(t);
  f.task(["setup", "project", "--clients", "codex"]);
  const first = f.task(["begin", "T1", f.linked, "codex=one"], 1);
  assert.equal(f.run("git", ["status", "--porcelain", "--untracked-files=all"]), "?? .codex/hooks.json\n");
  f.dispatch(f.linked, "one", "SessionStart");
  const dir = join(f.linked, ".methodology");
  const path = join(dir, readdirSync(dir).find(n => /^operation-spool-.+(?<!\.coverage)\.jsonl$/u.test(n))!);
  const valid = readFileSync(path);
  writeFileSync(path, "invalid spool\n");
  f.task(["finish", "T1", "--accepted"], 2);
  assert.match(readFileSync(f.hooks, "utf8"), /dispatch-hook/u);
  assert.doesNotMatch(readFileSync(join(dirname(first.metrics_profile), "events.jsonl"), "utf8"), /task.accepted/u);
  writeFileSync(path, valid);
  assert.equal(f.task(["finish", "T1", "--accepted"]).accepted, true);
  assert.equal(readFileSync(f.hooks, "utf8"), f.original);
});

test("provisions approved checkout skills and checks tracked skills", t => {
  const f = fixture(t);
  const source = join(f.root, "approved");
  mkdirSync(join(source, "sample"), { recursive: true });
  writeFileSync(join(source, "sample/SKILL.md"), "# Approved\n");
  f.task(["setup", "project", "--clients", "codex", "--skills", "per-checkout", "--skill", "sample", "--skill-source", source]);
  f.task(["begin", "T1", f.linked, "codex=one"], 1);
  const entry = join(f.linked, ".agents/skills/sample/SKILL.md");
  assert.equal(readFileSync(entry, "utf8"), "# Approved\n");
  writeFileSync(entry, "# Locally changed\n");
  f.task(["begin", "T1"], 2);
  assert.equal(readFileSync(entry, "utf8"), "# Locally changed\n");

  const g = fixture(t);
  g.task(["setup", "project", "--clients", "claude", "--skills", "tracked", "--skill", "sample"]);
  const tracked = join(g.project, ".claude/skills/sample/SKILL.md");
  mkdirSync(dirname(tracked), { recursive: true });
  writeFileSync(tracked, "# Tracked\n");
  g.task(["begin", "T1", g.project, "claude=one"], 2);
  g.task(["finish", "T1", "--accepted"], 2);
  assert.equal(g.task(["finish", "T1"]).status, "setup_cancelled");
  g.run("git", ["add", "--", tracked]);
  assert.equal(g.task(["begin", "T2", g.project, "claude=one"], 1).skills, "tracked");
});
