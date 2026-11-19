import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const tools = fileURLToPath(new URL("../", import.meta.url));

function execute(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 90_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("packs, installs, and invokes the shipped command outside the source checkout", { timeout: 180_000 }, (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "methodology-packed-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const install = join(root, "install");
  const project = join(root, "sample project");
  mkdirSync(install);
  mkdirSync(project);
  writeFileSync(join(install, "package.json"), '{"private":true}');

  const npm = process.env.npm_execpath;
  assert.ok(npm, "Run the packed smoke test through npm run test:packed.");
  const pack = execute(process.execPath, [npm, "pack", "--json", "--pack-destination", root], tools);
  assert.equal(pack.status, 0, pack.stderr);
  type Artifact = {
    filename: string; integrity: string; files: { path: string }[];
  };
  // npm 11 reports an array. npm 12 reports an object keyed by package name.
  const packMetadata: Artifact[] | Record<string, Artifact> = JSON.parse(pack.stdout);
  const artifact = Array.isArray(packMetadata) ? packMetadata[0] : packMetadata[packageInfo.name];
  assert.ok(artifact?.filename);
  const files = artifact.files.map(({ path }) => path);
  assert.ok(files.includes(packageInfo.bin["methodology-check-links"].slice(2)));
  assert.ok(files.every((path) => path.startsWith("dist/") || path === "package.json" || path === "README.md"));
  console.log(`Packed ${artifact.filename} (${artifact.integrity})`);

  const installed = execute(process.execPath, [
    npm, "install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", join(root, artifact.filename),
  ], install);
  assert.equal(installed.status, 0, installed.stderr);
  const bin = join(install, "node_modules", ".bin", "methodology-check-links");
  assert.equal(realpathSync(bin), join(
    install, "node_modules", packageInfo.name, packageInfo.bin["methodology-check-links"],
  ));

  assert.deepEqual(execute(bin, ["--help"], project), {
    status: 0, stdout: "Usage: methodology-check-links [project-root]\n", stderr: "",
  });
  assert.deepEqual(execute(bin, ["--version"], project), {
    status: 0, stdout: `${packageInfo.version}\n`, stderr: "",
  });
  const index = join(project, "index.md");
  writeFileSync(index, '# Home\n\n<a href="  #ho\tme  ">Return home</a>\n');
  assert.deepEqual(execute(bin, [project], install), {
    status: 0, stdout: "Checked 1 Markdown files.\n", stderr: "",
  });
  writeFileSync(index, "# Home\n\n[Missing](#other)\n");
  assert.deepEqual(execute(bin, [project], install), {
    status: 1, stdout: "", stderr: 'index.md:3: unresolved fragment "other" in "#other"\n',
  });
  assert.deepEqual(execute(bin, ["one", "two"], project), {
    status: 2, stdout: "", stderr: "methodology-check-links: Usage: methodology-check-links [project-root]\n",
  });
});
