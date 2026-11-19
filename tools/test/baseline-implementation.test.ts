import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const script = fileURLToPath(new URL(`../${packageInfo.bin["methodology-baseline"]}`, import.meta.url));
const protectedFile = "case[1] ★/record";
const manifest = "baseline.json";

function fixture(t: TestContext) {
  const cwd = mkdtempSync(join(realpathSync(tmpdir()), "baseline-edges-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Example", GIT_COMMITTER_NAME: "Example",
    GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_EMAIL: "test@example.test",
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const cli = (args: string[], input?: string) => spawnSync(process.execPath, [script, ...args], {
    cwd, env, input, encoding: "utf8", timeout: 10_000,
  });
  git("init", "--quiet");
  mkdirSync(join(cwd, "case[1] ★"));
  writeFileSync(join(cwd, protectedFile), "selected\n");
  git("add", ".");
  git("commit", "-qm", "source");
  const source = git("rev-parse", "HEAD");
  const frozen = cli(["freeze", "--source", source, "--protect", protectedFile]);
  assert.equal(frozen.status, 0, frozen.stderr);
  writeFileSync(join(cwd, manifest), frozen.stdout);
  git("add", manifest);
  git("commit", "-qm", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const verify = () => cli(["verify", "--baseline", baseline, "--manifest", manifest, "--candidate", baseline]);
  const hook = (input: string) => cli(["hook", "--host", "codex", "--repo", cwd, "--baseline", baseline,
    "--manifest", manifest], input);
  return { cli, cwd, git, source, verify, hook };
}

test("A missing selected blob is a Git error even when every selected tree entry matches", (t) => {
  const { cwd, git, verify } = fixture(t);
  assert.equal(verify().status, 0);
  const oid = git("rev-parse", `HEAD:${protectedFile}`);
  rmSync(join(cwd, ".git/objects", oid.slice(0, 2), oid.slice(2)));
  const rejected = verify();
  assert.equal(rejected.status, 2, rejected.stderr);
  assert.equal(rejected.stdout, "");
  assert.ok(rejected.stderr.includes(protectedFile));
});

test("Both path interpretations, the complete patch and unique JSON fields must support an allow", (t) => {
  const { hook, cwd } = fixture(t);
  mkdirSync(join(cwd, "case[1] ★/child"));
  symlinkSync("case[1] ★/child", join(cwd, "shortcut"));
  const patch = (target: string) => `*** Begin Patch\n*** Add File: ${target}\n+sample\n*** End Patch\n`;
  const event = (command: string) => JSON.stringify({
    hook_event_name: "PreToolUse", cwd, tool_name: "apply_patch", tool_input: { command },
  });
  assert.equal(hook(event(patch("record"))).status, 0);
  for (const input of [
    event(patch("shortcut/../record")),
    event(patch(protectedFile + "  ")),
    event(patch("independent").replace("*** Begin Patch\n", "*** Begin Patch\n*** Environment ID: remote\n")),
    event("*** Begin Patch\n*** Update File: independent\n@@\n@@\n+sample\n*** End Patch\n"),
    event(patch("independent")).replace('"command":', '"command":"ambiguous","command":'),
  ]) {
    const rejected = hook(input);
    assert.equal(rejected.status, 2, rejected.stderr);
    assert.equal(rejected.stdout, "");
    assert.ok(!rejected.stderr.includes("+sample"));
  }
});
