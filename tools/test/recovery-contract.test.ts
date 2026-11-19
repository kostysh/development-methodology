import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, sep } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const command = "methodology-recovery";
const alias = "task_81";
const base = "refs/heads/main";
const upstream = "refs/remotes/origin/main";
const privateState = "PRIVATE_STATE_READBACK_817";
const privateFilename = "PRIVATE_FILENAME_821";
const privateProvider = "PRIVATE_PROVIDER_BODY_823";
const privateHook = "PRIVATE_TRANSCRIPT_827";
const privateEnv = "PRIVATE_ENVIRONMENT_829";
const env: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|GH_|GITHUB_)/u.test(key))),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GH_PROMPT_DISABLED: "1",
  RECOVERY_FIXTURE_PRIVATE: privateEnv,
};
const timeout = 8_000;

function cliCommand(args: string[]): [string, ...string[]] {
  const installed = process.env.METHODOLOGY_RECOVERY_BIN;
  if (installed !== undefined) {
    assert.ok(isAbsolute(installed), "METHODOLOGY_RECOVERY_BIN must be an absolute executable path");
    return [installed, ...args];
  }
  const bins: Partial<Record<string, string>> = packageInfo.bin;
  const entry = bins[command];
  assert.ok(entry, "The package does not declare a methodology-recovery entry point");
  const script = fileURLToPath(new URL(entry, new URL("../", import.meta.url)));
  return [process.execPath, script, ...args];
}

