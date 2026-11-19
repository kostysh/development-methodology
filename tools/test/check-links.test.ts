import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const command = fileURLToPath(new URL("../dist/check-links.js", import.meta.url));

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "methodology-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root: string, name: string, content: string) {
  const file = join(root, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function check(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: root, encoding: "utf8", timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("accepts Markdown references, rendered heading slugs, explicit anchors, and escaped paths", (t) => {
  const root = fixture(t);
  write(root, "intro.md", [
    "# Home",
    "",
    "[Same document](#home) [A reference][GUIDE]",
    "[Duplicate heading](section/#use-api-1) [Case-sensitive anchor](section/README.md#Intro)",
    "[Unicode fragment](/section/README.md#caf%C3%A9) [Odd filename](note%20%23%3F.md?mode=full#part)",
    "[Directory](section/) ![Figure][figure] [External](https://example.test/absent)",
    "",
    "[guide]: section/README.md#use-api",
    "[figure]: images/plot%281%29.png",
    "",
    "`[Code example](absent.md)`",
    "",
    "```md",
    "[Fenced example](absent.md)",
    "<a name=\"home\"></a>",
    "```",
    "",
    "    [Indented example](absent.md)",
    "",
    "<!-- <a name=\"home\"></a><a href=\"absent.md\">Comment</a> -->",
  ].join("\n"));
  write(root, "section/README.md", [
    "# Use `API`!",
    "",
    "## Use **API**",
    "",
    "Café\n----",
    "",
    "<a name=\"Intro\" id=\"Intro\"></a>",
  ].join("\n"));
  write(root, "note #?.md", "# Part");
  write(root, "images/plot(1).png", "");
  assert.deepEqual(check(root), { status: 0, stdout: "Checked 3 Markdown files.\n", stderr: "" });
});

test("fails an inbound reference when only the target changes", (t) => {
  const root = fixture(t);
  const original = "# Index\n\n[Target][guide]\n\n[guide]: guide.md#old-section\n";
  write(root, "index.md", original);
  write(root, "guide.md", "# Old section");
  assert.equal(check(root).status, 0);
  write(root, "guide.md", "# New section");
  assert.equal(readFileSync(join(root, "index.md"), "utf8"), original);
  assert.deepEqual(check(root), {
    status: 1,
    stdout: "",
    stderr: 'index.md:3: unresolved fragment "old-section" in "guide.md#old-section"\n',
  });
});

test("normalizes raw HTML URLs while preserving meaningful spaces", (t) => {
  const root = fixture(t);
  write(root, "index.md", [
    '<a href="  guide.md#target  ">Read</a>',
    "",
    '<a href="  gui\tde.md#tar\nget  ">Read across lines</a>',
    "",
    '<a href="  %20guide.md#target%20  ">Read an encoded path and anchor</a>',
    "",
    '<a href="  \u00a0note.md#read  ">Read a path with a non-breaking space</a>',
    "",
    '<img src="  images/plot one.png  " alt="Figure">',
  ].join("\n"));
  write(root, "guide.md", "# Target");
  write(root, " guide.md", '<a name="target "></a>');
  write(root, "\u00a0note.md", "# Read");
  write(root, "images/plot one.png", "");
  assert.deepEqual(check(root), { status: 0, stdout: "Checked 4 Markdown files.\n", stderr: "" });
});

test("reports duplicate explicit anchors and collisions with generated heading anchors", (t) => {
  const root = fixture(t);
  write(root, "anchors.markdown", [
    '<a name="repeat-1"></a>',
    "",
    "# Repeat",
    "",
    "# Repeat",
    "",
    '<a id="fixed"></a>',
    "",
    "<span id='fixed'>second anchor</span>",
  ].join("\n"));
  assert.deepEqual(check(root), {
    status: 1,
    stdout: "",
    stderr: [
      'anchors.markdown:1: explicit anchor "repeat-1" collides with heading at line 5',
      'anchors.markdown:9: duplicate explicit anchor "fixed"',
      "",
    ].join("\n"),
  });
});

test("reports missing paths and Markdown fragments and identifies the source line", (t) => {
  const root = fixture(t);
  write(root, "docs/start.md", [
    "# Start",
    "",
    "Paragraph starts here.",
    "[Wrong path](missing.md)",
    "",
    "| Label | Link |",
    "| --- | --- |",
    "| Directory | [Unknown fragment](./#elsewhere) |",
    "",
    '<a href="other.md#%ZZ">Invalid URL</a>',
    "",
    "[File as directory](./start.md/)",
  ].join("\n"));
  assert.deepEqual(check(root), {
    status: 1,
    stdout: "",
    stderr: [
      'docs/start.md:4: unresolved local path "missing.md"',
      'docs/start.md:8: unresolved fragment "elsewhere" in "./#elsewhere"',
      'docs/start.md:10: invalid local URL "other.md#%ZZ"',
      'docs/start.md:12: unresolved local path "./start.md/"',
      "",
    ].join("\n"),
  });
});

test("ignores excluded directories and links escaping the project", { skip: process.platform === "win32" }, (t) => {
  const parent = fixture(t);
  const root = join(parent, "repo");
  write(root, "index.md", "[Outside](../outside.md) [Symlink](outside.md#absent) [Dependency](node_modules/absent.md)");
  write(parent, "outside.md", "[Outside link](missing.md)");
  symlinkSync(join(parent, "outside.md"), join(root, "outside.md"));
  for (const directory of [".git", ".worktrees", "node_modules", "dist", "build"]) {
    write(root, `${directory}/README.md`, "[Ignored](absent.md)");
  }
  assert.deepEqual(check(root), { status: 0, stdout: "Checked 1 Markdown files.\n", stderr: "" });
});

test("fails closed for a missing, empty, or invalid project root", (t) => {
  const root = fixture(t);
  assert.deepEqual(check(root), {
    status: 2, stdout: "", stderr: "methodology-check-links: project root has no Markdown files\n",
  });
  const missing = check(root, "missing");
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /^methodology-check-links: ENOENT/u);
  assert.deepEqual(check(root, ""), {
    status: 2, stdout: "", stderr: "methodology-check-links: Usage: methodology-check-links [project-root]\n",
  });
});
