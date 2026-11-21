import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { add, config, fixture, git, revision } from "./train-runtime-fixture.ts";

const bin = process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js", import.meta.url));
const provider = fileURLToPath(new URL("./train-private-free-provider.ts", import.meta.url));
const shellArg = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";

function setup(t: TestContext) {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = join(root, "remote.git");
  const base = revision(root);
  const c = config(root);
  const admissionPolicy = join(root, "admission.json");
  const gate = { name: "admission", appId: 15368,
    workflow: {id: 81, path: ".github/workflows/admission.yml", blob: "c".repeat(40), event: "workflow_dispatch"} };
  writeFileSync(admissionPolicy, JSON.stringify({
    repository: c.repository, branch: c.branch, reviewerId: 81, submitterId: 73,
    required: [{id: "fast", name: "fast", appId: 124}],
  }), { mode: 0o600 });
  const profile = { ...c, branchPolicy: "private-free", initialBase: base, immutableSources: false,
    admissionPolicy, checks: [gate] };
  const state = {
    installation: { total_count: 1, repositories: [{full_name: c.repository, private: true}] },
    servedRef: "refs/heads/main", afterSuite: "",
    submissions: [] as { number: number; ref: string; head: string; reviewBase: string }[],
    expectedFiles: {} as Record<string, string>,
  };
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = join(root, "fixture.pem");
  writeFileSync(key, privateKey.export({format: "pem", type: "pkcs8"}), {mode: 0o600});
  writeFileSync(join(root, "public.pem"), publicKey.export({format: "pem", type: "spki"}));
  const realGit = execFileSync("which", ["git"], {encoding: "utf8"}).trim();
  writeFileSync(join(root, "real-git"), realGit);
  const commands = join(root, "bin");
  mkdirSync(commands);
  for (const command of ["gh", "curl", "docker"]) {
    writeFileSync(join(commands, command), "#!/bin/sh\nexec " +
      [process.execPath, provider, command, root].map(shellArg).join(" ") + ' "$@"\n', {mode: 0o700});
  }
  // Real Git fetches and pushes to a bare remote. A competing writer can
  // advance its target exactly after the final reread and before the push.
  const competitor = join(root, "competing-write");
  writeFileSync(join(commands, "git"), [
    "#!/bin/sh", "set -eu",
    'if test "$3" = push && test -f ' + shellArg(competitor) + "; then",
    "  read -r newtip < " + shellArg(competitor),
    "  " + shellArg(realGit) + " -C " + shellArg(bare) + ' update-ref refs/heads/main "$newtip"', "fi",
    "exec " + shellArg(realGit) + " -c " + shellArg("url." + bare + ".insteadOf=https://github.com/" + c.repository + ".git") + ' "$@"',
  ].join("\n") + "\n", {mode: 0o700});

  function invoke(overrides: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = {}) {
    writeFileSync(join(root, "provider.json"), JSON.stringify(state));
    writeFileSync(join(root, "train.json"), JSON.stringify({...profile, ...overrides}));
    writeFileSync(join(root, "requests"), "");
    rmSync(join(root, "verified"), {force: true});
    const result = spawnSync(process.execPath, [bin, "run", join(root, "train.json")], {
      encoding: "utf8", timeout: 45_000, cwd: root,
      env: {PATH: commands + ":" + process.env.PATH, TRAIN_APP_KEY_FILE: key, TRAIN_INSTALLATION_ID: "321", ...env},
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { ...result, requests: readFileSync(join(root, "requests"), "utf8"),
      receipt: result.stdout ? JSON.parse(result.stdout) : undefined };
  }
  function submit(n: number) {
    const file = "file-" + n;
    const value = "reviewed content " + n;
    const head = add(root, n, file, value);
    const ref = "ready/task-" + n + "-" + head;
    git(bare, "update-ref", "refs/heads/" + ref, head);
    state.submissions.push({number: n, ref, head, reviewBase: revision(root)});
    state.expectedFiles[file] = value;
    return head;
  }
  return {root, bare, base, competitor, profile, state, submit, invoke};
}

test("private-free requires explicit configuration and ruleset failures keep strict profiles closed", t => {
  const {root, base, profile, invoke} = setup(t);
  for (const invalid of [
    {branchPolicy: "automatic"}, {initialBase: undefined}, {initialBase: base.slice(0, 7)},
    {admissionPolicy: undefined}, {immutableSources: true}, {ruleEvidence: profile.admissionPolicy},
  ]) {
    const result = invoke(invalid);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /Invalid train profile/);
    assert.equal(result.requests, "");
  }
  for (const branchPolicy of [undefined, "rulesets"]) {
    const result = invoke({branchPolicy, initialBase: undefined, immutableSources: true});
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.receipt.branchPolicy, "rulesets");
    assert.deepEqual(result.receipt.integrated, []);
    assert.ok(result.receipt.incidents.length);
    assert.match(result.requests, /GET \/repos\/example\/disposable\/rules\/branches\/main/);
    assert.doesNotMatch(result.requests, /\/pulls|git\/ref/);
  }
  assert.equal(revision(root), base);
});