function run(
  cwd: string, [program, ...args]: [string, ...string[]], input: string | Buffer = "",
  localEnv: NodeJS.ProcessEnv = env,
) {
  const result = spawnSync(program, args, { cwd, input, env: localEnv, encoding: "utf8", timeout });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(cwd: string, ...args: string[]) {
  const result = run(cwd, ["git", ...args]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function configureGit(cwd: string) {
  git(cwd, "config", "user.name", "Recovery fixture");
  git(cwd, "config", "user.email", "recovery@example.test");
  git(cwd, "config", "commit.gpgSign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
}

function commit(cwd: string, message: string) {
  git(cwd, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(cwd, "rev-parse", "HEAD").trim();
}

function fixture(t: TestContext, { ignored = true } = {}) {
  const outside = mkdtempSync(join(realpathSync(tmpdir()), "methodology recovery "));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const main = join(outside, "main checkout");
  const worktree = join(outside, "task checkout");
  mkdirSync(main);
  git(main, "init", "--quiet", "--initial-branch=main");
  configureGit(main);
  writeFileSync(join(main, privateFilename + " mixed.txt"), "base\n");
  git(main, "add", "-A");
  const baseHead = commit(main, "Fixture base");
  git(main, "worktree", "add", "--quiet", "-b", "task", worktree);
  git(main, "remote", "add", "origin", join(outside, "offline origin"));
  git(main, "checkout", "--quiet", "-b", "upstream_fixture");
  git(main, "update-ref", upstream, commit(main, "Remote tracking tip"));
  git(main, "checkout", "--quiet", "main");
  git(worktree, "branch", "--set-upstream-to=origin/main");
  const head = commit(worktree, "Local checkpoint");
  if (ignored) writeFileSync(join(main, ".git/info/exclude"), "/.methodology/task-state/\n");
  const path = join(outside, "private profile.json");
  const directory = join(worktree, ".methodology", "task-state");
  const destination = join(directory, alias + ".md");
  const bin = join(outside, "fixture commands");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 73\n", { mode: 0o700 });
  const cliEnv = { ...env, PATH: bin + ":" + env.PATH };
  const cli = (args: string[], input?: string | Buffer, localEnv: NodeJS.ProcessEnv = cliEnv) =>
    run(outside, cliCommand(args), input, localEnv);
  const invoke = (verb: string, input?: string | Buffer, localEnv?: NodeJS.ProcessEnv) =>
    cli([verb, path], input, localEnv);
  const profile = (overrides: Record<string, unknown> = {}, profilePath = path) => writeFileSync(profilePath, JSON.stringify({
    task_id: alias, worktree, line_limit: 3, base_ref: base, ...overrides,
  }), { mode: 0o600 });
  profile();
  return { outside, main, worktree, baseHead, head, path, directory, destination, bin, cliEnv, cli, invoke, profile };
}

function stableGit(f: ReturnType<typeof fixture>) {
  return [
    git(f.worktree, "show-ref", "--head"),
    git(f.worktree, "ls-files", "--stage", "-z"),
    git(f.worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  ];
}

function silentSuccess(result: ReturnType<typeof run>) {
  assert.deepEqual(result, { status: 0, stdout: "", stderr: "" });
}

function assertPrivate(result: ReturnType<typeof run>, ...markers: string[]) {
  for (const marker of markers) {
    assert.ok(!(result.stdout + result.stderr).includes(marker), `exposed fixture marker ${marker}`);
  }
}

function valueAt(value: unknown, match: RegExp, expected: unknown, label: string) {
  function contains(node: unknown, path: string[]): boolean {
    if (node !== null && typeof node === "object") {
      return Object.entries(node).some(([key, child]) => contains(child, [...path, key]));
    }
    return match.test(path.join(".")) && Object.is(node, expected);
  }
  assert.ok(contains(value, []), `missing ${label} (${String(expected)})`);
}

function hasScalar(value: unknown, expected: unknown, label = String(expected)) {
  valueAt(value, /./u, expected, label);
}

type Snapshot = {
  task_id: string;
  observed_at: string;
  git: object;
  github?: unknown;
  resources?: ({ id?: string } | null)[] | Record<string, unknown> | null;
  gaps: unknown[];
};

function snapshot(result: ReturnType<typeof run>, status = 0) {
  assert.equal(result.status, status, result.stderr);
  const observed = JSON.parse(result.stdout) as Snapshot;
  assert.equal(observed.task_id, alias);
  assert.match(observed.observed_at, /Z$/u);
  assert.ok(Number.isFinite(Date.parse(observed.observed_at)), "valid UTC snapshot timestamp");
  assert.ok(observed.git && typeof observed.git === "object");
  assert.ok(Array.isArray(observed.gaps), "named snapshot gaps");
  assertPrivate(result, privateState, privateFilename, privateProvider, privateHook, privateEnv);
  return observed;
}

test("the public recovery entry point reports its version and rejects invalid invocations", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.cli(["--version"]), { status: 0, stdout: packageInfo.version + "\n", stderr: "" });
  for (const args of [[], ["write"], ["snapshot", f.path, "extra"], ["unknown", f.path]]) {
    const result = f.cli(args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.trim());
  }
});

test("the writer preserves private UTF-8 bytes, exact LF and CRLF bounds, refs and index", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.worktree, "already staged"), "independent\n");
  git(f.worktree, "add", "already staged");
  const before = stableGit(f);
  for (const text of [`# Récupération\r\n${privateState}\r\nlast`, "one\ntwo\nlast\n"]) {
    silentSuccess(f.invoke("write", text));
    assert.equal(readFileSync(f.destination, "utf8"), text);
    assert.equal(statSync(f.destination).mode & 0o077, 0, "private state file");
  }
  const previous = readFileSync(f.destination, "utf8");
  for (const input of ["", " \r\n\t\n", `a\r\nb\r\nc\r\n${privateState}`, Buffer.from([0xc3, 0x28])]) {
    const result = f.invoke("write", input);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assertPrivate(result, privateState, previous);
    assert.equal(readFileSync(f.destination, "utf8"), previous);
  }
  assert.deepEqual(stableGit(f), before);
});

test("binding and unsafe state destinations fail without writing another task's file", (t) => {
  const f = fixture(t, { ignored: false });
  const input = `# ${privateState}\n`;
  const unignored = f.invoke("write", input);
  assert.notEqual(unignored.status, 0);
  assertPrivate(unignored, privateState);
  assert.ok(!existsSync(f.destination), "unignored destination stays absent");
  const subdirectory = join(f.worktree, "nested cwd");
  mkdirSync(subdirectory);
  const insideProfile = join(f.worktree, "not the trusted profile.json");
  for (const profile of [
    { worktree: subdirectory }, { worktree: f.outside }, { worktree: "." },
    { task_id: "nested/alias" }, { line_limit: 1.5 }, { line_limit: 0 },
  ]) {
    f.profile(profile);
    const rejected = f.invoke("write", input);
    assert.equal(rejected.status, 2, rejected.stderr);
    assertPrivate(rejected, privateState);
    assert.ok(!existsSync(f.destination));
  }
  f.profile({}, insideProfile);
  assert.equal(f.cli(["write", insideProfile], input).status, 2);
  f.profile();
  writeFileSync(join(f.main, ".git/info/exclude"), "/.methodology/task-state/\n");
  mkdirSync(f.directory, { recursive: true });
  writeFileSync(f.destination, "tracked old\n");
  git(f.worktree, "add", "--force", f.destination);
  const indexBefore = stableGit(f);
  assert.notEqual(f.invoke("write", input).status, 0);
  assert.equal(readFileSync(f.destination, "utf8"), "tracked old\n");
  assert.deepEqual(stableGit(f), indexBefore);

  git(f.worktree, "rm", "--quiet", "--cached", f.destination);
  rmSync(f.destination);
  const outsideState = join(f.outside, "independent state.md");
  writeFileSync(outsideState, "independent old\n");
  symlinkSync(outsideState, f.destination);
  assert.notEqual(f.invoke("write", input).status, 0);
  assert.equal(readFileSync(outsideState, "utf8"), "independent old\n");
  rmSync(f.directory, { recursive: true });
  symlinkSync(f.outside, f.directory);
  assert.notEqual(f.invoke("write", input).status, 0);
  assert.ok(!existsSync(join(f.outside, alias + ".md")));
  rmSync(join(f.worktree, ".methodology"), { recursive: true });
  symlinkSync(f.outside, join(f.worktree, ".methodology"));
  assert.notEqual(f.invoke("write", input).status, 0);
  assert.ok(!existsSync(join(f.outside, "task-state", alias + ".md")));
});

type WriterResult = {
  error?: Error;
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stderr?: string;
};

function startWriter(f: ReturnType<typeof fixture>) {
  const [program, ...args] = cliCommand(["write", f.path]);
  const process = spawn(program, args, {
    cwd: f.outside, env: f.cliEnv, stdio: ["pipe", "ignore", "pipe"], timeout, killSignal: "SIGKILL",
  });
  let stderr = "";
  process.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  process.stdin.on("error", () => {}); // Report subprocess errors through its result.
  const result = new Promise<WriterResult>((resolve) => {
    process.once("error", (error) => resolve({ error }));
    process.once("close", (status, signal) => resolve({ status, signal, stderr }));
  });
  return { process, result };
}

function sendChunk(writer: ReturnType<typeof startWriter>, bytes: string) {
  return new Promise<void>((resolve, reject) => {
    writer.process.stdin.write(bytes, (error) => error ? reject(error) : resolve());
  });
}

test("competing writers expose whole files and an interrupted input leaves the last state", async (t) => {
  const f = fixture(t);
  const old = "# saved\n";
  silentSuccess(f.invoke("write", old));
  const contenderA = "# A\n" + "a".repeat(384 * 1024) + "\n";
  const contenderB = "# B\n" + "b".repeat(384 * 1024) + "\n";
  const writers: ReturnType<typeof startWriter>[] = [];
  function start() {
    const writer = startWriter(f);
    writers.push(writer);
    return writer;
  }
  try {
    const a = start();
    const b = start();
    // A chunk larger than a Linux pipe buffer requires the child to read from
    // its pipe. Hold both streams open before releasing either EOF.
    await Promise.all([sendChunk(a, contenderA), sendChunk(b, contenderB)]);
    assert.equal(readFileSync(f.destination, "utf8"), old, "partial stdin is invisible");
    const outcomes = Promise.all([a.result, b.result]);
    a.process.stdin.end();
    b.process.stdin.end();
    let complete = false;
    outcomes.then(() => { complete = true; });
    do {
      assert.ok([old, contenderA, contenderB].includes(readFileSync(f.destination, "utf8")),
        "each filesystem read returns a whole accepted version");
      await pause(1);
    } while (!complete);
    const results = await outcomes;
    assert.ok(results.some((result) => result.status === 0), "one contender succeeds");
    for (const result of results) {
      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stderr);
    }
    const saved = readFileSync(f.destination, "utf8");
    assert.ok([contenderA, contenderB].includes(saved));
    const interrupted = start();
    await sendChunk(interrupted, contenderA);
    assert.ok(interrupted.process.kill("SIGKILL"));
    assert.equal((await interrupted.result).signal, "SIGKILL");
    assert.equal(readFileSync(f.destination, "utf8"), saved);
    silentSuccess(f.invoke("write", "# retry\n"));
    assert.equal(readFileSync(f.destination, "utf8"), "# retry\n");
  } finally {
    for (const writer of writers) {
      writer.process.stdin.destroy();
      writer.process.kill("SIGKILL");
    }
    await Promise.all(writers.map((writer) => writer.result));
  }
});

