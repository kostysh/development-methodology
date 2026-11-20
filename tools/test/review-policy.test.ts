import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const binary = process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js", import.meta.url));
const policyModule = pathToFileURL(join(dirname(realpathSync(binary)), "train", "review-policy.js"));
const { checkReviewControls, reviewControls } = await import(policyModule.href);

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "methodology-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const change = (path: string, value: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = (title: string) => {
    git("add", "--all");
    git("commit", "--quiet", "-m", title);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch=target");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  const initial = "existing test\n";
  change("tests/required.txt", initial);
  change("ci/workflow.yml", "checks\n");
  const base = commit("Initial checks");
  const digest = (content: string) => createHash("sha256").update(content).digest("hex");
  const controls = (content = initial) => reviewControls({
    paths: ["ci/"], inventory: { path: "tests/required.txt", sha256: digest(content) },
  });
  return { root, git, change, commit, base, controls };
}

test("classifies only the PR's protected changes using committed objects in a bare repository", t => {
  const { root, git, change, commit, base, controls } = fixture(t);
  git("switch", "--quiet", "-c", "proposal");
  change("notes.md", "normal change");
  const normal = commit("Change documentation");
  git("switch", "--quiet", "target");
  change("ci/other.yml", "target advances");
  const advanced = commit("Target adds a workflow");
  git("switch", "--quiet", "proposal");
  renameSync(join(root, "ci/workflow.yml"), join(root, "previous-workflow.yml"));
  const governed = commit("Move a protected workflow");
  const bare = join(root, "objects.git");
  git("clone", "--quiet", "--bare", "--no-local", root, bare);
  change("ci/workflow.yml", "working copy differs from all commits");
  assert.deepEqual(checkReviewControls(controls(), advanced, normal, undefined, bare).changed, []);
  assert.throws(() => checkReviewControls(controls(), advanced, governed, undefined, bare), /Owner confirmation/);
  assert.deepEqual(checkReviewControls(controls(), advanced, governed, "project-chat/17", bare),
    { changed: ["ci"], ownerMessage: "project-chat/17" });
  assert.throws(() => checkReviewControls(controls(), base.slice(0, 7), normal, undefined, bare), /commit ID/);
});

test("holds changed or removed inventory until its exact contents and owner decision are approved", t => {
  const { root, change, commit, base, controls } = fixture(t);
  const revised = "existing test\nnew test\n";
  change("tests/required.txt", revised);
  const extended = commit("Extend inventory");
  assert.throws(() => checkReviewControls(controls(), base, extended, "project-chat/18", root), /approved SHA-256/);
  assert.throws(() => checkReviewControls(controls(revised), base, extended, undefined, root), /Owner confirmation/);
  assert.deepEqual(checkReviewControls(controls(revised), base, extended, "project-chat/18", root).changed, ["tests/required.txt"]);
  rmSync(join(root, "tests/required.txt"));
  const removed = commit("Remove inventory");
  assert.throws(() => checkReviewControls(controls(revised), base, removed, "project-chat/18", root), /approved SHA-256/);

  const command = process.env.METHODOLOGY_CONTROLS_BIN ?? fileURLToPath(new URL("../dist/controls.js", import.meta.url));
  const coordinator = mkdtempSync(join(tmpdir(), "methodology-coordinator-"));
  t.after(() => rmSync(coordinator, { recursive: true, force: true }));
  const localPolicy = join(coordinator, "coordinator.json");
  writeFileSync(localPolicy, JSON.stringify({ reviewControls: controls(revised) }), { mode: 0o600 });
  const check = (commit: string, ...args: string[]) => spawnSync(process.execPath,
    [command, "review-policy", localPolicy, base, commit, ...args], { cwd: root, encoding: "utf8" });
  assert.notEqual(check(extended).status, 0);
  assert.notEqual(check(removed, "--owner-message", "project-chat/18").status, 0);
  const accepted = check(extended, "--owner-message", "project-chat/18");
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout), { base, head: extended, changed: ["tests/required.txt"], ownerMessage: "project-chat/18" });
});
