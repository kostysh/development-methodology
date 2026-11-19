import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const from = "2026-11-18T20:00:00Z";
const at = "2026-11-18T21:00:00Z";
const through = "2026-11-18T22:00:00Z";
const after = "2026-11-18T23:00:00Z";
const bin = process.env.METHODOLOGY_METRICS_BIN;
const builtBin = fileURLToPath(new URL("../dist/metrics.js", import.meta.url));

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonObject;
}

function attemptById(report: JsonObject) {
  const attempts: unknown = report.attempts;
  assert.ok(Array.isArray(attempts));
  const rows = attempts.map(object);
  const byId = new Map(rows.map(row => [row.event_id, row]));
  assert.equal(byId.size, rows.length, "Each recorded attempt has one report row.");
  return byId;
}

function fixture(t: TestContext, complete = false) {
  const root = mkdtempSync(join(tmpdir(), "methodology-train-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  mkdirSync(project);
  const profile = join(root, "profile.json");
  const journal = "events.jsonl";
  writeFileSync(profile, JSON.stringify({
    project_id: "fixture",
    project_root: project,
    journal,
    identity_key: "ab".repeat(32),
    issued_ids: ["pilot_1", "pilot_2", "ordinary", "start_1",
      "ordinary_start", "train_1", "train_2", "skip_1", "future_1",
      "other_pilot_1", "invalid_1", "invalid_2", "invalid_3", "invalid_4", "invalid_5"],
    sources: {
      train: { kind: "normalized", task_id: "pilot_1" },
      another: { kind: "normalized", task_id: "pilot_2" },
      manual: { kind: "normalized" },
    },
    ...(complete && {
      coverage: [{ source_id: "train", event_types: ["train.observed"], from, through, status: "complete" }],
    }),
  }), { mode: 0o600 });

  function invoke(args: string[], input = "") {
    const child = spawnSync(bin ?? process.execPath, bin ? args : [builtBin, ...args], {
      cwd: project, encoding: "utf8", input, timeout: 5000,
    });
    assert.ifError(child.error);
    assert.equal(child.signal, null);
    return { status: child.status, stdout: child.stdout, stderr: child.stderr };
  }
  return {
    record: (...events: JsonObject[]) =>
      invoke(["record", profile], events.map(event => JSON.stringify(event)).join("\n") + "\n"),
    summary: (task = "pilot_1") => {
      const result = invoke(["summary", profile, task, "--as-of", through]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      return object(JSON.parse(result.stdout) as unknown);
    },
    stored: () => readFileSync(join(root, journal), "utf8"),
    gaps: () => readFileSync(join(root, journal + ".coverage.jsonl"), "utf8"),
  };
}

function event(eventId: string, data: JsonObject, fields: JsonObject = {}): JsonObject {
  return {
    schema_version: 1,
    project_id: "fixture",
    event_id: eventId,
    source_id: "train",
    event_type: "train.observed",
    occurred_at: at,
    observed_at: at,
    actor_role: "operator",
    task_id: "pilot_1",
    data,
    ...fields,
  };
}

function start() {
  return event("start_1", {}, { event_type: "task.started", occurred_at: from, observed_at: from });
}

const detailedDryTrain = {
  train_mode: "dry",
  train_result: "completed",
  duration_ms: 840_000,
  queue_entries: 3,
  queue_wait_ms: 540_000,
  excluded_conflict: 1,
  excluded_test: 0,
  excluded_interaction: 1,
  excluded_dependency: 1,
  excluded_other: 0,
  excluded_unknown: 0,
  full_suite_runs: 2,
  flaky_tests: 1,
};

test("summarizes each train attempt once and retains mode, measured values and missing fields", (t) => {
  const cli = fixture(t);
  const dry = event("train_1", detailedDryTrain);
  const interrupted = event("train_2", {
    train_mode: "enabled", train_result: "interrupted", full_suite_runs: 0, duration_ms: null,
  });
  const skip = event("skip_1", { train_mode: "dry", train_result: "skipped" });
  const future = event("future_1", detailedDryTrain, { occurred_at: after, observed_at: after });
  const another = event("other_pilot_1", detailedDryTrain, { task_id: "pilot_2", source_id: "another" });

  assert.deepEqual(cli.record(start()), {
    status: 0, stderr: "", stdout: "Recorded 1 events, 0 repeats, 0 gaps.\n",
  });
  assert.deepEqual(cli.record(dry, interrupted, skip, future, another), {
    status: 0, stderr: "", stdout: "Recorded 5 events, 0 repeats, 0 gaps.\n",
  });
  assert.deepEqual(cli.record({ ...dry, observed_at: through }), {
    status: 0, stderr: "", stdout: "Recorded 0 events, 1 repeats, 0 gaps.\n",
  });

  const train = object(cli.summary().train);
  const attempts = attemptById(train);
  assert.deepEqual(new Set(attempts.keys()), new Set(["train_1", "train_2", "skip_1"]));
  const first = attempts.get("train_1");
  assert.ok(first);
  for (const [key, value] of Object.entries(detailedDryTrain)) {
    assert.equal(first[key], value, key);
  }
  const second = attempts.get("train_2");
  assert.ok(second);
  assert.equal(second.train_mode, "enabled");
  assert.equal(second.train_result, "interrupted");
  assert.equal(second.full_suite_runs, 0);
  for (const key of ["duration_ms", "queue_entries", "queue_wait_ms", "excluded_conflict", "flaky_tests"]) {
    assert.equal(second[key] ?? null, null, key);
  }
  const third = attempts.get("skip_1");
  assert.ok(third);
  assert.equal(third.train_mode, "dry");
  assert.equal(third.train_result, "skipped");
  assert.equal(third.full_suite_runs ?? null, null);
  assert.deepEqual(train.skipped_starts, { status: "partial", value: 1, lower_bound: true });
});

test("reports zero only for a covered pilot interval and leaves ordinary tasks unchanged", (t) => {
  const ordinary = event("ordinary_start", {}, {
    event_type: "task.started", source_id: "manual", task_id: "ordinary", occurred_at: from, observed_at: from,
  });
  const uncovered = fixture(t);
  assert.equal(uncovered.record(start(), ordinary).status, 0);
  assert.equal(uncovered.summary().train, undefined);
  assert.equal(uncovered.summary("ordinary").train, undefined);

  const covered = fixture(t, true);
  const result = covered.record(start(), ordinary);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(covered.summary().train, {
    attempts: [],
    skipped_starts: { status: "complete", value: 0 },
  });
  assert.equal(covered.summary("ordinary").train, undefined);
});

test("rejects unapproved data and source attribution without exposing private input", (t) => {
  const cli = fixture(t);
  const privateMarker = "https://internal.invalid/customer@example.invalid";
  const result = cli.record(
    start(),
    event("train_1", detailedDryTrain),
    event("invalid_1", { ...detailedDryTrain, note: privateMarker }),
    event("invalid_2", detailedDryTrain, { task_id: "pilot_2" }),
    event("invalid_3", detailedDryTrain, { source_id: "manual" }),
    event("invalid_4", { ...detailedDryTrain, full_suite_runs: -1 }),
    event("invalid_5", { train_mode: "dry", train_result: "skipped", duration_ms: 0 }),
    event(privateMarker, detailedDryTrain),
  );
  assert.deepEqual(result, {
    status: 1, stderr: "methodology-metrics: coverage_gap\n",
    stdout: "Recorded 2 events, 0 repeats, 6 gaps.\n",
  });
  const stored = cli.stored();
  const gapOutput = cli.gaps();
  const summary = cli.summary();
  for (const output of [stored, gapOutput, JSON.stringify(summary)]) {
    assert.ok(!output.includes(privateMarker));
  }
  assert.doesNotMatch(stored, /invalid_[1-5]/u);
  assert.deepEqual([...attemptById(object(summary.train)).keys()], ["train_1"]);
});

test("removes a conflicting repeat from train counts and reports incomplete coverage", (t) => {
  const cli = fixture(t, true);
  const skip = event("skip_1", { train_mode: "dry", train_result: "skipped" });
  const first = cli.record(start(), skip);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(object(cli.summary().train).skipped_starts, { status: "complete", value: 1 });

  const conflict = cli.record({
    ...skip, observed_at: through, data: { train_mode: "enabled", train_result: "skipped" },
  });
  assert.equal(conflict.status, 1);
  assert.equal(conflict.stderr, "methodology-metrics: coverage_gap\n");
  const train = object(cli.summary().train);
  assert.deepEqual(train.attempts, []);
  assert.deepEqual(train.skipped_starts, { status: "partial", value: null });
});
