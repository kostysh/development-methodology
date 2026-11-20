import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const installed = process.env.METHODOLOGY_METRICS_BIN;
const cli = fileURLToPath(new URL("../dist/metrics.js", import.meta.url));
function fixture(t: TestContext, provider = "codex") {
  const root = mkdtempSync(join(tmpdir(), "metrics integration ' "));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const project = join(root, "project");
  const journal = join(root, "journal");
  const path = join(root, "profile");
  const transcript = join(root, "session.jsonl");
  mkdirSync(project);
  const properties = { project_root: project, project_id: "local", identity_key: "ac".repeat(32), journal,
    issued_ids: ["T", "S", "A", "B", "D", "X", "Y"], sources: {
      host: { kind: provider + "_hook", task_id: "T" }, ops: { kind: "normalized", task_id: "T" },
      other: { kind: "normalized", task_id: "B" } },
    categories: { action_type: ["shell", "edit"], outcome: ["success", "failure"] } };
  const save = () => writeFileSync(path, JSON.stringify(properties), { mode: 0o600 });
  save();
  const run = (args: string[], input = "", env = process.env) => {
    const child = spawnSync(installed ?? process.execPath, [...(installed ? [] : [cli]), args[0], path, ...args.slice(1)], { cwd: project, input, encoding: "utf8", env });
    assert.ifError(child.error);
    return child;
  };
  return { root, project, journal, path, transcript, properties, run, save };
}