test("private-free authenticates the configured App and checks private repository scope and target ref", t => {
  const {root, base, state, invoke} = setup(t);
  const one = state.installation.repositories[0];
  const empty = invoke();
  assert.equal(empty.status, 0, empty.stderr + empty.stdout);
  assert.equal(empty.receipt.branchPolicy, "private-free");
  const wrongBase = invoke({initialBase: "a".repeat(40)});
  assert.equal(wrongBase.status, 1, wrongBase.stderr + wrongBase.stdout);
  assert.match(wrongBase.receipt.incidents.join(), /unexpected integration tip/i);
  assert.doesNotMatch(wrongBase.requests, /\/pulls/);
  const tokenOnly = invoke({}, {TRAIN_APP_KEY_FILE: "", GH_TOKEN: "local-installation"});
  assert.notEqual(tokenOnly.status, 0, tokenOnly.stdout);
  assert.doesNotMatch(tokenOnly.requests, /\/pulls/);
  const otherApp = invoke({writerAppId: 999});
  assert.notEqual(otherApp.status, 0, otherApp.stdout);
  assert.doesNotMatch(otherApp.requests, /\/pulls/);
  for (const installation of [
    {total_count: 1, repositories: [{...one, private: false}]},
    {total_count: 1, repositories: [{...one, full_name: "example/different"}]},
    {total_count: 2, repositories: [one]},
  ]) {
    state.installation = installation;
    const result = invoke();
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.ok(result.receipt.incidents.length);
    assert.doesNotMatch(result.requests, /\/pulls/);
  }
  state.installation = {total_count: 1, repositories: [one]};
  state.servedRef = "refs/heads/another";
  const wrongRef = invoke();
  assert.equal(wrongRef.status, 1, wrongRef.stderr + wrongRef.stdout);
  assert.ok(wrongRef.receipt.incidents.length);
  assert.deepEqual(wrongRef.receipt.integrated, []);
  assert.equal(revision(root), base);
});

test("a private-free train integrates the reviewed trees and detects an outside update on a later empty run", t => {
  const {root, bare, base, state, submit, invoke} = setup(t);
  const first = submit(1);
  const second = submit(2);
  const dry = invoke({mode: "dry"});
  assert.equal(dry.status, 0, dry.stderr + dry.stdout);
  assert.deepEqual(dry.receipt.proposed, [1, 2]);
  assert.deepEqual(dry.receipt.integrated, []);
  assert.equal(revision(root), base);
  assert.doesNotMatch(dry.requests, /^POST|^DELETE/m);
  const run = invoke();
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.receipt.branchPolicy, "private-free");
  const tip = revision(root);
  assert.deepEqual(run.receipt.integrated, [1, 2]);
  assert.notEqual(tip, base);
  assert.equal(run.receipt.branchReadback, tip);
  assert.equal(run.receipt.treeReadback, git(bare, "rev-parse", tip + "^{tree}"));
  assert.deepEqual(run.receipt.attempts.map((a: {sha: string}) => a.sha), [tip]);
  for (const head of [first, second]) assert.equal(git(bare, "merge-base", head, tip), head);
  for (const [file, contents] of Object.entries(state.expectedFiles)) assert.equal(git(bare, "show", tip + ":" + file), contents);
  assert.doesNotMatch(run.requests, /\/rules\/|\/rulesets/);
  const clean = invoke();
  assert.equal(clean.status, 0, clean.stderr + clean.stdout);
  assert.deepEqual(clean.receipt.attempts, []);
  const outside = add(root, 3, "outside");
  git(bare, "update-ref", "refs/heads/main", outside, tip);
  const held = invoke();
  assert.equal(held.status, 1, held.stderr + held.stdout);
  assert.ok(held.receipt.incidents.length);
  assert.deepEqual(held.receipt.integrated, []);
  assert.equal(revision(root), outside);
});