test("snapshots distinguish live staged, unstaged, untracked and ref facts in a linked worktree", (t) => {
  const f = fixture(t);
  silentSuccess(f.invoke("write", privateState));
  const previous = snapshot(f.invoke("snapshot"));
  assert.equal(previous.gaps.length, 0);
  for (const optional of [previous.github, previous.resources]) {
    assert.ok(optional == null || (typeof optional === "object" && Object.keys(optional).length === 0),
      "an unconfigured integration contributes no data");
  }
  hasScalar(previous.git, f.head, "initial HEAD");
  const localHead = commit(f.worktree, "Local step after checkpoint");
  const mixed = join(f.worktree, privateFilename + " mixed.txt");
  writeFileSync(mixed, "staged\n");
  git(f.worktree, "add", mixed);
  writeFileSync(join(f.worktree, privateFilename + " staged only.txt"), "staged only\n");
  git(f.worktree, "add", privateFilename + " staged only.txt");
  writeFileSync(mixed, "unstaged\n");
  for (const suffix of ["one", "two", "three"]) writeFileSync(join(f.worktree, privateFilename + " " + suffix), suffix);
  const observed = snapshot(f.invoke("snapshot"));
  hasScalar(observed.git, f.worktree, "canonical Git worktree root");
  hasScalar(observed.git, "task", "active branch");
  hasScalar(observed.git, localHead, "current full HEAD");
  hasScalar(observed.git, f.baseHead, "configured base OID");
  hasScalar(observed.git, base, "configured base ref");
  hasScalar(observed.git, git(f.worktree, "rev-parse", upstream).trim(), "local upstream OID");
  assert.match(JSON.stringify(observed.git), /origin\/main/u, "upstream ref");
  valueAt(observed.git, /ahead/iu, 2, "ahead");
  valueAt(observed.git, /behind/iu, 1, "behind");
  valueAt(observed.git, /(?:^|\.)(?:staged|index)/iu, 2, "staged files");
  valueAt(observed.git, /unstaged|worktree_changes/iu, 1, "unstaged files");
  valueAt(observed.git, /untracked/iu, 3, "untracked files");

  git(f.worktree, "checkout", "--quiet", "--detach", localHead);
  f.profile({ base_ref: undefined });
  const detached = snapshot(f.invoke("snapshot"));
  hasScalar(detached.git, localHead, "detached HEAD");
  assert.match(JSON.stringify(detached.git), /detached|"branch"\s*:\s*null/iu);

  const unborn = join(f.outside, "new repository");
  mkdirSync(unborn);
  git(unborn, "init", "--quiet", "--initial-branch=new_task");
  f.profile({ worktree: unborn, base_ref: undefined });
  const empty = snapshot(f.invoke("snapshot"), 1);
  hasScalar(empty.git, unborn, "unborn worktree is known");
  hasScalar(empty.git, "new_task", "unborn branch is known");
  valueAt(empty.git, /head/iu, null, "unavailable unborn HEAD");
  assert.match(JSON.stringify(empty.gaps), /head/iu);
});

