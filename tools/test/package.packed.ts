import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };

const tools = fileURLToPath(new URL("../", import.meta.url));
const stamp = "2026-11-19T10:00:00Z";

test("packs once and invokes the installed commands with isolated local data", { timeout: 180_000 }, (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "methodology-metrics-packed-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const install = join(root, "install");
  const project = join(root, "project with spaces");
  mkdirSync(install);
  mkdirSync(project);
  writeFileSync(join(install, "package.json"), '{"private":true}');
  const npm = process.env.npm_execpath;
  assert.ok(npm, "Run the distribution smoke through npm run test:packed.");

  const pack = spawnSync(process.execPath, [npm, "pack", "--json", "--pack-destination", root], {
    cwd: tools, encoding: "utf8", timeout: 90_000,
  });
  assert.ifError(pack.error);
  assert.equal(pack.status, 0, pack.stderr);
  const metadata = JSON.parse(pack.stdout);
  const artifact = Array.isArray(metadata) ? metadata[0] : metadata[packageInfo.name];
  assert.ok(artifact?.filename);
  const files: string[] = artifact.files.map(({ path }: { path: string }) => path);
  for (const entry of Object.values(packageInfo.bin)) assert.ok(files.includes(entry.slice(2)));
  assert.ok(files.every((path) => path.startsWith("dist/") || path === "package.json" || path === "README.md"));
  console.log(`Packed ${artifact.filename} (${artifact.integrity})`);
  const installed = spawnSync(process.execPath, [
    npm, "install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", join(root, artifact.filename),
  ], { cwd: install, encoding: "utf8", timeout: 90_000 });
  assert.ifError(installed.error);
  assert.equal(installed.status, 0, installed.stderr);
  function installedBin(command: keyof typeof packageInfo.bin) {
    const bin = join(install, "node_modules", ".bin", command);
    assert.equal(realpathSync(bin), join(install, "node_modules", packageInfo.name, packageInfo.bin[command]));
    return bin;
  }
  const metrics = installedBin("methodology-metrics");
  const links = installedBin("methodology-check-links");

  function invoke(bin: string, args: string[], input = "", cwd = project) {
    const child = spawnSync(bin, args, { cwd, encoding: "utf8", input, timeout: 6000 });
    assert.ifError(child.error);
    assert.equal(child.signal, null);
    return { status: child.status, stdout: child.stdout, stderr: child.stderr };
  }
  assert.deepEqual(invoke(links, ["--help"]), {
    status: 0, stdout: "Usage: methodology-check-links [project-root]\n", stderr: "",
  });
  assert.deepEqual(invoke(links, ["--version"]), {
    status: 0, stdout: `${packageInfo.version}\n`, stderr: "",
  });
  const index = join(project, "index.md");
  writeFileSync(index, '# Home\n\n<a href="  #ho\tme  ">Return home</a>\n');
  assert.deepEqual(invoke(links, [project], "", install), {
    status: 0, stdout: "Checked 1 Markdown files.\n", stderr: "",
  });
  writeFileSync(index, "# Home\n\n[Missing](#other)\n");
  assert.deepEqual(invoke(links, [project], "", install), {
    status: 1, stdout: "", stderr: 'index.md:3: unresolved fragment "other" in "#other"\n',
  });
  assert.deepEqual(invoke(links, ["one", "two"]), {
    status: 2, stdout: "", stderr: "methodology-check-links: Usage: methodology-check-links [project-root]\n",
  });

  const run = (args: string[], input = "") => invoke(metrics, args, input);
  assert.equal(run(["--version"]).stdout, `${packageInfo.version}\n`);
  assert.match(run(["--help"]).stdout, /^Usage: methodology-metrics record PROFILE/u);
  const path = join(root, "private-profile.json");
  writeFileSync(path, JSON.stringify({
    project_id: "fixture", project_root: project, journal: "events.jsonl", identity_key: "34".repeat(32),
    issued_ids: ["task_1", "start_1"], sources: { manual: { kind: "normalized" } },
  }), { mode: 0o600 });
  const event = {
    schema_version: 1, project_id: "fixture", event_id: "start_1", source_id: "manual",
    event_type: "task.started", occurred_at: stamp, observed_at: stamp,
    actor_role: "operator", task_id: "task_1", data: {},
  };
  assert.deepEqual(run(["record", path], JSON.stringify(event) + "\n"), {
    status: 0, stdout: "Recorded 1 events, 0 repeats, 0 gaps.\n", stderr: "",
  });
  assert.equal(JSON.parse(readFileSync(join(root, "events.jsonl"), "utf8")).event_id, "start_1");
  const report = run(["summary", path, "task_1", "--as-of", stamp]);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).task_id, "task_1");
  assert.deepEqual(run(["hook", path, "manual"], "{"), {
    status: 0, stdout: "", stderr: "methodology-metrics: coverage_gap\n",
  });
  assert.deepEqual(run(["collect", path, "manual"]), {
    status: 1, stdout: "", stderr: "methodology-metrics: source_missing\n",
  });
  assert.deepEqual(run(["record", path, "extra"]), {
    status: 2, stdout: "", stderr: "methodology-metrics: invalid_arguments\n",
  });
  const contract = spawnSync(process.execPath, [
    "--test", join(tools, "test/baseline-contract.test.ts"), join(tools, "test/recovery-contract.test.ts"),
    join(tools, "test/train-metrics-contract.test.ts"),
  ], {
    cwd: project,
    env: {
      ...process.env,
      METHODOLOGY_BASELINE_BIN: installedBin("methodology-baseline"),
      METHODOLOGY_RECOVERY_BIN: installedBin("methodology-recovery"),
      METHODOLOGY_METRICS_BIN: metrics,
    },
    encoding: "utf8",
    timeout: 90_000,
  });
  assert.ifError(contract.error);
  assert.equal(contract.status, 0, contract.stdout + contract.stderr);
});
