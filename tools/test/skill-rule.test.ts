import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const guide = fileURLToPath(new URL("../../", import.meta.url));
const chapter = "method/15-skills.md";
const rule = readFileSync(join(guide, chapter), "utf8").split("<!-- skill-loading:start -->\n")[1]
  .split("\n<!-- skill-loading:end -->")[0];
const bin = process.env.METHODOLOGY_CONTROLS_BIN ?? process.execPath;
const prefix = process.env.METHODOLOGY_CONTROLS_BIN ? [] : [fileURLToPath(new URL("../dist/controls.js", import.meta.url))];

function setup(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "project skill rule "));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const project = join(root, "project");
  execFileSync("git", ["init", "-q", project]);
  const next = join(root, "guide");
  mkdirSync(join(next, "method"), { recursive: true });
  const putRule = (body: string) => writeFileSync(join(next, chapter),
    "<!-- skill-loading:start -->\n" + body + "\n<!-- skill-loading:end -->\n");
  const file = join(project, "AGENTS.md");
  const override = join(project, "AGENTS.override.md");
  const run = (source = guide, cwd = project, env = process.env) => {
    const child = spawnSync(bin, [...prefix, "sync-skill-rule", source], { cwd, env, encoding: "utf8", timeout: 15_000 });
    assert.ifError(child.error);
    return child;
  };
  return { root, project, next, putRule, file, override, run };
}

test("skill rule sync installs, adopts and updates the effective root instructions", t => {
  const { file, override, run, next, putRule } = setup(t);
  const added = run();
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(JSON.parse(added.stdout), { path: "AGENTS.md", status: "created" });
  const first = readFileSync(file, "utf8");
  assert.ok(first.includes("\n" + rule + "\n"));
  const inode = statSync(file).ino;
  assert.equal(JSON.parse(run().stdout).status, "unchanged");
  assert.equal(statSync(file).ino, inode);
  const start = "\uFEFF# Progetto\r\n\r\n";
  const finish = "\r\n\r\nKeep this café rule.  ";
  const examples = "# Examples\n\n~~~md\n" + first + "~~~\n\n<!--\n" + rule + "\n-->\n";
  writeFileSync(override, examples);
  const fromExamples = run();
  assert.equal(fromExamples.status, 0, fromExamples.stderr);
  assert.equal(readFileSync(override, "utf8"), examples + "\n" + first);
  assert.equal(JSON.parse(run().stdout).status, "unchanged");
  writeFileSync(override, start + rule + finish);
  chmodSync(override, 0o640);
  const adopted = run();
  assert.equal(adopted.status, 0, adopted.stderr);
  assert.deepEqual(JSON.parse(adopted.stdout), { path: "AGENTS.override.md", status: "updated" });
  const managed = readFileSync(override, "utf8");
  assert.equal(managed, start + first.trimEnd().replaceAll("\n", "\r\n") + finish);
  assert.equal(statSync(override).mode & 0o777, 0o640);
  putRule("New rule from the next guide.");
  assert.equal(run(next).status, 0);
  const updated = readFileSync(override, "utf8");
  assert.ok(updated.startsWith(start) && updated.endsWith(finish));
  assert.ok(updated.includes("\r\nNew rule from the next guide.\r\n"));
  assert.ok(!updated.includes(rule));
  assert.equal(JSON.parse(run(next).stdout).status, "unchanged");
  assert.equal(readFileSync(file, "utf8"), first);
  writeFileSync(override, "");
  assert.equal(JSON.parse(run().stdout).path, "AGENTS.override.md");
  assert.equal(readFileSync(override, "utf8"), first);
  rmSync(override);
  writeFileSync(file, start + "Project rules without a final newline");
  assert.equal(run().status, 0);
  assert.equal(readFileSync(file, "utf8"), start + "Project rules without a final newline\r\n\r\n" + first.replaceAll("\n", "\r\n"));
});