test("resource readback distinguishes owned live, expired, released and unavailable identities", (t) => {
  const f = fixture(t);
  const record = (type: string, id: string, body: Record<string, unknown>) => {
    const path = join(f.outside, id + ".json");
    writeFileSync(path, JSON.stringify({ task_id: alias, type, id, output: privateProvider, ...body }));
    return { type, id, record: path };
  };
  const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  const proc = readFileSync("/proc/self/stat", "utf8");
  const ticks = Number(proc.slice(proc.lastIndexOf(")") + 2).trim().split(/\s+/u)[19]);
  assert.ok(Number.isSafeInteger(ticks) && ticks > 0);
  const identity = { pid: process.pid, boot_id: boot, start_ticks: ticks };
  const owned = record("process", "live_301", { state: "active", ...identity });
  const expired = record("lease", "expired_302", { state: "active", expires_at: "2000-01-01T00:00:00Z" });
  const released = record("lease", "released_303", { state: "released" });
  const wrong = record("process", "mismatch_304", { state: "active", ...identity, start_ticks: ticks + 1 });
  const foreign = record("lease", "foreign_305", { state: "active", task_id: "separate_task" });
  const missing = { type: "lease", id: "missing_306", record: join(f.outside, "absent record.json") };
  f.profile({ resources: [owned, expired, released, wrong, foreign, missing] });

  const observed = snapshot(f.invoke("snapshot"), 1);
  hasScalar(observed.git, f.head, "known Git facts in a partial snapshot");
  const resource = (id: string) => {
    const rows = observed.resources;
    const row = Array.isArray(rows) ? rows.find((item) => item?.id === id) : rows?.[id];
    assert.ok(row !== undefined, `missing resource ${id}`);
    return row;
  };
  hasScalar(resource(owned.id), "active", "owned live resource state");
  hasScalar(resource(expired.id), "active", "expiry does not release an active resource");
  valueAt(resource(expired.id), /remain|lease|expir/iu, 0, "no lease time remains");
  hasScalar(resource(released.id), "released", "authoritative release");
  for (const entry of [wrong, foreign, missing]) {
    assert.match(JSON.stringify(observed.gaps), new RegExp(entry.id, "u"));
    const row = resource(entry.id);
    if (row !== null) valueAt(row, /state|status|identity|running/iu, null, "unavailable resource state");
  }

  writeFileSync(owned.record, JSON.stringify({ task_id: alias, type: owned.type, id: owned.id, state: "released" }));
  f.profile({ resources: [owned] });
  const refreshed = snapshot(f.invoke("snapshot"));
  hasScalar(refreshed.resources, "released", "fresh resource record readback");
});

