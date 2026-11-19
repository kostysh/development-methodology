import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../dist/metrics.js", import.meta.url));
const at = (time: string) => `2026-11-18T${time}Z`;
const start = at("10:00:00");
const accept = at("12:00:00");
const later = at("15:00:00");
const cutoff = "9999-12-31T23:59:59Z";
const completeZero = { attempts: [], skipped_starts: { status: "complete", value: 0 } };
const partialUnknown = { attempts: [], skipped_starts: { status: "partial", value: null } };

function fixture(t: TestContext, from = start, through = accept) {
  const root = mkdtempSync(join(tmpdir(), "methodology-train-scope-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  mkdirSync(project);
  const profile = join(root, "profile.json");
  writeFileSync(profile, JSON.stringify({
    project_id: "fixture", project_root: project, journal: "events.jsonl", identity_key: "ab".repeat(32),
    issued_ids: ["pilot", "other", "start", "accept", "skip", "end_skip", "other_start"],
    sources: {
      train: { kind: "normalized", task_id: "pilot" },
      second: { kind: "normalized", task_id: "pilot" },
      other: { kind: "normalized", task_id: "other" },
    },
    coverage: [{ source_id: "train", event_types: ["train.observed"], from, through, status: "complete" }],
  }), { mode: 0o600 });

  function run(args: string[], input?: string) {
    const result = spawnSync(process.execPath, [bin, ...args], { cwd: project, input, encoding: "utf8", timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  }
  return {
    record(...events: Record<string, unknown>[]) {
      return run(["record", profile], events.map(event => JSON.stringify(event)).join("\n") + "\n");
    },
    summary(asOf = later) {
      const result = run(["summary", profile, "pilot", "--as-of", asOf]);
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    },
  };
}

function event(event_id: string, event_type: string, occurred_at: string | null, overrides = {}) {
  return {
    schema_version: 1, project_id: "fixture", event_id, event_type, occurred_at,
    observed_at: occurred_at ?? accept, source_id: "train", actor_role: "operator", task_id: "pilot",
    data: {}, ...overrides,
  };
}

function skip(when: string, overrides = {}) {
  return event("skip", "train.observed", when, {
    data: { train_mode: "dry", train_result: "skipped" }, ...overrides,
  });
}

test("coverage outside an accepted task window does not add a train section", (t) => {
  const cli = fixture(t, at("13:00:00"), at("14:00:00"));
  assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", accept)).status, 0);
  assert.equal(cli.summary().train, undefined);
});

test("only disputed occurrences in the pilot window reduce train coverage", (t) => {
  for (const occurrence of [at("13:00:00"), at("11:00:00")]) {
    const cli = fixture(t);
    const first = skip(occurrence);
    assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", accept), first).status, 0);
    assert.equal(cli.record({ ...first, observed_at: at("14:00:00"),
      data: { train_mode: "enabled", train_result: "skipped" },
    }).status, 1);
    const within = occurrence < accept;
    assert.deepEqual(cli.summary().train, within ? partialUnknown : completeZero);
    assert.deepEqual(cli.summary(accept).train.skipped_starts, { status: "complete", value: Number(within) });
  }
});

test("a disputed in-window attempt from a second pilot source prevents a verified zero", (t) => {
  const cli = fixture(t);
  const first = skip(at("11:00:00"), { source_id: "second" });
  assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", accept), first).status, 0);
  assert.equal(cli.record({ ...first, data: { train_mode: "enabled", train_result: "skipped" } }).status, 1);
  assert.deepEqual(cli.summary().train, partialUnknown);
});

test("a rejected normalized row from a different configured task source leaves pilot coverage complete", (t) => {
  const cli = fixture(t);
  assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", accept)).status, 0);
  const invalid = event("other_start", "task.started", start, {
    source_id: "other", task_id: "other", data: { issue_id: "unapproved" },
  });
  const result = cli.record(invalid);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "methodology-metrics: coverage_gap\n");
  const report = cli.summary(cutoff);
  assert.deepEqual(report.train, completeZero);
  assert.deepEqual(report.coverage.gaps, []);
});

test("train windows, source coverage and cutoff retain fractional-second precision", (t) => {
  const preciseStart = at("10:00:00.000000500");
  const preciseEnd = at("10:00:00.000000900");
  const cli = fixture(t, preciseStart, preciseEnd);
  assert.equal(cli.record(
    event("start", "task.started", preciseStart), event("accept", "task.accepted", preciseEnd),
    skip(at("10:00:00.000000200")),
    skip(at("10:00:00.000000950"), { event_id: "end_skip", observed_at: preciseEnd }),
  ).status, 0);
  assert.deepEqual(cli.summary(preciseEnd).train, completeZero);
  assert.deepEqual(cli.summary().train, completeZero);
});

test("an estimated acceptance time cannot establish a complete count", (t) => {
  const cli = fixture(t);
  assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", null)).status, 0);
  assert.deepEqual(cli.summary().train, partialUnknown);
});

test("a disputed acceptance cannot extend the train window through the report cutoff", (t) => {
  const cli = fixture(t, start, later);
  assert.equal(cli.record(
    event("start", "task.started", start), event("accept", "task.accepted", accept),
    skip(at("14:00:00")),
  ).status, 0);
  assert.equal(cli.record(event("accept", "task.accepted", at("13:00:00"))).status, 1);
  assert.deepEqual(cli.summary().train, partialUnknown);
});

test("a rejected train receipt from a second pilot source prevents a verified zero", (t) => {
  const cli = fixture(t);
  assert.equal(cli.record(event("start", "task.started", start), event("accept", "task.accepted", accept)).status, 0);
  assert.deepEqual(cli.summary(cutoff).train, completeZero);
  const invalid = skip(at("11:00:00"), { source_id: "second", data: { note: "unapproved" } });
  assert.equal(cli.record(invalid).status, 1);
  const report = cli.summary(cutoff);
  assert.deepEqual(report.train, partialUnknown);
  assert.deepEqual(report.coverage.gaps, [{ source_id: "second", code: "invalid_event" }]);
});