test("private-free rejects post-verification source, review and check changes and an intervening Git writer", t => {
  for (const [change, mode, incident] of [
    ["source", "enabled", /source changed/i], ["source", "dry", /source changed/i],
    ["pull", "enabled", /final admission/i], ["review base", "enabled", /final admission/i],
    ["missing review base", "enabled", /final admission/i], ["API base", "enabled", /final admission/i],
    ["reviewer", "enabled", /final admission/i], ["check", "enabled", /final admission/i],
    ["lease", "enabled", /leased Git push failed/i],
  ] as const) {
    const {root, competitor, base, state, submit, invoke} = setup(t);
    const head = submit(1);
    state.afterSuite = change;
    if (change === "lease") writeFileSync(competitor, head + "\n");
    const held = invoke({mode});
    assert.equal(held.status, 1, change + ": " + held.stderr + held.stdout);
    assert.ok(existsSync(join(root, "verified")), change + ": " + held.stderr + held.stdout);
    assert.equal(held.receipt.attempts[0].result.result, "pass", change);
    assert.deepEqual(held.receipt.integrated, [], change);
    assert.match(held.receipt.incidents.join(), incident, change);
    assert.equal(revision(root), change === "lease" ? head : base, change);
  }

  // A draft PR initially points outside the batch. Moving its source branch
  // to the reviewed PR's head would let GitHub merge the draft indirectly.
  for (const timing of ["unselected stable", "unselected during suite", "unselected after push", "unselected after push still open"]) {
    const {root, bare, base, state, submit, invoke} = setup(t);
    const approvedHead = submit(1);
    const draftHead = submit(2);
    assert.notEqual(approvedHead, draftHead);
    delete state.expectedFiles["file-2"];
    state.afterSuite = timing;
    const deployment = join(root, "deployment");
    writeFileSync(deployment, '#!/bin/sh\ncase "$1" in\nread) cat "$0.state";;\ndeploy) echo "$4" > "$0.state";;\nesac\n', {mode: 0o700});
    writeFileSync(deployment + ".state", base);
    const run = invoke({deployment});
    const stable = timing === "unselected stable";
    assert.equal(run.status, stable ? 0 : 1, timing + ": " + run.stderr + run.stdout);
    assert.deepEqual(run.receipt.selected, [1]);
    assert.deepEqual(run.receipt.integrated, stable ? [1] : []);
    assert.deepEqual(run.receipt.attempts.map((a: {sha: string}) => a.sha), [run.receipt.candidate]);
    assert.equal(run.receipt.attempts[0].result.result, "pass");
    if (stable) assert.deepEqual(run.receipt.incidents, []);
    else if (timing === "unselected after push") assert.match(run.receipt.incidents.join(), /unexpectedly merged: #2/i);
    else assert.match(run.receipt.incidents.join(), /includes an unselected PR #2/i);
    assert.equal(git(bare, "rev-parse", "refs/pull/2/head"), stable ? draftHead : approvedHead);
    assert.equal(revision(root), timing === "unselected during suite" ? base : run.receipt.candidate);
    assert.equal(readFileSync(deployment + ".state", "utf8").trim(), stable ? run.receipt.candidate : base);
  }

  // Reset the target to its original base during the post-push PR readback.
  // Recovery must retain the candidate and must not silently publish it again.
  const {root, bare, base, state, submit, invoke} = setup(t);
  submit(1);
  state.afterSuite = "target reset";
  const reset = invoke();
  assert.equal(reset.status, 1, reset.stderr + reset.stdout);
  assert.match(reset.receipt.incidents.join(), /Integration ref\/tree differs/);
  assert.deepEqual(reset.receipt.integrated, []);
  assert.equal(revision(root), base);
  state.afterSuite = "";
  const unresolved = invoke();
  assert.equal(unresolved.status, 1, unresolved.stderr + unresolved.stdout);
  assert.deepEqual(unresolved.receipt.attempts, []);
  assert.equal(revision(root), base);
  git(bare, "update-ref", "refs/heads/main", reset.receipt.candidate, base);
  const reconciled = invoke();
  assert.equal(reconciled.status, 0, reconciled.stderr + reconciled.stdout);
  assert.match(reconciled.receipt.recovery.join(), /Verified previous merge/);
  assert.deepEqual(reconciled.receipt.attempts, []);
  assert.equal(revision(root), reset.receipt.candidate);
});