test("recover and passive SessionStart reconcile saved state with a changed head and fail closed", (t) => {
  const f = fixture(t);
  const missing = f.invoke("recover");
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stdout + missing.stderr, /missing|absent|unavailable/iu);
  assert.ok(missing.stdout.includes(f.head), "partial recovery retains known Git facts");
  const state = `# ${privateState}\nLast instruction locator: local:81\nRunner logs: runs/81.out\n`;
  silentSuccess(f.invoke("write", state));
  const changed = commit(f.worktree, "Changed while paused");
  const recovered = f.invoke("recover");
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.ok(recovered.stdout.includes(privateState));
  assert.ok(recovered.stdout.includes("local:81") && recovered.stdout.includes("runs/81.out"));
  assert.ok(recovered.stdout.includes(changed), "packet contains a fresh Git snapshot");
  assert.match(recovered.stdout, /reconcil/iu);
  assert.match(recovered.stdout, /before[^.]{0,120}(?:poll|resum)/iu);
  const cwd = join(f.worktree, "nested session");
  mkdirSync(cwd);
  const event = {
    hook_event_name: "SessionStart", source: "compact", cwd,
    session_id: "session-fixture-81", transcript_path: join(f.outside, privateHook),
  };
  const injected = f.invoke("hook", JSON.stringify(event));
  assert.equal(injected.status, 0, injected.stderr);
  const output = JSON.parse(injected.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "SessionStart");
  assert.ok(output.additionalContext.includes(privateState));
  assert.ok(output.additionalContext.includes(changed));
  assert.match(output.additionalContext, /reconcil/iu);
  assertPrivate(injected, privateHook, privateEnv);
  silentSuccess(f.invoke("hook", JSON.stringify({ ...event, source: "startup" })));
  silentSuccess(f.invoke("hook", JSON.stringify({ ...event, hook_event_name: "SessionEnd", reason: "other" })));

  const wrongWorktree = f.invoke("hook", JSON.stringify({ ...event, cwd: f.main, profile: f.path }));
  assert.equal(wrongWorktree.status, 0, wrongWorktree.stderr);
  assert.match(wrongWorktree.stdout + wrongWorktree.stderr, /manual|reconcil/iu);
  assertPrivate(wrongWorktree, privateState, privateHook, changed);
  const malformed = f.invoke("hook", "{");
  assert.equal(malformed.status, 0, malformed.stderr);
  assertPrivate(malformed, privateState, changed);

  writeFileSync(f.destination, `one\ntwo\nthree\n${privateState}\n`, { mode: 0o600 });
  const oversize = f.invoke("recover");
  assert.equal(oversize.status, 1, oversize.stderr);
  assert.match(oversize.stdout + oversize.stderr, /oversiz|too (?:many|large)|limit|exceed/iu);
  assertPrivate(oversize, privateState);
});

