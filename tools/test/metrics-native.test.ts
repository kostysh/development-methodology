import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  test(provider + " installed hooks bind only the challenged session, project post-bind events, replay and uninstall", t => {
    const { project, journal, transcript, run } = fixture(t, provider);
    const dir = join(project, provider === "claude" ? ".claude" : ".codex");
    mkdirSync(dir);
    const settings = join(dir, provider === "claude" ? "settings.local.json" : "hooks.json");
    const prior = { hooks: { Stop: [{ matcher: "other", hooks: [{ type: "command", command: "true" }] }] },
      ...(provider === "claude" ? { permissions: { allow: ["Read"] } } : {}) };
    writeFileSync(settings, JSON.stringify(prior));
    assert.equal(run(["install-hooks", "host"]).status, 0);
    const installed = readFileSync(settings, "utf8");
    assert.equal(run(["install-hooks", "host"]).status, 0);
    assert.equal(readFileSync(settings, "utf8"), installed);
    const hooks = JSON.parse(installed).hooks;
    const prompt = run(["arm-session", "host"]).stdout.trim();
    assert.match(prompt, /^methodology-bind [\da-f]{48}$/u);
    function dispatch(phase: string, session: string, fields: Record<string, unknown> = {}) {
      const command = hooks[phase].at(-1).hooks[0].command;
      const child = spawnSync("/bin/sh", ["-c", command], { cwd: project, encoding: "utf8",
        input: JSON.stringify({ hook_event_name: phase, cwd: project, session_id: session, transcript_path: transcript,
          prompt: "private-message", tool_input: { command: "private-command" }, ...fields }) });
      assert.equal(child.status, 0); assert.equal(child.stdout, ""); assert.equal(child.stderr, "");
    }
    writeFileSync(transcript, "old-private-content-outside-authorized-range\n");
    dispatch("UserPromptSubmit", "foreign", { prompt: "another" });
    dispatch("PostToolUse", "foreign", { tool_use_id: "unrelated", tool_name: "Bash" });
    assert.equal(existsSync(journal), false);
    dispatch("UserPromptSubmit", "approved", { prompt });
    dispatch("UserPromptSubmit", "foreign", { prompt }); // A consumed challenge cannot rebind the source.
    const tool = { tool_use_id: "local_call", tool_name: "Bash" };
    dispatch("PreToolUse", "approved", tool);
    dispatch("PostToolUse", "approved", tool);
    const stamp = "2026-11-03T00:00:00.000777Z";
    const boundary = provider === "codex" ? { type: "compacted", timestamp: stamp, payload: { message: "private-summary" } }
      : { type: "system", subtype: "compact_boundary", sessionId: "approved", uuid: "unique-id", timestamp: stamp,
        compactMetadata: { trigger: "manual" } };
    appendFileSync(transcript, JSON.stringify(boundary) + "\n");
    dispatch("PostCompact", "approved", { compact_summary: "private-summary" });
    const first = readFileSync(journal, "utf8");
    assert.deepEqual(first.trim().split("\n").map(line => JSON.parse(line).event_type),
      ["activity.started", "activity.finished", "context.compacted"]);
    assert.doesNotMatch(first, /private|approved|foreign|local_call|unique-id/u);
    dispatch("PostCompact", "approved"); dispatch("Stop", "approved");
    dispatch("PostToolUse", "approved", tool); dispatch("PostToolUse", "foreign", tool);
    dispatch("PostCompact", "foreign");
    assert.equal(readFileSync(journal, "utf8"), first);
    assert.equal(run(["uninstall-hooks", "host"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")), prior);
  });
}

test("actual runner returns the command status, captures checkout and refuses a repeated attempt", t => {
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
  assert.equal(run(attempt).status, 2);
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
