import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const selectedTest = "tests/baseline/contract.test.ts";
const selectedFixture = "tests/baseline/fixtures/a café.txt";
const selectedRunner = "tests/baseline/run.sh";
const settings = "runner.config.json";
const manifestPath = "accepted baseline.json";
const independentTest = "tests/baseline-extra/independent.test.ts";
const originalTest = [
  'import assert from "node:assert/strict";',
  'import { test } from "node:test";',
  'test("fixture total", () => assert.equal(2 + 3, 5));',
  "",
].join("\n");
const changedTest = originalTest.replace("2 + 3, 5", "2 + 3, 6");
const protectedFiles = [settings, selectedTest, selectedFixture, selectedRunner];
const selectors = [settings, "tests/baseline/"];
const gitEnv = {
  ...process.env,
  GIT_CONFIG_COUNT: "0",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function run(cwd: string, command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, {
    cwd, input, env: gitEnv, encoding: "utf8", timeout: 10_000,
  });
  assert.ok(!result.error, `${command} ${args[0] ?? ""}: ${result.error?.message}`);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function cli(cwd: string, args: string[], input?: string) {
  const installed = process.env.METHODOLOGY_BASELINE_BIN;
  if (installed !== undefined) {
    assert.ok(isAbsolute(installed), "METHODOLOGY_BASELINE_BIN must be an absolute executable path");
    return run(cwd, installed, args, input);
  }
  const bins: Partial<Record<string, string>> = packageInfo.bin;
  const entry = bins["methodology-baseline"];
  assert.ok(entry, "The package does not declare a methodology-baseline entry point");
  const script = fileURLToPath(new URL(entry, new URL("../", import.meta.url)));
  return run(cwd, process.execPath, [script, ...args], input);
}

function git(root: string, ...args: string[]) {
  const result = run(root, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function write(root: string, path: string, data: string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function commit(root: string, message: string) {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(root, "rev-parse", "HEAD").trim();
}

function project(t: TestContext, format = "sha1") {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "methodology baseline "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main", `--object-format=${format}`);
  git(root, "config", "user.name", "Baseline test");
  git(root, "config", "user.email", "baseline@example.test");
  git(root, "config", "commit.gpgSign", "false");
  git(root, "config", "core.fileMode", "true");
  git(root, "config", "core.hooksPath", "/dev/null");
  write(root, selectedTest, originalTest);
  write(root, selectedFixture, "total = 5\n");
  write(root, selectedRunner, "#!/bin/sh\nnode --test tests/baseline/*.test.ts\n");
  chmodSync(join(root, selectedRunner), 0o755);
  write(root, settings, '{"tests":["tests/baseline/*.test.ts"],"exclude":[],"coverage":true}\n');
  write(root, "src/index.js", "export const total = 5;\n");
  return { root, source: commit(root, "Source tests and runner controls") };
}

function manifest(root: string, source: string) {
  return {
    version: 1,
    source,
    paths: selectors,
    entries: protectedFiles.map((path) => ({
      path,
      mode: path === selectedRunner ? "100755" : "100644",
      oid: git(root, "rev-parse", `${source}:${path}`).trim(),
    })),
  };
}

function baseline(t: TestContext) {
  const { root, source } = project(t);
  // Use the documented manifest format so a freeze failure cannot hide a verify or hook failure.
  write(root, manifestPath, `${JSON.stringify(manifest(root, source))}\n`);
  return { root, source, trusted: commit(root, "Accept the baseline manifest") };
}

function freeze(root: string, source: string, paths: string[], cwd = root) {
  return cli(cwd, ["freeze", "--source", source, ...paths.flatMap((path) => ["--protect", path])]);
}

function verify(root: string, trusted: string, candidate: string, cwd = root) {
  return cli(cwd, ["verify", "--baseline", trusted, "--manifest", manifestPath, "--candidate", candidate]);
}

type Result = ReturnType<typeof cli>;

function allowed(result: Result) {
  assert.deepEqual(result, { status: 0, stdout: "", stderr: "" });
}

function rejected(result: Result, exit: 1 | 2, paths: string[] = []) {
  assert.equal(result.status, exit, result.stderr);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.trim(), "Expected a diagnostic");
  let reason = result.stderr;
  for (const path of paths) {
    assert.ok(result.stderr.includes(path), `Missing diagnostic path ${path}: ${result.stderr}`);
    reason = reason.replaceAll(path, "");
  }
  assert.match(reason, /\p{L}{2}/u, "Expected a reason alongside the path");
}

function hook(root: string, trusted: string, host: "claude" | "codex", input: string) {
  return cli(root, ["hook", "--host", host, "--repo", root, "--baseline", trusted, "--manifest", manifestPath], input);
}

function claude(cwd: string, tool: "Edit" | "Write", file: string) {
  return JSON.stringify({
    hook_event_name: "PreToolUse", cwd, tool_name: tool,
    tool_input: { file_path: file, old_string: "fixture", new_string: "sample", content: "sample\n" },
  });
}

function codex(cwd: string, patch: string) {
  return JSON.stringify({
    hook_event_name: "PreToolUse", cwd, tool_name: "apply_patch", tool_input: { command: patch },
  });
}

test("BM1/BM5 installed command prints its package version", (t) => {
  const { root } = project(t);
  assert.deepEqual(cli(root, ["--version"]), { status: 0, stdout: `${packageInfo.version}\n`, stderr: "" });
});

for (const format of ["sha1", "sha256"]) {
  test(`BM1/BM2/BM5 freeze reads and deterministically sorts ${format} Git paths from the source commit`, (t) => {
    const { root, source } = project(t, format);
    const paths = ["tests/baseline/", selectedFixture, settings, settings];
    const expected = manifest(root, source);
    expected.paths = [settings, "tests/baseline/", selectedFixture];
    write(root, selectedTest, changedTest);
    git(root, "add", selectedTest);
    const statusBefore = git(root, "status", "--porcelain=v1");
    const first = freeze(root, source, paths, join(root, "src"));
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, "");
    assert.ok(first.stdout.endsWith("\n"));
    assert.deepEqual(JSON.parse(first.stdout), expected);
    assert.deepEqual(freeze(root, source, [...paths].reverse()), first);
    assert.equal(git(root, "status", "--porcelain=v1"), statusBefore);
    assert.equal(readFileSync(join(root, selectedTest), "utf8"), changedTest);
    assert.equal(git(root, "rev-parse", "HEAD").trim(), source);
  });
}

test("BM2/BM5 freeze rejects invalid and nonregular selections", (t) => {
  const { root, source } = project(t);
  symlinkSync("contract.test.ts", join(root, "tests/baseline/linked.test.ts"));
  git(root, "add", "-A");
  git(root, "update-index", "--add", "--cacheinfo", `160000,${source},tests/baseline/gitlink`);
  git(root, "commit", "--quiet", "-m", "Add a symlink and a gitlink");
  const nonregular = git(root, "rev-parse", "HEAD").trim();
  for (const path of [
    join(root, settings), "Runner.config.json", "tests/baseline-extra/", "tests/baseline",
    "tests//baseline/", "./runner.config.json", "tests/../runner.config.json", ".git/config",
    "tests/baseline/linked.test.ts", "tests/baseline/gitlink", "tests/baseline/",
  ]) {
    const result = freeze(root, nonregular, [path]);
    assert.equal(result.status, 2, `Selection ${path}: ${result.stderr}`);
    rejected(result, 2);
  }
});

test("BM1/BM5 rejects abbreviations, refs, expressions, noncommit objects and missing commit IDs", (t) => {
  const { root, source, trusted } = baseline(t);
  git(root, "tag", "-a", "-m", "Tag object", "sample", source);
  const tag = git(root, "rev-parse", "sample").trim();
  const blob = git(root, "rev-parse", `${source}:${selectedTest}`).trim();
  const missing = "a".repeat(source.length);
  for (const argument of [source.slice(0, 12), "main", `${trusted}^1`, source.toUpperCase(), tag, blob, missing]) {
    rejected(freeze(root, argument, [settings]), 2);
    rejected(verify(root, trusted, argument), 2);
    rejected(verify(root, argument, trusted), 2);
  }
  rejected(cli(root, ["verify", "--baseline", trusted, "--manifest", manifestPath]), 2);
});

test("BM3/BM5 accepts a clean committed candidate and independent work", (t) => {
  const { root, trusted } = baseline(t);
  const clean = commit(root, "Clean candidate");
  allowed(verify(root, trusted, clean, join(root, "src")));
  write(root, independentTest, originalTest);
  write(root, "src/index.js", "export const total = 6;\n");
  const independent = commit(root, "Independent test and implementation");
  allowed(verify(root, trusted, independent));
});

test("BM1/BM3 ignores the working file, index, branch and replacement refs in both directions", (t) => {
  const { root, source, trusted } = baseline(t);
  write(root, selectedTest, changedTest);
  const changed = commit(root, "Modify the protected test");
  git(root, "switch", "--quiet", "--detach", trusted);
  git(root, "replace", changed, trusted);
  rejected(verify(root, trusted, changed), 1, [selectedTest]);
  git(root, "replace", "-d", changed);
  git(root, "replace", trusted, changed);
  git(root, "replace", source, changed);
  write(root, manifestPath, "Broken working manifest\n");
  write(root, selectedTest, changedTest);
  git(root, "add", selectedTest);
  allowed(verify(root, trusted, trusted));
  const frozen = freeze(root, source, selectors);
  assert.equal(frozen.status, 0, frozen.stderr);
  const originalBlob = git(root, "--no-replace-objects", "rev-parse", `${source}:${selectedTest}`).trim();
  assert.ok(JSON.parse(frozen.stdout).entries.some(
    (entry: { path: string; oid: string }) => entry.path === selectedTest && entry.oid === originalBlob,
  ));
});

type Change = { name: string; path: string; apply: (root: string, source: string) => void };
const candidateChanges: Change[] = [
  {
    name: "changed runner settings", path: settings,
    apply: (root) => write(root, settings, '{"tests":[],"exclude":["tests/baseline/**"],"coverage":false}\n'),
  },
  {
    name: "changed fixture", path: selectedFixture,
    apply: (root) => write(root, selectedFixture, "total = 6\n"),
  },
  {
    name: "new nested selected test", path: "tests/baseline/new/extra.test.ts",
    apply: (root) => write(root, "tests/baseline/new/extra.test.ts", originalTest),
  },
  {
    name: "deleted test", path: selectedTest,
    apply: (root) => rmSync(join(root, selectedTest)),
  },
  {
    name: "test renamed outside selection", path: selectedTest,
    apply: (root) => renameSync(join(root, selectedTest), join(root, "tests/renamed.test.ts")),
  },
  {
    name: "changed executable bit", path: selectedRunner,
    apply: (root) => chmodSync(join(root, selectedRunner), 0o644),
  },
  {
    name: "symlink at a selected test", path: selectedTest,
    apply: (root) => {
      rmSync(join(root, selectedTest));
      symlinkSync("../../src/index.js", join(root, selectedTest));
    },
  },
  {
    name: "symlink at a selected directory root", path: "tests/baseline",
    apply: (root) => {
      rmSync(join(root, "tests/baseline"), { recursive: true });
      symlinkSync("../src", join(root, "tests/baseline"));
    },
  },
  {
    name: "file replacing an ancestor of the selected directory", path: "tests",
    apply: (root) => {
      rmSync(join(root, "tests"), { recursive: true });
      write(root, "tests", "A file now occupies the ancestor path.\n");
    },
  },
  {
    name: "replaced manifest", path: manifestPath,
    apply: (root, source) => {
      const path = "src/index.js";
      const oid = git(root, "rev-parse", `${source}:${path}`).trim();
      const replacement = { version: 1, source, paths: [path], entries: [{ path, mode: "100644", oid }] };
      write(root, manifestPath, `${JSON.stringify(replacement)}\n`);
    },
  },
  {
    name: "absent manifest", path: manifestPath,
    apply: (root) => rmSync(join(root, manifestPath)),
  },
  {
    name: "changed manifest mode", path: manifestPath,
    apply: (root) => chmodSync(join(root, manifestPath), 0o755),
  },
];

for (const change of candidateChanges) {
  test(`BM3/BM5 rejects candidate with ${change.name}`, (t) => {
    const { root, source, trusted } = baseline(t);
    change.apply(root, source);
    const candidate = commit(root, change.name);
    const result = verify(root, trusted, candidate);
    rejected(result, 1, [change.path]);
    assert.ok(!result.stderr.includes(root), "Candidate diagnostics use Git-root-relative paths");
  });
}

test("BM3/BM5 verifier result for a committed shell write with local hooks skipped", (t) => {
  const { root, trusted } = baseline(t);
  const shellWrite = run(root, "/bin/sh", ["-eu", "-c", 'printf "%s" "$2" > "$1"', "sh", selectedTest, changedTest]);
  assert.equal(shellWrite.status, 0, shellWrite.stderr);
  git(root, "add", selectedTest);
  git(root, "commit", "--quiet", "--no-verify", "-m", "Commit the shell edit");
  const candidate = git(root, "rev-parse", "HEAD").trim();
  rejected(verify(root, trusted, candidate), 1, [selectedTest]);
  allowed(verify(root, trusted, trusted));
  assert.equal(git(root, "rev-parse", "HEAD").trim(), candidate);
  assert.equal(readFileSync(join(root, selectedTest), "utf8"), changedTest);
});

test("BM3/BM5 rejects malformed, missing, and tree-inconsistent trusted manifests", (t) => {
  const { root, source } = project(t);
  rejected(verify(root, source, source), 2);

  write(root, manifestPath, '{"version":');
  const malformed = commit(root, "Malformed manifest");
  rejected(verify(root, malformed, malformed), 2);

  const expected = manifest(root, source);
  write(root, manifestPath, `${JSON.stringify({ ...expected, version: 2 })}\n`);
  const unknownVersion = commit(root, "Unsupported manifest schema version");
  rejected(verify(root, unknownVersion, unknownVersion), 2);

  write(root, manifestPath, `${JSON.stringify({ ...expected, source: "a".repeat(source.length) })}\n`);
  const missingSource = commit(root, "Name an unavailable source commit");
  rejected(verify(root, missingSource, missingSource), 2);

  write(root, manifestPath, `${JSON.stringify({ ...expected, entries: expected.entries.slice(1) })}\n`);
  const incompleteInventory = commit(root, "Omit a selected entry");
  rejected(verify(root, incompleteInventory, incompleteInventory), 2);

  write(root, manifestPath, `${JSON.stringify(expected)}\n`);
  write(root, selectedTest, changedTest);
  const disagreesWithSource = commit(root, "Change a selected blob in the trusted commit");
  rejected(verify(root, disagreesWithSource, disagreesWithSource), 2);
});

test("BM4/BM5 Claude Edit and Write deny selected files, new selected leaves, ancestors and manifest", (t) => {
  const { root, trusted } = baseline(t);
  for (const [tool, path] of [
    ["Edit", selectedTest],
    ["Write", "tests/baseline/new fixture.txt"],
    ["Write", "tests"],
    ["Edit", manifestPath],
  ] as const) {
    const result = hook(root, trusted, "claude", claude(root, tool, join(root, path)));
    rejected(result, 2, [path]);
    assert.ok(!result.stderr.includes('"tool_input"'), "Hook diagnostics do not echo the request");
  }
  assert.equal(readFileSync(join(root, selectedTest), "utf8"), originalTest);
});

test("BM4/BM5 allows a Claude request for a new independent test through resolved ancestors", (t) => {
  const { root, trusted } = baseline(t);
  mkdirSync(join(root, "tests/baseline-extra"));
  allowed(hook(root, trusted, "claude", claude(join(root, "src"), "Write", join(root, independentTest))));
  assert.ok(!existsSync(join(root, independentTest)), "Hook permits ordinary host flow without performing the write");
});

test("BM4/BM5 Codex patch examines add, delete, update, and move destination paths", (t) => {
  const { root, trusted } = baseline(t);
  const cwd = join(root, "src");
  const hunks = [
    ["*** Add File: ../tests/baseline/fixtures/extra.txt\n+5", "tests/baseline/fixtures/extra.txt"],
    ["*** Delete File: ../runner.config.json", settings],
    [`*** Update File: ../${selectedTest}\n@@\n-${originalTest.split("\n")[2]}\n+${changedTest.split("\n")[2]}`, selectedTest],
    [
      "*** Add File: independent.js\n+export const n = 5;\n*** Update File: index.js\n" +
        "*** Move to: ../tests/baseline/moved.js\n@@\n-export const total = 5;\n+export const total = 6;",
      "tests/baseline/moved.js",
    ],
    [`*** Delete File: ../${manifestPath}`, manifestPath],
  ];
  for (const [hunk, path] of hunks) {
    rejected(hook(root, trusted, "codex", codex(cwd, `*** Begin Patch\n${hunk}\n*** End Patch\n`)), 2, [path]);
  }
  assert.ok(!existsSync(join(cwd, "independent.js")));
});

test("BM4/BM5 allows Codex patch content that mentions protected paths", (t) => {
  const { root, trusted } = baseline(t);
  const patch = [
    "*** Begin Patch",
    `*** Add File: ${independentTest}`,
    `+// A comment referring to ${selectedTest}.`,
    "+// The next line is data inside the new file.",
    `+*** Delete File: ${settings}`,
    "*** End Patch",
    "",
  ].join("\n");
  allowed(hook(root, trusted, "codex", codex(root, patch)));
  assert.ok(!existsSync(join(root, independentTest)));
});

test("BM4/BM5 both host adapters deny symlink aliases into the selected tree", (t) => {
  const { root, trusted } = baseline(t);
  symlinkSync("tests/baseline", join(root, "alias"));
  const target = "alias/new fixture.txt";
  rejected(hook(root, trusted, "claude", claude(root, "Write", join(root, target))), 2);
  rejected(hook(root, trusted, "codex", codex(root,
    `*** Begin Patch\n*** Add File: ${target}\n+5\n*** End Patch\n`)), 2);
});

test("BM4/BM5 rejects malformed, unsupported and out-of-worktree requests and an unavailable baseline", (t) => {
  const { root, source, trusted } = baseline(t);
  const validClaude = claude(root, "Write", join(root, independentTest));
  const validCodex = codex(root, `*** Begin Patch\n*** Add File: ${independentTest}\n+5\n*** End Patch\n`);
  const privateMarker = "fixture payload marker";
  rejected(hook(root, source, "claude", validClaude), 2);
  rejected(hook(root, source, "codex", validCodex), 2);
  for (const input of [
    '{"hook_event_name":',
    validClaude.replace("PreToolUse", "PostToolUse"),
    validClaude.replace('"Write"', '"Bash"'),
    claude(root, "Edit", selectedTest),
    claude(dirname(root), "Edit", join(root, "src/index.js")),
    claude(root, "Write", join(dirname(root), "outside-baseline.txt")),
  ]) {
    rejected(hook(root, trusted, "claude", input), 2);
  }
  for (const input of [
    validCodex.replace('"apply_patch"', '"shell"'),
    codex(root, `*** Begin Patch\n*** Add File: outside.txt\n+${privateMarker}`),
    codex(root, "*** Begin Patch\n*** Add File: ../outside-baseline.txt\n+5\n*** End Patch\n"),
  ]) {
    const result = hook(root, trusted, "codex", input);
    rejected(result, 2);
    assert.ok(!result.stderr.includes(privateMarker), "Blocking diagnostic does not print raw patch content");
  }
});