test("GitHub readback binds a run to its revision, refreshes facts and preserves partial results", (t) => {
  const f = fixture(t);
  const repository = "fixture-owner/recovery";
  const issue = 17;
  const pr = 23;
  const runId = 42;
  const attempt = 2;
  const repo = { id: 501, full_name: repository };
  const remoteHead = { ref: "task", sha: f.head, repo };
  const remoteBase = { ref: "main", sha: f.baseHead, repo };
  const rest = "repos/" + repository;
  const responsePath = join(f.outside, "gh responses.json");
  const callsPath = join(f.outside, "gh calls.jsonl");
  const pullRecord = {
    number: pr, state: "open", merged: false, head: remoteHead, base: remoteBase, body: privateProvider,
  };
  const runRecord = {
    id: runId, run_attempt: attempt, name: "allowed check", status: "completed", conclusion: "success",
    event: "pull_request", repository: repo, head_repository: repo,
    head_branch: remoteHead.ref, head_sha: remoteHead.sha, pull_requests: [{
      number: pr, head: remoteHead, base: remoteBase,
    }],
  };
  const records: Record<string, unknown> = {
    [rest + "/issues/" + issue]: {
      number: issue, state: "open", repository_url: "https://api.github.com/" + rest, body: privateProvider,
    },
    [rest + "/pulls/" + pr]: pullRecord,
    [rest + "/actions/runs/" + runId]: runRecord,
    [rest + "/git/ref/heads/task"]: {
      ref: "refs/heads/task", object: { sha: f.head, type: "commit" },
    },
  };
  writeFileSync(responsePath, JSON.stringify(records));
  const gh = join(f.bin, "gh");
  // Process-level provider double. It serves only this repo's read-only REST
  // records and exits nonzero for unexpected, unavailable or write requests.
  writeFileSync(gh, `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + "\\n");
const values = JSON.parse(readFileSync(process.env.FIXTURE_RESPONSES, "utf8"));
const endpoint = args.find((arg) => /^\\/?repos\\//u.test(arg))?.replace(/^\\//u, "");
const method = args.find((arg) => /^--method=/u.test(arg))?.slice(9)
  ?? args[args.findIndex((arg) => arg === "--method" || arg === "-X") + 1];
const explicit = args.some((arg) => /^(?:--method(?:=|$)|-X)/u.test(arg));
if (args[0] !== "api" || (explicit && method !== "GET")
  || args.some((arg) => /^(?:-f|-F|--field|--raw-field|--input)/u.test(arg))
  || !values[endpoint]) {
  console.error(${JSON.stringify(privateProvider)});
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(values[endpoint]));
}
`);
  const ghEnv = { ...f.cliEnv, FIXTURE_CALLS: callsPath, FIXTURE_RESPONSES: responsePath };
  f.profile({ github: { repository, issue, pr, run: runId } });

  const clean = snapshot(f.invoke("snapshot", "", ghEnv));
  hasScalar(clean.github, repository, "named GitHub repository");
  hasScalar(clean.github, issue, "verified issue ID");
  hasScalar(clean.github, pr, "verified PR ID");
  hasScalar(clean.github, runId, "verified workflow run ID");
  valueAt(clean.github, /attempt/iu, attempt, "verified run attempt");
  hasScalar(clean.github, f.head, "provider SHA");
  hasScalar(clean.github, "success", "recorded run success");

  const changed = commit(f.worktree, "Local head advanced beyond publication");
  const readDrift = f.invoke("snapshot", "", ghEnv);
  assert.ok(readDrift.status === 0 || readDrift.status === 1, readDrift.stderr);
  const drifted = snapshot(readDrift, readDrift.status);
  hasScalar(drifted.git, changed, "new local HEAD");
  hasScalar(drifted.github, f.head, "old published SHA remains old");
  assert.match(JSON.stringify([drifted.github, drifted.gaps]),
    /mismatch|stale|different|(?:head|current|matching|readiness)[^":]*"\s*:\s*false/iu,
    "head drift is explicit");
  assert.doesNotMatch(JSON.stringify(drifted.github), /"(?:current[^"]*|[^"]*ready)"\s*:\s*true/iu,
    "old successful CI does not prove current readiness");

  pullRecord.head = { ...remoteHead, ref: "other-task" };
  runRecord.pull_requests[0].number = pr + 1;
  delete records[rest + "/issues/" + issue];
  writeFileSync(responsePath, JSON.stringify(records));
  const partial = snapshot(f.invoke("snapshot", "", ghEnv), 1);
  assert.match(JSON.stringify(partial.gaps), /issue/iu);
  assert.match(JSON.stringify(partial.gaps), /pull|\bpr\b|pr_head/iu);
  assert.match(JSON.stringify(partial.gaps), /run|check|ci/iu);
  valueAt(partial.github, /issue|state|status/iu, null, "unknown configured provider fact");
  hasScalar(partial.git, changed, "Git remains known when provider facts are unavailable");
  assert.doesNotMatch(JSON.stringify(partial.github), /"success"/u, "a mismatched run proves no check");

  rmSync(gh);
  writeFileSync(gh, "#!/bin/sh\nexit 127\n", { mode: 0o700 });
  const unavailable = snapshot(f.invoke("snapshot", "", ghEnv), 1);
  assert.match(JSON.stringify(unavailable.gaps), /github|issue|pull|run/iu);
  hasScalar(unavailable.git, changed, "Git remains known when gh is unavailable");

  const calls = readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
  for (const args of calls) {
    assert.equal(args[0], "api");
    assert.ok(args.some((arg) => arg.replace(/^\//u, "").startsWith(rest + "/")), "use the bound repository");
    assert.ok(!args.some((arg) => /^(?:POST|PUT|PATCH|DELETE|-f|-F|--field|--raw-field|--input)$/u.test(arg)),
      "provider readback is read-only");
  }
  for (const suffix of ["/issues/" + issue, "/pulls/" + pr, "/actions/runs/" + runId]) {
    assert.ok(calls.filter((args) => args.some((arg) => arg.replace(/^\//u, "") === rest + suffix)).length >= 2,
      `provider facts are refreshed for ${suffix}`);
  }
});
