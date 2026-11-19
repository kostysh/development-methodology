import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

function setup(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "recovery-regression-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "checkout");
  const config = join(root, "config");
  const profile = join(root, "profile.json");
  const bin = join(root, "bin");
  for (const path of [repo, bin, join(config, "git")]) mkdirSync(path, { recursive: true });
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: config, GIT_CONFIG_NOSYSTEM: "1",
    PATH: bin + ":" + process.env.PATH, GIT_CONFIG_GLOBAL: undefined };
  function run(command: string, args: string[], input = "") {
    const result = spawnSync(command, args, { cwd: repo, env, input, encoding: "utf8", timeout: 10_000 });
    assert.ifError(result.error);
    return result;
  }
  function git(...args: string[]) {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trimEnd();
  }
  git("init", "--quiet", "-b", "work/topic");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "--allow-empty", "-m", "Initial");
  const head = git("rev-parse", "HEAD");
  const configure = (extra = {}) => writeFileSync(profile,
    JSON.stringify({ task_id: "fixture", worktree: repo, line_limit: 4, ...extra }), { mode: 0o600 });
  configure();
  function cli(operation: string, input = "") {
    const installed = process.env.METHODOLOGY_RECOVERY_BIN;
    return installed ? run(installed, [operation, profile], input)
      : run(process.execPath, [fileURLToPath(new URL("../dist/recovery.js", import.meta.url)), operation, profile], input);
  }
  return { root, repo, config, bin, head, git, configure, cli };
}

test("recovery uses the same user exclude configuration as the worktree", (t) => {
  const f = setup(t);
  const excludes = join(f.root, "local-excludes");
  writeFileSync(excludes, "generated.work\n/.methodology/task-state/\n");
  writeFileSync(join(f.config, "git", "config"), `[core]\n\texcludesFile = ${excludes}\n`);
  writeFileSync(join(f.repo, "generated.work"), "local build output\n");
  assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
  const result = f.cli("snapshot");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).git.changes.untracked, 0);
  assert.equal(f.cli("write", "Ready for recovery\n").status, 0);
  assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
});

test("a named remote branch has a publication result before a PR exists", (t) => {
  const f = setup(t);
  const response = join(f.root, "provider.json");
  const gh = join(f.bin, "gh");
  writeFileSync(gh, `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    repos/example/project/git/ref/heads/work/topic|repos/example/project/git/ref/heads/work%2Ftopic)
      exec cat "${response}";;
  esac
done
exit 1
`, { mode: 0o700 });
  f.configure({ github: { repository: "example/project" } });
  const put = (oid: string) => writeFileSync(response, JSON.stringify({
    ref: "refs/heads/work/topic", object: { type: "commit", sha: oid },
  }));
  put(f.head);
  const same = f.cli("snapshot");
  assert.equal(same.status, 0, same.stderr);
  const current = JSON.parse(same.stdout).github.publication;
  assert.equal(current.oid, f.head);
  assert.equal(current.head_matches_local, true);
  const other = "ab".repeat(20);
  put(other);
  const drift = JSON.parse(f.cli("snapshot").stdout).github.publication;
  assert.equal(drift.oid, other);
  assert.equal(drift.head_matches_local, false);
  rmSync(response);
  const unavailable = f.cli("snapshot");
  assert.equal(unavailable.status, 1, unavailable.stderr);
  assert.match(JSON.stringify(JSON.parse(unavailable.stdout).gaps), /publication/u);
});
