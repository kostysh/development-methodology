import assert from "node:assert/strict";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const script = fileURLToPath(new URL("../dist/controls.js", import.meta.url));
const command = process.env.METHODOLOGY_CONTROLS_BIN ?? process.execPath;
const prefix = process.env.METHODOLOGY_CONTROLS_BIN ? [] : [script];
let inputCount = 0;

function fixture(t: TestContext) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "methodology controls "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function json(root: string, value: unknown) {
  const file = join(root, `input-${++inputCount}.json`);
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  return file;
}

function cli(root: string, ...args: string[]) {
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: root, encoding: "utf8", timeout: 12_000,
    env: { ...process.env, RELEASE_TOKEN: "private-synthetic-writer", LOCAL_CONTACT: "synthetic@example.test" },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function rejected(result: ReturnType<typeof cli>, pattern: RegExp, code = 1) {
  assert.equal(result.code, code, result.stderr);
  assert.match(result.stderr, pattern);
  assert.equal(result.stdout, "");
}

function git(root: string, ...args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 5000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function put(root: string, relative: string, contents: string) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function repository(root: string) {
  git(root, "init", "-q", "--initial-branch=main");
  git(root, "config", "user.name", "Controls test");
  git(root, "config", "user.email", "controls@example.test");
  git(root, "config", "core.hooksPath", "/dev/null");
  git(root, "config", "commit.gpgSign", "false");
}

function commit(root: string, message: string) {
  git(root, "add", "-A", "--", "docs");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

const artifact = (id: string, status: string, extra = "") => `---\nid: ${id}\nstatus: ${status}\n${extra}---\n# Text\n`;

test("installed control command exposes help and version and rejects invalid invocations", (t) => {
  const root = fixture(t);
  assert.deepEqual(cli(root, "--version"), { code: 0, stdout: `${packageInfo.version}\n`, stderr: "" });
  const help = cli(root, "--help");
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^Usage: methodology-controls artifacts\|git\|run\|reconcile/u);
  assert.equal(help.stderr, "");
  rejected(cli(root, "run"), /Usage: methodology-controls/u, 2);
});

test("artifact control reads the whole exact candidate and enforces identity and lifecycle", (t) => {
  const root = fixture(t);
  repository(root);
  const older = "docs/SPEC-0001-older.md";
  const successor = "docs/SPEC-0002-successor.md";
  const archived = "docs/DP-0001-archive.md";
  const plan = "docs/DP-0002-plan.md";
  put(root, older, artifact("SPEC-0001", "accepted"));
  put(root, archived, artifact("DP-0001", "archived", "archive_note: Completed\n"));
  put(root, plan, artifact("DP-0002", "accepted"));
  const base = commit(root, "Accepted records");
  const check = (candidate: string) => cli(root, "artifacts", json(root, {
    base, candidate, paths: ["docs/"], archiveIdPrefixes: ["DP-"], retiredIds: ["SPEC-0042"],
  }));
  put(root, older, artifact("SPEC-0001", "superseded", "superseded_by: [SPEC-0002]\n"));
  put(root, successor, artifact("SPEC-0002", "accepted", "supersedes:\n  - SPEC-0001\n"));
  put(root, plan, artifact("DP-0002", "archived", "archive_note: Closed with obligations transferred\n"));
  const clean = commit(root, "Valid supersession and archive note");
  put(root, successor, artifact("SPEC-0001", "draft"));
  assert.deepEqual(check(clean), { code: 0, stdout: `${JSON.stringify({ candidate: clean, artifacts: 4 })}\n`, stderr: "" });
  const variants = [
    ["accepted returned to draft", older, artifact("SPEC-0001","draft"), /Invalid artifact transition accepted -> draft/u],
    ["collision", successor, artifact("SPEC-0001", "draft"), /Duplicate artifact ID SPEC-0001/u],
    ["collision with unchanged record", "docs/SPEC-0008-copy.md", artifact("DP-0001", "draft"), /Duplicate artifact ID DP-0001/u],
    ["retired allocation", "docs/SPEC-0042-reuse.md", artifact("SPEC-0042", "draft"), /Reused retired artifact ID SPEC-0042/u],
    ["archived history", archived, artifact("DP-0001", "archived", "archive_note: Changed history\n"), /Archived artifact changed or disappeared: DP-0001/u],
    ["deleted archive", archived, null, /Archived artifact changed or disappeared: DP-0001/u],
    ["missing archive note", plan, artifact("DP-0002", "archived"), /lacks its configured archive note: DP-0002/u],
    ["missing successor", successor, null, /Missing or draft successor SPEC-0002 for SPEC-0001/u],
    ["missing reciprocal link", successor, artifact("SPEC-0002", "accepted"), /lacks reciprocal supersedes/u],
    ["reassigned committed identity", older, artifact("SPEC-0041", "accepted"), /Artifact ID changed in/u],
    ["ambiguous quoted metadata key", successor, '---\nid: SPEC-0002\n"id": SPEC-0001\nstatus: accepted\n---\n', /Invalid artifact metadata/u],
  ] as const;
  for (const [name, path, contents, expected] of variants) {
    git(root, "reset", "--hard", clean);
    if (contents === null) rmSync(join(root, path));
    else put(root, path, contents);
    rejected(check(commit(root, name)), expected);
  }
  git(root,"reset","--hard",clean);
  put(root,older,artifact("SPEC-0001","superseded","superseded_by: [SPEC-0002]\n")+"Altered accepted record.\n");
  rejected(cli(root,"artifacts",json(root,{base:clean,candidate:commit(root,"Rewrite superseded record"),
    paths:["docs/"],retiredIds:[]})),/Superseded artifact history changed/u);
  git(root, "switch", "-q", "--orphan", "unrelated");
  put(root, older, artifact("SPEC-0001", "draft"));
  rejected(check(commit(root, "Stale or unrelated tree")), /does not contain the expected integration base/u);
});

test("Git control checks canonical worktree, push target, staging and ignore rules", (t) => {
  const root = fixture(t);
  const repo = join(root, "repo");
  mkdirSync(repo);
  repository(repo);
  put(repo, "docs/allowed café.md", "# Initial");
  put(repo, "docs/.gitignore", "ignored/\n");
  const head = commit(repo, "Base");
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", remote);
  git(repo, "remote", "add", "origin", remote);
  put(repo, "docs/allowed café.md", "# Staged");
  git(repo, "add", "--", "docs/allowed café.md");
  const policy = {
    worktree: repo, commonDir: join(repo, ".git"), remote: "origin", pushUrl: remote,
    branch: "refs/heads/main", destination: "refs/heads/main", head, paths: ["docs/allowed café.md"],
  };
  const check = (change: Record<string, unknown> = {}) => cli(repo, "git", json(root, { ...policy, ...change }));
  const passed = check();
  assert.equal(passed.code, 0, passed.stderr);
  assert.deepEqual(JSON.parse(passed.stdout), { head, destination: "refs/heads/main", staged: ["docs/allowed café.md"] });
  assert.equal(check({ paths: [...policy.paths, ":literal.md"] }).code, 0);
  rejected(check({ worktree: join(repo, "docs") }), /Unexpected Git repository or worktree/u);
  rejected(check({ branch: "refs/heads/foreign" }), /Unexpected Git HEAD or local branch/u);
  rejected(check({ pushUrl: join(root, "wrong.git") }), /Unexpected Git push URL/u);
  git(repo, "config", "--add", "remote.origin.pushurl", remote);
  git(repo, "config", "--add", "remote.origin.pushurl", join(root, "wrong.git"));
  rejected(check(), /Unexpected Git push URL/u);
  git(repo, "config", "--unset-all", "remote.origin.pushurl");
  rejected(check({ paths: [...policy.paths, "docs/ignored/"] }), /Ignored write path/u);
  symlinkSync(root, join(repo, "docs/alias"));
  rejected(check({ paths: [...policy.paths, "docs/alias/new.md"] }), /leaves approved worktree/u);
  put(repo, "docs/stray\nname.md", "# Unrelated");
  git(repo, "add", "--", "docs/stray\nname.md");
  rejected(check(), /Undeclared staged path "docs\/stray\\nname\.md"/u);
});

test("Git's exact force-with-lease rejects a stale writer without changing the remote ref", (t) => {
  const root = fixture(t);
  repository(root);
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", remote);
  put(root, "docs/a.md", "# Base");
  const base = commit(root, "Base");
  git(root, "push", "-q", remote, `${base}:refs/heads/main`);
  put(root, "docs/a.md", "# First writer");
  const accepted = commit(root, "First writer");
  git(root, "push", "-q", `--force-with-lease=refs/heads/main:${base}`, remote, `${accepted}:refs/heads/main`);
  put(root, "docs/a.md", "# Stale writer");
  const stale = commit(root, "Stale writer");
  const stopped = spawnSync("git", ["push", `--force-with-lease=refs/heads/main:${base}`, remote, `${stale}:refs/heads/main`], {
    cwd: root, encoding: "utf8", timeout: 5000,
  });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stderr, /stale info/u);
  assert.equal(git(remote, "rev-parse", "refs/heads/main"), accepted);
});

test("required results expire with the candidate and cannot be replaced by skips or weaker thresholds", (t) => {
  const root = fixture(t);
  const candidate = "a".repeat(40);
  const policy = json(root, { candidate, required: [{ id: "test", minimum: 80 }, { id: "deploy", allowSkip: true }] });
  const check = (...results: Record<string, unknown>[]) => cli(root, "checks", policy, json(root, { results }));
  const result = { id: "test", candidate, status: "completed", exitCode: 0, measured: 95, threshold: 80 };
  const skip = { id: "deploy", candidate, status: "skipped" };
  assert.deepEqual(JSON.parse(check(result, skip).stdout), { candidate, checks: 2 });
  rejected(check({ ...result, candidate: "b".repeat(40) }, skip), /Stale result/u);
  rejected(check({ ...result, status: "cancelled" }, skip), /did not finish successfully/u);
  rejected(check({ ...result, status: "skipped" }, skip), /did not finish successfully/u);
  rejected(check({ ...result, exitCode: 6, message: "all checks passed" }, skip), /did not finish successfully/u);
  rejected(check({ ...result, threshold: 70 }, skip), /weakened threshold/u);
  rejected(check({ ...result, measured: 70 }, skip), /fell below its threshold/u);
  rejected(check(skip), /Missing required checks test/u);
  rejected(check(result, result, skip), /Ambiguous results/u);
});

test("trusted baseline rejects separate committed fixture, exclusion, threshold and skip changes", (t) => {
  const root = fixture(t);
  repository(root);
  const baseline = process.env.METHODOLOGY_BASELINE_BIN ?? process.execPath;
  const args = process.env.METHODOLOGY_BASELINE_BIN ? [] : [fileURLToPath(new URL("../dist/baseline.js", import.meta.url))];
  const baselineCli = (...operands: string[]) => {
    const result = spawnSync(baseline, [...args, ...operands], { cwd: root, encoding: "utf8", timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const configuration = { include: ["checks/contract.test.js"], exclude: [], coverageThreshold: 90, skip: false };
  const configFile = "checks/runner.json";
  const fixtureFile = "checks/expected result.json";
  const manifestFile = "accepted-manifest.json";
  put(root, configFile, JSON.stringify(configuration));
  put(root, fixtureFile, "{\"requiredResult\":true}\n");
  put(root, "checks/contract.test.js", "// The accepted contract fixture.\n");
  git(root, "add", "--", "checks");
  git(root, "commit", "-qm", "Accept controlled tests, runner and fixture");
  const source = git(root, "rev-parse", "HEAD");
  const freeze = baselineCli("freeze", "--source", source, "--protect", "checks/");
  assert.equal(freeze.code, 0, freeze.stderr);
  put(root, manifestFile, freeze.stdout);
  git(root, "add", "--", manifestFile);
  git(root, "commit", "-qm", "Freeze trusted manifest");
  const trusted = git(root, "rev-parse", "HEAD");
  const verify = (candidate: string) => baselineCli("verify", "--baseline", trusted, "--manifest", manifestFile, "--candidate", candidate);
  assert.deepEqual(verify(trusted), { code: 0, stdout: "", stderr: "" });
  put(root, "source.js", "export const changed = true;\n");
  git(root, "add", "--", "source.js");
  git(root, "commit", "-qm", "Independent implementation");
  const clean = git(root, "rev-parse", "HEAD");
  assert.deepEqual(verify(clean), { code: 0, stdout: "", stderr: "" });

  const variants = [
    ["Changed fixture", fixtureFile, "{\"requiredResult\":false}\n"],
    ["Excluded test", configFile, JSON.stringify({ ...configuration, exclude: ["checks/contract.test.js"] })],
    ["Reduced coverage threshold", configFile, JSON.stringify({ ...configuration, coverageThreshold: 70 })],
    ["Skipped test", configFile, JSON.stringify({ ...configuration, skip: true })],
  ];
  for (const [message, path, content] of variants) {
    git(root, "reset", "--hard", clean);
    const write = spawnSync("/bin/sh", ["-ec", 'printf "%s" "$2" > "$1"', "sh", path, content], { cwd: root });
    assert.equal(write.status, 0);
    git(root, "add", "--", path);
    git(root, "commit", "--no-verify", "-qm", message);
    const blocked = verify(git(root, "rev-parse", "HEAD"));
    assert.deepEqual(blocked, { code: 1, stdout: "", stderr: `Changed protected content ${JSON.stringify(path)}\n` });
    assert.deepEqual(verify(clean), { code: 0, stdout: "", stderr: "" });
  }
});

function runner(root: string, result: string) {
  const lockDir = join(root, "locks");
  mkdirSync(lockDir, { recursive: true, mode: 0o700 });
  return {
    cwd: root, lockDir, resource: "db/fixture", result: join(root, result), timeoutMs: 10_000, cleanupTimeoutMs: 2_000,
    command: ["/usr/bin/true"], cleanup: ["/usr/bin/true"], reconcile: ["/usr/bin/true"],
  };
}

function execute(root: string, value: ReturnType<typeof runner>) {
  return cli(root, "run", json(root, value));
}

function start(t: TestContext, root: string, value: ReturnType<typeof runner>) {
  const child = spawn(command, [...prefix, "run", json(root, value)], { cwd: root, stdio: "ignore" });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  return child;
}

async function exited(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return [child.exitCode, child.signalCode];
  return once(child, "exit");
}

async function until<T>(read: () => T): Promise<T> {
  for (let i = 0; i < 150; i += 1) {
    const result = read();
    if (result) return result;
    await delay(20);
  }
  throw new Error("Timed out waiting for observable run state");
}

function report(path: string) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
}

async function listening(port: number) {
  const socket = createConnection({ host: "127.0.0.1", port });
  try {
    await once(socket, "connect");
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED") return false;
    throw error;
  } finally {
    socket.destroy();
  }
}

test("separate runner processes share the same resource lock and recover an interrupted holder", async (t) => {
  const root = fixture(t);
  const cwdA = join(root, "checkout-a");
  const cwdB = join(root, "checkout-b");
  mkdirSync(cwdA);
  mkdirSync(cwdB);
  const first = runner(root, "first.json");
  first.cwd = cwdA;
  const started = join(root, "resource-live");
  first.command = [process.execPath, "--input-type=module", "-e", [
    'import { createServer } from "node:net";',
    'import { writeFileSync } from "node:fs";',
    'const server = createServer((connection) => connection.end());',
    'server.listen(0, "127.0.0.1", () => writeFileSync(process.argv[1], String(server.address().port)));',
  ].join("\n"), started];
  first.cleanup = ["/bin/sh", "-ec", 'rm "$1"; test ! -e "$1"', "cleanup", started];
  const owner = start(t, root, first);
  const port = Number(await until(() => existsSync(started) && readFileSync(started, "utf8")));
  assert.equal(await listening(port), true);

  const contender = { ...runner(root, "contender.json"), cwd: cwdB };
  rejected(execute(root, contender), /locked by another runner/u);
  assert.equal(existsSync(contender.result), false);
  assert.equal(execute(root, { ...runner(root, "other.json"), resource: "db/other" }).code, 0);

  assert.equal(owner.kill("SIGKILL"), true);
  assert.deepEqual(await exited(owner), [null, "SIGKILL"]);
  const recovered = await until(() => report(first.result));
  assert.equal(recovered.primary.state, "interrupted");
  assert.equal(recovered.primary.processGroupClean, true);
  assert.equal(recovered.cleanup.exitCode, 0);
  assert.equal(recovered.clean, true);
  assert.equal(existsSync(started), false);
  assert.equal(await listening(port), false);
  await until(() => {
    const attempt = execute(root, contender);
    if (attempt.code === 0) return true;
    rejected(attempt, /locked by another runner/u);
    return false;
  });
});

test("an unrecoverable owner death releases the file lock but holds mutation until reconciliation", async (t) => {
  const root = fixture(t);
  const first = runner(root, "incomplete.json");
  const marker = join(root, "mutation.pid");
  first.command = ["/bin/sh", "-c", 'printf "%s" "$$" > "$1"; exec /bin/sleep 20', "run", marker];
  const owner = start(t, root, first);
  const group = Number(await until(() => existsSync(marker) && readFileSync(marker, "utf8")));
  t.after(() => { try { process.kill(-group, "SIGKILL"); } catch {} });
  const ps = spawnSync("ps", ["--ppid", String(owner.pid), "-o", "pid="], { encoding: "utf8", timeout: 5000 });
  assert.equal(ps.status, 0);
  const supervisor = Number(ps.stdout.trim());
  assert.ok(Number.isInteger(supervisor) && supervisor > 1);
  process.kill(supervisor, "SIGKILL");
  assert.deepEqual(await exited(owner), [137, null]);
  const contender = runner(root, "later.json");
  rejected(execute(root, contender), /requires reconciliation/u);
  const repair = runner(root, "reconcile.json");
  rejected(cli(root, "reconcile", json(root, { ...repair, reconcile: ["/usr/bin/false"] })), /^(?:)$/u, 125);
  rejected(execute(root, contender), /requires reconciliation/u);
  repair.result = join(root, "accepted-reconciliation.json");
  repair.reconcile = ["/bin/sh", "-ec", [
    '/bin/kill -TERM -- "-$2"',
    'for attempt in 1 2 3 4 5 6 7 8 9 10; do',
    '  if ! ps --no-headers -o stat= -p "$2" | grep -q "^[^ZX]"; then rm "$1"; test ! -e "$1"; exit; fi',
    "  sleep 0.02",
    "done",
    "exit 1",
  ].join("\n"), "reconcile", marker, String(group)];
  assert.equal(cli(root, "reconcile", json(root, repair)).code, 0);
  assert.equal(existsSync(marker), false);
  assert.equal(execute(root, contender).code, 0);
});

test("runner preserves primary failure, cleans descendants, and exports approved evidence only", (t) => {
  const root = fixture(t);
  const first = runner(root, "failure.json");
  first.command = ["/bin/sh", "-ec", [
    'test -z "${RELEASE_TOKEN+x}" && test -z "${LOCAL_CONTACT+x}"',
    'echo "private-synthetic-writer synthetic@example.test raw payload containing command text"',
    "exit 7",
  ].join("\n")];
  const observed = execute(root, first);
  assert.deepEqual(observed, { code: 7, stdout: "", stderr: "" });
  const evidence = readFileSync(first.result, "utf8");
  assert.doesNotMatch(evidence, /private-synthetic-writer|synthetic@example\.test|raw payload|\/bin\/sh/u);
  assert.deepEqual(JSON.parse(evidence), {
    version: 1,
    primary: { state: "exited", exitCode: 7, signal: null, descendantsObserved: false, processGroupClean: true },
    cleanup: { state: "exited", exitCode: 0, signal: null, descendantsObserved: false, processGroupClean: true },
    clean: true, exitCode: 7,
  });
  const orphan = runner(root, "descendant.json");
  orphan.command = ["/bin/sh", "-c", "/bin/sleep 20 & exit 0"];
  assert.equal(execute(root, orphan).code, 125);
  assert.equal(report(orphan.result).primary.descendantsObserved, true);
  assert.equal(report(orphan.result).primary.processGroupClean, true);
  const timed = runner(root, "timeout.json");
  timed.command = ["/bin/sleep", "20"];
  assert.equal(execute(root, { ...timed, timeoutMs: 50 }).code, 124);
  assert.equal(report(timed.result).primary.state, "timed-out");
  assert.equal(report(timed.result).cleanup.exitCode, 0);
});