test("skill rule sync preserves local conflicts and rejects malformed guides and links", t => {
  const { root, next, putRule, file, override, run } = setup(t);
  assert.equal(run().status, 0);
  const first = readFileSync(file, "utf8");
  for (const [invalid, error] of [
    [first.replace(rule, "Locally amended."), /Local changes/u],
    [first + "<!-- skill-loading:end -->\n", /pair of skill-loading markers/u],
    [first.replace("<!-- skill-loading:end -->", "<!-- removed end -->"), /pair of skill-loading markers/u],
    [rule + "\n\n" + rule + "\n", /Multiple matching/u],
    ["# Example\n\n~~~md\n" + rule, /unclosed Markdown block/u],
    ["<!-- Unfinished comment\n" + rule, /pair of skill-loading markers|unclosed Markdown block/u],
  ] as const) {
    writeFileSync(file, invalid);
    const held = run();
    assert.equal(held.status, 1, held.stderr);
    assert.match(held.stderr, error);
    assert.equal(readFileSync(file, "utf8"), invalid);
  }
  writeFileSync(file, "Local source of truth.");
  const source = join(next, chapter);
  for (const invalid of ["Missing markers", "<!-- skill-loading:start -->",
    "<!-- skill-loading:end -->\n<!-- skill-loading:start -->", "~~~md\n" + first + "~~~", first + first, first]) {
    writeFileSync(source, invalid);
    const held = run(next);
    assert.equal(held.status, 1, held.stderr);
    assert.equal(readFileSync(file, "utf8"), "Local source of truth.");
  }
  rmSync(source);
  symlinkSync(file, source);
  assert.match(run(next).stderr, /symlink in guide/u);
  rmSync(source);
  putRule(rule);
  for (const alias of [() => symlinkSync(file, override), () => linkSync(file, override), () => symlinkSync(join(root, "absent"), override)]) {
    alias();
    assert.notEqual(run().status, 0);
    rmSync(override);
    assert.equal(readFileSync(file, "utf8"), "Local source of truth.");
  }
});

test("skill rule sync targets the invoked worktree and protects concurrent project edits", async t => {
  const { root, project, file, next, putRule, run } = setup(t);
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.invalid",
    "commit", "--allow-empty", "-qm", "base"], { cwd: project });
  const linked = join(root, "linked");
  execFileSync("git", ["worktree", "add", "-q", "--detach", linked], { cwd: project });
  const sub = join(linked, "sub");
  mkdirSync(sub);
  assert.equal(run(guide, sub).status, 1);
  assert.equal(existsSync(file), false);
  assert.equal(existsSync(join(linked, "AGENTS.md")), false);
  const calls = await Promise.all([1, 2, 3].map(() => promisify(execFile)(bin,
    [...prefix, "sync-skill-rule", guide], { cwd: linked })));
  assert.deepEqual(calls.map(c => JSON.parse(c.stdout).status).sort(), ["created", "unchanged", "unchanged"]);
  assert.ok(readFileSync(join(linked, "AGENTS.md"), "utf8").includes(rule));
  assert.equal(existsSync(file), false);

  // Deterministically insert an independent edit after the new bytes are staged.
  const hook = join(root, "edit.cjs");
  writeFileSync(hook, [
    'const fs = require("node:fs");',
    'const original = fs.writeFileSync;',
    'fs.writeFileSync = (...args) => {',
    '  const value = original(...args);',
    '  if (typeof args[0] === "number") original("AGENTS.md", "Project edited concurrently.\\n");',
    '  return value;',
    '};',
    'require("node:module").syncBuiltinESMExports();',
  ].join("\n"));
  putRule("Next installed skill rule.");
  const failed = run(next, linked, { ...process.env, NODE_OPTIONS: '--require="' + hook + '"' });
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /changed during synchronization/u);
  assert.equal(readFileSync(join(linked, "AGENTS.md"), "utf8"), "Project edited concurrently.\n");
});