for (const provider of ["codex", "claude"]) {
  test(provider + " installed hooks collect only the operator-selected session, check fresh callbacks and restore exact settings", t => {
    const { root, project, journal, path, transcript, run } = fixture(t, provider);
    assert.equal(spawnSync("git", ["init", "-q", project]).status, 0);
    const bin = join(root, "bin");
    mkdirSync(bin);
    const shim = join(bin, "methodology-metrics");
    const shell = (arg: string) => "'" + arg.replaceAll("'", "'\\''") + "'";
    writeFileSync(shim, "#!/bin/sh\nexec " + [process.execPath, cli].map(shell).join(" ") + ' "$@"\n', { mode: 0o700 });
    const env = { ...process.env, PATH: (process.env.METHODOLOGY_METRICS_BIN ? dirname(process.env.METHODOLOGY_METRICS_BIN) : bin) + ":" + process.env.PATH };
    const dir = join(project, provider === "claude" ? ".claude" : ".codex");
    mkdirSync(dir);
    const settings = join(dir, provider === "claude" ? "settings.local.json" : "hooks.json");
    const prior = { hooks: { Stop: [{ matcher: "other", hooks: [{ type: "command", command: "true" }] }] },
      ...(provider === "claude" ? { permissions: { allow: ["Read"] } } : {}) };
    const original = JSON.stringify(prior) + "  \n";
    writeFileSync(settings, original);
    assert.equal(spawnSync("git", ["-C", project, "add", "-f", settings]).status, 0);
    assert.equal(run(["install-hooks", "host"]).status, 0);
    const installed = readFileSync(settings, "utf8");
    assert.equal(run(["install-hooks", "host"]).status, 0);
    assert.equal(readFileSync(settings, "utf8"), installed);
    const hooks = JSON.parse(installed).hooks;
    assert.ok(!installed.includes(root) && !installed.includes(process.execPath));
    assert.equal(run(["doctor", "host"], "", env).status, 1);
    assert.equal(run(["arm-session", "host"]).status, 2);
    assert.equal(run(["bind-session", "host", "approved"]).status, 0);
    function dispatch(phase: string, session: string, fields: Record<string, unknown> = {}, diagnostic = "") {
      const command = hooks[phase].at(-1).hooks[0].command;
      const child = spawnSync("/bin/sh", ["-c", command], { cwd: project, encoding: "utf8", env,
        input: JSON.stringify({ hook_event_name: phase, cwd: project, session_id: session, transcript_path: transcript,
          prompt: "private-message", tool_input: { command: "private-command" }, ...fields }) });
      assert.ifError(child.error);
      assert.equal(child.status, 0, phase);
      assert.equal(child.stdout, "", phase);
      assert.equal(child.stderr, diagnostic, phase);
    }
    writeFileSync(transcript, "old-private-content-outside-authorized-range\n");
    dispatch("UserPromptSubmit", "foreign", { prompt: "another" });
    dispatch("PostToolUse", "foreign", { tool_use_id: "unrelated", tool_name: "Bash" });
    assert.equal(existsSync(journal), false);
    assert.equal(run(["doctor", "host"], "", env).status, 1);
    dispatch("SessionStart", "approved");
    assert.equal(run(["doctor", "host"], "", env).status, 0);
    assert.equal(run(["doctor", "host", "--probe"], "", env).status, 1);
    dispatch("UserPromptSubmit", "foreign");
    assert.equal(run(["doctor", "host"], "", env).status, 1);
    const tool = { tool_use_id: "local_call", tool_name: "Bash" };
    dispatch("PreToolUse", "approved", tool);
    dispatch("PostToolUse", "approved", tool);
    const stamp = "2026-11-03T00:00:00.000777Z";
    const boundary = provider === "codex" ? { type: "compacted", timestamp: stamp, payload: { message: "private-summary" } }
      : { type: "system", subtype: "compact_boundary", sessionId: "approved", uuid: "unique-id", timestamp: stamp,
        compactMetadata: { trigger: "manual" } };
    appendFileSync(transcript, JSON.stringify(boundary) + "\n");
    const savedJournal = journal + ".saved";
    const coverage = journal + ".coverage.jsonl";
    const broken = "methodology-metrics: journal_unavailable\n";
    renameSync(journal, savedJournal);
    mkdirSync(journal);
    const flush = (session: string) => run(["flush-hook", "host"], JSON.stringify({
      hook_event_name: "PostCompact", session_id: session, transcript_path: transcript,
    }));
    assert.equal(flush("foreign").status, 0);
    assert.equal(readFileSync(coverage, "utf8"), "");
    const deferred = flush("approved");
    assert.equal(deferred.status, 2);
    assert.equal(deferred.stderr, broken);
    const deferredGaps = readFileSync(coverage, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.deepEqual(deferredGaps.map(gap => [gap.source_id, gap.code]), [["host", "native_hook_collection_failed"]]);
    rmdirSync(journal);
    renameSync(savedJournal, journal);
    dispatch("PostCompact", "approved", { compact_summary: "private-summary" });
    const first = readFileSync(journal, "utf8");
    assert.deepEqual(first.trim().split("\n").map(line => JSON.parse(line).event_type),
      ["activity.started", "activity.finished", "context.compacted"]);
    assert.doesNotMatch(first, /private|approved|foreign|local_call|unique-id/u);
    dispatch("PostCompact", "approved"); dispatch("Stop", "approved");
    dispatch("PostToolUse", "approved", tool); dispatch("PostToolUse", "foreign", tool);
    dispatch("PostCompact", "foreign");
    assert.equal(readFileSync(journal, "utf8"), first);

    const savedProfile = path + ".saved";
    renameSync(path, savedProfile);
    for (const phase of Object.keys(hooks)) {
      dispatch(phase, "approved", tool, "methodology-metrics: invalid_profile\n");
    }
    assert.equal(run(["doctor", "host"], "", env).status, 2);
    assert.equal(run(["install-hooks", "host"]).status, 2);
    assert.equal(run(["summary", "T"]).status, 2);
    renameSync(savedProfile, path);

    // A directory is unwritable as a journal even when the test runs as root.
    renameSync(journal, savedJournal);
    mkdirSync(journal);
    dispatch("SessionStart", "approved");
    dispatch("UserPromptSubmit", "approved");
    dispatch("PreToolUse", "foreign", tool);
    for (const phase of Object.keys(hooks).filter(name => name !== "SessionStart" && name !== "UserPromptSubmit")) {
      dispatch(phase, "approved", { ...tool, stop_hook_active: true }, broken);
    }
    const savedCoverage = coverage + ".saved";
    renameSync(coverage, savedCoverage);
    mkdirSync(coverage);
    dispatch("PreToolUse", "approved", tool, broken);
    rmdirSync(coverage);
    renameSync(savedCoverage, coverage);
    const manual = run(["mark", "ops", "task.started", "failure"], "{}");
    assert.equal(manual.status, 2);
    assert.equal(manual.stderr, broken);
    assert.equal(run(["summary", "T"]).status, 2);
    rmdirSync(journal);
    renameSync(savedJournal, journal);
    const reported = JSON.parse(run(["summary", "T"]).stdout);
    const nativeGaps = reported.coverage.gaps.filter((gap: {source_id: string; code: string}) =>
      gap.source_id === "host" && gap.code === "native_hook_collection_failed");
    assert.ok(nativeGaps.length >= Object.keys(hooks).length - 1);
    assert.equal(readFileSync(journal, "utf8"), first);
    dispatch("PreToolUse", "approved", { ...tool, tool_use_id: "after-recovery" });
    assert.equal(JSON.parse(readFileSync(journal, "utf8").trimEnd().split("\n").at(-1)!).event_type, "activity.started");

    assert.equal(run(["uninstall-hooks", "host"]).status, 0);
    assert.equal(readFileSync(settings, "utf8"), original);
    assert.equal(run(["doctor", "host"], "", env).status, 1);
    assert.equal(run(["install-hooks", "host"]).status, 0);
    assert.equal(run(["doctor", "host"], "", env).status, 1);
    const changed = JSON.parse(readFileSync(settings, "utf8"));
    changed.hooks.Stop.push({ matcher: "concurrent", hooks: [{ type: "command", command: "true" }] });
    writeFileSync(settings, JSON.stringify(changed));
    assert.equal(run(["uninstall-hooks", "host"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")).hooks.Stop.map((r: {matcher: string}) => r.matcher), ["other", "concurrent"]);
  });
}

test("upgrading a v5 hook removes its old machine paths and preserves unrelated handlers", t => {
  const { project, path, run } = fixture(t);
  assert.equal(spawnSync("git", ["init", "-q", project]).status, 0);
  const dir = join(project, ".codex");
  mkdirSync(dir);
  const file = join(dir, "hooks.json");
  const shell = (arg: string) => "'" + arg.replaceAll("'", "'\\''") + "'";
  const old = ["/missing/node", "/old/dist/metrics.js", "hook", path, "host"].map(shell).join(" ");
  const handler = { hooks: [{ type: "command", command: old }] };
  const unrelated = { matcher: "another", hooks: [{ type: "command", command: "true" }] };
  writeFileSync(file, JSON.stringify({ hooks: { Stop: [unrelated, handler] } }));
  assert.equal(run(["install-hooks", "host"]).status, 0);
  const upgraded = readFileSync(file, "utf8");
  assert.doesNotMatch(upgraded, /missing|old\/dist/u);
  assert.ok(!upgraded.includes(path));
  assert.equal(run(["uninstall-hooks", "host"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { hooks: { Stop: [unrelated] } });
});

test("actual runner preserves command status on replay and keeps the first attempt", t => {
  const { project, journal, run } = fixture(t);
  const git = (...args: string[]) => spawnSync("git", args, { cwd: project, encoding: "utf8" });
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("-c", "user.name=Test", "-c", "user.email=t@example.invalid", "commit", "--allow-empty", "-qm", "base").status, 0);
  const attempt = ["run-test", "ops", "S", "A", "--", process.execPath, "-e", "process.exit(7)"];
  assert.equal(run(attempt).status, 7);
  const history = readFileSync(journal, "utf8");
  const rows = history.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(rows.map(row => row.event_type), ["test.started", "test.finished"]);
  assert.equal(rows[1].data.checkout_sha, git("rev-parse", "HEAD").stdout.trim());
  assert.equal(rows[1].data.exit_code, 7);
  const repeated = run(attempt);
  assert.equal(repeated.status, 7);
  assert.match(repeated.stderr, /test_coverage_gap/u);
  assert.equal(readFileSync(journal, "utf8"), history);
});

test("mark reuses the actual occurrence clock, summary scopes sources and the operator can compare evidence", t => {
  const { run, journal } = fixture(t);
  const mark = (source: string, type: string, occurrence: string, data = {}, at?: string) =>
    run(["mark", source, type, occurrence, ...(at ? ["--at", at] : [])], JSON.stringify(data));
  assert.equal(mark("ops", "solo.decided", "choose", { decision_id: "D", decision_class: "generic_error" }).status, 0);
  const first = readFileSync(journal, "utf8");
  assert.equal(mark("ops", "solo.decided", "choose", { decision_id: "D", decision_class: "generic_error" }).status, 0);
  assert.equal(readFileSync(journal, "utf8"), first);
  const a = "2025-01-01T10:00:00Z";
  const b = "2025-01-01T10:05:00Z";
  assert.equal(mark("ops", "task.started", "start", {}, a).status, 0);
  assert.equal(mark("ops", "task.accepted", "accept", {}, b).status, 0);
  assert.equal(mark("other", "task.accepted", "accept", {}, b).status, 0);
  const asOf = ["--as-of", "2040-01-01T00:00:00Z"];
  const summary = JSON.parse(run(["summary", "T", ...asOf]).stdout);
  assert.deepEqual(summary.coverage.sources.map((row: {source_id: string}) => row.source_id), ["ops"]);
  assert.equal(summary.solo.counts.pending, 1);
  const current = JSON.parse(run(["summary", "T"]).stdout);
  assert.equal(current.solo.counts.pending, summary.solo.counts.pending);
  assert.equal(run(["compare", "T", "B"]).status, 0);
  const comparison = JSON.parse(run(["compare", "T", "B", ...asOf]).stdout);
  assert.equal(comparison.before.acceptance_ms, 300000);
  assert.deepEqual(comparison.change.disputes, { status: "insufficient_data", value: null });
  assert.deepEqual(comparison.change.acceptance_ms, { status: "insufficient_data", value: null });
});

test("compares two measured task histories with a complete zero and excludes missing historical evidence", t => {
  const { run, properties, save } = fixture(t);
  const a = "2025-01-01T10:00:00Z";
  const b = "2025-01-01T11:00:00Z";
  Object.assign(properties, { coverage: ["ops", "other"].map(source_id => ({
    source_id, event_types: ["test.dispute_raised", "test.dispute_resolved"], from: a, through: b, status: "complete",
  })) });
  save();
  const mark = (source: string, type: string, at: string, fields = {}) =>
    assert.equal(run(["mark", source, type, type, "--at", at], JSON.stringify(fields)).status, 0);
  for (const source of ["ops", "other"]) mark(source, "task.started", a);
  mark("ops", "task.accepted", b);
  mark("other", "task.accepted", "2025-01-01T10:30:00Z");
  mark("ops", "test.dispute_raised", "2025-01-01T10:02:00Z", { dispute_id: "D" });
  mark("ops", "test.dispute_resolved", "2025-01-01T10:04:00Z", { dispute_id: "D" });
  const result = JSON.parse(run(["compare", "T", "B", "--as-of", "2040-01-01T00:00:00Z"]).stdout);
  assert.deepEqual(result.change, { acceptance_ms: { status: "known", value: -1800000 }, disputes: { status: "known", value: -1 } });
});

test("Git post-rewrite records named branch tips on both amend and rebase", t => {
  const { run, journal, project, path, properties, save } = fixture(t);
  Object.assign(properties.categories, { operation_type: ["amend", "rebase"] });
  save();
  const git = (...args: string[]) => {
    const child = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.invalid", ...args], { cwd: project, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr); return child.stdout.trim();
  };
  git("init", "--quiet", "-b", "main");
  const shellQuote = (part: string) => "'" + part.replaceAll("'", "'\\''") + "'";
  const argv = [...(installed ? [installed] : [process.execPath, cli]), "git-rewrite", path, "ops"];
  writeFileSync(join(project, ".git", "hooks", "post-rewrite"), "#!/bin/sh\nexec " + argv.map(shellQuote).join(" ") + ' "$1"\n', { mode: 0o700 });
  const commit = (file: string) => {
    writeFileSync(join(project, file), file);
    git("add", file); git("commit", "-qm", file);
    return git("rev-parse", "HEAD");
  };
  commit("base"); git("switch", "-qc", "feature");
  const original = commit("feature");
  git("commit", "--amend", "-qm", "amended");
  const amended = git("rev-parse", "HEAD");
  git("switch", "-q", "main"); commit("upstream"); git("switch", "-q", "feature");
  git("rebase", "main");
  const rebased = git("rev-parse", "HEAD");
  assert.notEqual(amended, rebased);
  const rows = readFileSync(journal, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(rows.map(row => [row.event_type, row.data.operation_type, row.data.old_sha, row.data.new_sha]), [
    ["ref.rewritten", "amend", original, amended],
    ["ref.rewritten", "rebase", amended, rebased],
  ]);
  assert.equal(run(["git-rewrite", "ops", "rebase"], rebased + " " + amended + "\n").status, 1);
});

test("repeated GitHub sync across PR revisions and merge keeps the original opening time", t => {
  const { root, run, journal, properties, save } = fixture(t);
  Object.assign(properties.sources, { github: { kind: "github_jobs", task_id: "T" },
    webhook: { kind: "github_webhook", path: "webhook.jsonl", task_id: "T" } });
  save();
  const responsePath = join(root, "pr.json");
  const mock = join(root, "rest.mjs");
  writeFileSync(mock, `import { readFileSync } from "node:fs";
globalThis.fetch = async url => {
  const path = new URL(url).pathname.replace("/repos/space/project", "");
  if (path === "") return Response.json({ id: 8 });
  if (path === "/pulls/12") return Response.json(JSON.parse(readFileSync(process.env.TEST_PR_FILE, "utf8")));
  if (path === "/actions/runs") return Response.json({ total_count: 0, workflow_runs: [] });
  throw Error("unexpected request");
};`);
  const env = { ...process.env, TEST_PR_FILE: responsePath, NODE_OPTIONS: "--import=" + pathToFileURL(mock).href };
  const at = "2024-01-01T10:00:00Z";
  const opening = "2024-01-01T10:05:00Z";
  const mergedAt = "2024-01-01T11:00:00Z";
  const a = "a".repeat(40), b = "b".repeat(40);
  const pr = (sha: string, merged: boolean) => ({ number: 12, created_at: opening, head: { sha }, merged,
    merged_at: merged ? mergedAt : null, merge_commit_sha: merged ? "c".repeat(40) : null });
  const sync = (sha: string, merged: boolean) => {
    writeFileSync(responsePath, JSON.stringify(pr(sha, merged)));
    const child = run(["github-sync", "github", "space/project", "12"], "", env);
    assert.equal(child.status, 0, child.stderr);
  };
  assert.equal(run(["mark", "ops", "task.started", "start", "--at", at], "{}").status, 0);
  sync(a, false);
  const history = readFileSync(journal, "utf8");
  sync(b, false);
  assert.equal(readFileSync(journal, "utf8"), history);
  // Recreate earlier candidate projections of the same stable opening on two heads.
  const legacy = history.trim().split("\n").map(line => JSON.parse(line)).find(row => row.event_type === "pull_request.opened");
  assert.ok(legacy);
  for (const sha of [a, b]) appendFileSync(journal, JSON.stringify({ ...legacy, data: { ...legacy.data, head_sha: sha } }) + "\n");
  // An actual opened webhook can still supply the original revision.
  writeFileSync(join(root, "webhook.jsonl"), JSON.stringify({ action: "opened", repository: { id: 8 }, pull_request: pr(a, false) }));
  assert.equal(run(["collect", "webhook"]).status, 0);
  sync(b, true);
  const completed = readFileSync(journal, "utf8");
  sync(b, true);
  assert.equal(readFileSync(journal, "utf8"), completed);
  const report = JSON.parse(run(["summary", "T", "--as-of", "2040-01-01T00:00:00Z"]).stdout);
  assert.deepEqual(report.coverage.gaps, []);
  assert.equal(report.pre_pr.calendar_ms.value, 300000);
  assert.equal(report.observed_merge_windows.value, 1);
});
