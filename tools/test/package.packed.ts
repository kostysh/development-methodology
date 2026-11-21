import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };
import { checkCases } from "./contract-results.ts";

const tools = fileURLToPath(new URL("../", import.meta.url));
const stamp = "2026-11-19T10:00:00Z";

test("packs once and invokes the installed commands with isolated local data", { timeout: 480_000 }, (t) => {
  const inventoryBytes = readFileSync(join(tools, "test", "required-cases.json"));
  // The release owner supplies the same digest independently to the Actions verification step.
  const approvedInventory = process.env.METHODOLOGY_APPROVED_INVENTORY_SHA256 ?? "25fd2fe9f2dad89d8226282248233bc4b275959e406d6273434d603684f8c5d9";
  assert.equal(createHash("sha256").update(inventoryBytes).digest("hex"), approvedInventory,
    "Required test inventory differs from the release owner's approved inventory");
  const inventory: Record<string, string[]> = JSON.parse(inventoryBytes.toString("utf8"));
  const root = mkdtempSync(join(realpathSync(tmpdir()), "methodology-metrics-packed-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const install = join(root, "install");
  const project = join(root, "project with spaces");
  mkdirSync(install);
  mkdirSync(project);
  writeFileSync(join(install, "package.json"), '{"private":true}');
  const npm = process.env.npm_execpath;
  assert.ok(npm, "Run the distribution smoke through npm run test:packed.");

  const pack = spawnSync(process.execPath, [npm, "pack", "--cache", join(root,"pack-cache"), "--json", "--pack-destination", root], {
    cwd: tools, encoding: "utf8", timeout: 90_000,
  });
  assert.ifError(pack.error);
  assert.equal(pack.status, 0, pack.stderr);
  const metadata = JSON.parse(pack.stdout);
  const artifact = Array.isArray(metadata) ? metadata[0] : metadata[packageInfo.name];
  assert.ok(artifact?.filename);
  const files: string[] = artifact.files.map(({ path }: { path: string }) => path);
  for (const entry of Object.values(packageInfo.bin)) assert.ok(files.includes(entry.slice(2)));
  assert.ok(files.includes("assets/train/dispatcher.yml"));
  assert.ok(files.every((path) => /^(dist|assets|node_modules)\//u.test(path) || path === "package.json" || path === "README.md"));
  console.log(`Packed ${artifact.filename} (${artifact.integrity})`);
  const installed = spawnSync(process.execPath, [
    npm, "install", "--offline", "--cache", join(root,"empty-npm-cache"), "--ignore-scripts", "--omit=dev",
    "--no-audit", "--no-fund", join(root, artifact.filename),
  ], { cwd: install, encoding: "utf8", timeout: 90_000 });
  assert.ifError(installed.error);
  assert.equal(installed.status, 0, installed.stderr);
  const trainAssets = join(install, "node_modules", packageInfo.name, "assets", "train");
  const cron = readFileSync(join(trainAssets, "methodology-train.cron"), "utf8");
  const scheduled = "/opt/methodology/bin/methodology-train run /etc/methodology/train.json --scheduled";
  assert.deepEqual(cron.split("\n").filter(line => /^\d/u.test(line)), ["0 0,2,4 * * * methodology-train " + scheduled]);
  const dispatcher = readFileSync(join(trainAssets, "dispatcher.yml"), "utf8");
  const triggers = dispatcher.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] ?? "";
  assert.deepEqual([...triggers.matchAll(/^  (\w+):/gm)].map(match => match[1]), ["workflow_dispatch"]);
  for (const binding of [
    "DISPATCH_REF: ${{ github.ref }}", "DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
    "SCHEDULED: ${{ toJSON(inputs.scheduled) }}", "DOCS: ${{ toJSON(inputs.docs) }}", "PR: ${{ inputs.pr }}", "SLOT: ${{ inputs.slot }}",
  ]) {
    assert.ok(dispatcher.includes(binding), binding);
  }
  const scripts = dispatcher.split("        run: |\n");
  assert.equal(scripts.length, 2, "one dispatch step");
  const train = "/opt/methodology/bin/methodology-train";
  assert.ok(scripts[1].includes("exec " + train + " "));
  // Execute the installed dispatcher's shell with a recorder at its one host-command boundary.
  const recorder = join(root, "dispatch-recorder");
  writeFileSync(recorder, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)))\n', { mode: 0o700 });
  const script = scripts[1].replaceAll(train, '"$DISPATCH_RECORDER"');
  const currentSlot = "2026-11-20T04:00:00Z";
  function dispatch(scheduled: boolean, slot: string, pr: string, docs: boolean, ref = "refs/heads/Main") {
    return spawnSync("bash", ["-eu", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH, DISPATCH_REF: ref, DEFAULT_BRANCH: "Main", SCHEDULED: String(scheduled), SLOT: slot,
        PR: pr, DOCS: String(docs), DISPATCH_RECORDER: recorder,
      },
    });
  }
  for (const [scheduled, slot, pr, docs, args] of [
    [true, currentSlot, "", false, ["--scheduled", "--slot", currentSlot]],
    [false, "", "", false, []],
    [false, "", "17", false, ["--pr", "17"]],
    [false, "", "17", true, ["--pr", "17", "--docs"]],
  ] as const) {
    const result = dispatch(scheduled, slot, pr, docs);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ["run", "/etc/methodology/train.json", ...args]);
  }
  for (const [scheduled, slot, pr, docs, message] of [
    [true, currentSlot, "17", false, /cannot select/],
    [true, currentSlot, "", true, /cannot select/],
    [true, currentSlot, "17", true, /cannot select/],
    [true, "", "", false, /current UTC slot/],
    [true, "2026-11-20T04:00:00.000Z", "", false, /current UTC slot/],
    [false, currentSlot, "", false, /Only a scheduled run/],
    [false, currentSlot, "17", false, /Only a scheduled run/],
    [false, currentSlot, "17", true, /Only a scheduled run/],
    [false, "", "", true, /requires a PR/],
    [false, "", "--scheduled", false, /positive PR/],
  ] as const) {
    const result = dispatch(scheduled, slot, pr, docs);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
  }
  for (const ref of ["refs/heads/main", "refs/tags/Main"]) {
    const declined = dispatch(true, currentSlot, "", false, ref);
    assert.equal(declined.status, 2);
    assert.equal(declined.stdout, "");
    assert.match(declined.stderr, /exact trusted default branch/);
  }
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
    issued_ids: ["task_1", "start_1", "end_1"], sources: {
      manual: { kind: "normalized" },
      taskfile: {kind:"task",task_id:"task_1",path:"task-input.jsonl"},
    },
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
  writeFileSync(join(root,"task-input.jsonl"),JSON.stringify({...event,event_type:"task.accepted",event_id:"end_1",
    source_id:"taskfile"})+"\n");
  const imported=run(["collect",path,"taskfile"]);
  assert.equal(imported.status,0,imported.stderr);
  const saved=readFileSync(join(root,"events.jsonl"),"utf8");
  assert.deepEqual(saved.trim().split("\n").map(line=>JSON.parse(line).event_id),["start_1","end_1"]);
  assert.equal(run(["collect",path,"taskfile"]).status,0);
  assert.equal(readFileSync(join(root,"events.jsonl"),"utf8"),saved);
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
  const contractEnv: NodeJS.ProcessEnv = {
    ...process.env,
    METHODOLOGY_BASELINE_BIN: installedBin("methodology-baseline"),
    METHODOLOGY_RECOVERY_BIN: installedBin("methodology-recovery"),
    METHODOLOGY_METRICS_BIN: metrics,
    METHODOLOGY_CONTROLS_BIN: installedBin("methodology-controls"),
    METHODOLOGY_TRAIN_BIN: installedBin("methodology-train"),
    METHODOLOGY_SOLO_BIN: installedBin("methodology-solo"),
    METHODOLOGY_TASK_BIN: installedBin("methodology-task"),
  };
  // A nested Node test runner skips its files if it inherits this marker.
  delete contractEnv.NODE_TEST_CONTEXT;

  const suites = readdirSync(join(tools,"test")).filter(name=>name.endsWith(".test.ts")).sort();
  assert.deepEqual(Object.keys(inventory).sort(),suites,"Every mandatory suite must have a reviewed inventory");
  const frozen: Record<string,string> = {
    "baseline-contract.test.ts":"580897630e83456561accbcfd083ffff1361a832299e263639a769e064aaf3ae",
    "recovery-contract.test.ts":"1ecf6bfecfb6b88cfb15489a763a7aa9645150149ad923b36198e4ccf5a1ed9b",
    "train-metrics-contract.test.ts":"258996ef297efc022a91dc391afc72ebce35ebb7e00146a91a46e86e45625b1f",
  };
  for (const [file,digest] of Object.entries(frozen)) {
    assert.ok(Object.hasOwn(inventory,file), "Missing frozen suite " + file);
    assert.equal(createHash("sha256").update(readFileSync(join(tools,"test",file))).digest("hex"),digest,file);
  }
  for (const [file,required] of Object.entries(inventory)) {
    const contract = spawnSync(process.execPath, [
      "--test", "--test-reporter=tap", join(tools, "test", file),
    ], {
      cwd: project,
      env: contractEnv,
      encoding: "utf8",
      timeout: 90_000,
    });
    assert.ifError(contract.error);
    const output = contract.stdout + contract.stderr;
    assert.equal(contract.status, 0, output);
    checkCases(contract.stdout,required);
    console.log(`${file} passed all ${required.length} required tests.`);
  }
  const releaseDir=process.env.METHODOLOGY_RELEASE_DIR;
  if (releaseDir) {
    mkdirSync(releaseDir,{recursive:true});
    const archive=join(root,artifact.filename);
    copyFileSync(archive,join(releaseDir,artifact.filename));
    const hash=createHash("sha256").update(readFileSync(archive)).digest("hex");
    writeFileSync(join(releaseDir,artifact.filename+".sha256"),hash+"  "+artifact.filename+"\n");
  }
});
