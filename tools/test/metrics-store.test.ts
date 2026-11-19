import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { mapIdentity, type MetricsEvent } from "../dist/metrics/events.js";
import { readJournal } from "../dist/metrics/journal.js";
import { readProfile } from "../dist/metrics/profile.js";

const command = fileURLToPath(new URL("../dist/metrics.js", import.meta.url));
const stamp = "2026-11-19T10:00:00Z";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "methodology-metrics-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const project = join(root, "project");
  const storage = join(root, "private");
  mkdirSync(project);
  mkdirSync(storage, { mode: 0o700 });
  const properties = {
    project_id: "pilot", project_root: project, journal: "events.jsonl",
    identity_key: "ab".repeat(32),
    issued_ids: ["task_a", "task_b", "started_a", "switched_b", "forked", "attempt_a", "session_a", "thread_a", "worktree_a"],
    sources: {
      tasks: { kind: "task", path: "tasks.jsonl" },
      audits: { kind: "audit", path: "audits.jsonl" },
      codex: { kind: "codex_hook" },
    },
    categories: { action_type: ["test"] },
  };
  const profile = join(storage, "profile.json");
  const writeProfile = () => writeFileSync(profile, JSON.stringify(properties), { mode: 0o600 });
  writeProfile();
  return { root, project, storage, properties, profile, writeProfile, journal: join(storage, "events.jsonl") };
}

function started(overrides: Partial<MetricsEvent> = {}): MetricsEvent {
  return {
    schema_version: 1, project_id: "pilot", source_id: "tasks", event_id: "started_a",
    task_id: "task_a", event_type: "task.started", actor_role: "operator", observed_at: stamp,
    occurred_at: stamp,
    data: { execution_started_at: stamp, worktree_id: "worktree_a", session_id: "session_a", thread_id: "thread_a" },
    ...overrides,
  };
}

function run(fixture: ReturnType<typeof fixture>, args: string[], input = "", env = process.env) {
  const child = spawnSync(process.execPath, [command, ...args], {
    cwd: fixture.project, input, encoding: "utf8", timeout: 6000, env,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

function rows(...values: unknown[]) {
  return values.map((value) => JSON.stringify(value)).join("\n") + "\n";
}

test("hydrates configured normalized task sources and preserves a task switch after worktree deletion", (t) => {
  const local = fixture(t);
  const worktree = join(local.project, "worktree");
  mkdirSync(worktree);
  writeFileSync(join(local.storage, "tasks.jsonl"), rows(started(), started({
    event_id: "switched_b", task_id: "task_b", event_type: "task.switched",
    data: { session_id: "session_a", thread_id: "thread_a", previous_task_id: "task_a" },
  })));
  assert.deepEqual(run(local, ["collect", local.profile, "tasks"]), {
    status: 0, stdout: "Recorded 2 events, 0 repeats, 0 gaps.\n", stderr: "",
  });
  rmSync(worktree, { recursive: true });
  const result = readJournal(readProfile(local.profile));
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].data.worktree_id, "worktree_a");
  assert.equal(result.events[1].task_id, "task_b");
  assert.equal(result.events[1].data.previous_task_id, "task_a");
  assert.equal(statSync(local.journal).mode & 0o777, 0o600);

  assert.deepEqual(run(local, ["collect", local.profile, "audits"]), {
    status: 1, stdout: "", stderr: "methodology-metrics: source_missing\n",
  });
  assert.deepEqual(readJournal(readProfile(local.profile)).gaps.map((gap) => [gap.source_id, gap.code]), [["audits", "source_missing"]]);
});

test("rejects a changed source snapshot before appending events", (t) => {
  const local = fixture(t);
  const input = rows(started());
  Object.assign(local.properties.sources.tasks, {
    content_sha256: createHash("sha256").update(input).digest("hex"),
  });
  local.writeProfile();
  const source = join(local.storage, "tasks.jsonl");
  writeFileSync(source, " " + input);
  assert.deepEqual(run(local, ["collect", local.profile, "tasks"]), {
    status: 1, stdout: "", stderr: "methodology-metrics: source_changed\n",
  });
  assert.deepEqual(readJournal(readProfile(local.profile)).events, []);
  writeFileSync(source, input);
  assert.equal(run(local, ["collect", local.profile, "tasks"]).status, 0);
  assert.equal(readJournal(readProfile(local.profile)).events.length, 1);
});

test("rejects arbitrary IDs, private payload fields, malformed rows and unapproved categories", (t) => {
  const local = fixture(t);
  const raw = "secret@example.test OTP=529372 https://example.test/invite";
  const profile = readProfile(local.profile);
  const issued = mapIdentity(profile, "operation.test", raw);
  const forged = `${issued.slice(0, -1)}${issued.endsWith("0") ? "1" : "0"}`;
  const testEvent = started({
    event_id: issued, event_type: "activity.started", data: { operation_id: issued, action_type: "test" },
  });
  const result = run(local, ["record", local.profile], rows(
    testEvent,
    { ...testEvent, event_id: raw },
    { ...testEvent, event_id: forged },
    { ...testEvent, source_id: raw },
    { ...testEvent, task_id: raw },
    { ...testEvent, command: raw },
    { ...testEvent, data: { operation_id: raw } },
    { ...testEvent, data: { action_type: raw } },
    { ...testEvent, data: { prompt: raw } },
    { ...testEvent, data: { operation_id: "arbitrary" } },
    { ...testEvent, occurred_at: "2026-02-30T10:00:00Z" },
    { ...testEvent, event_type: raw },
  ) + raw + "\n");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "Recorded 1 events, 0 repeats, 12 gaps.\n");
  assert.equal(result.stderr, "methodology-metrics: coverage_gap\n");
  const output = readFileSync(local.journal, "utf8") + readFileSync(`${local.journal}.coverage.jsonl`, "utf8")
    + result.stdout + result.stderr;
  assert.ok(!output.includes(raw) && !output.includes("secret@example.test") && !output.includes(local.root));
  assert.ok(output.includes(issued));
});

test("quarantines conflicting replays and preserves the original receipt time for exact retries", (t) => {
  const local = fixture(t);
  const initial = run(local, ["record", local.profile], rows(started()));
  assert.equal(initial.status, 0);
  const repeat = run(local, ["record", local.profile], rows(started({ observed_at: "2026-11-19T10:01:00Z" })));
  assert.equal(repeat.stdout, "Recorded 0 events, 1 repeats, 0 gaps.\n");
  assert.equal(readJournal(readProfile(local.profile)).events[0].observed_at, stamp);
  const before = readFileSync(local.journal, "utf8");
  const conflict = run(local, ["record", local.profile], rows(started({ occurred_at: "2026-11-19T10:02:00Z" })));
  assert.equal(conflict.status, 1);
  const written = readFileSync(local.journal, "utf8");
  assert.ok(written.startsWith(before));
  assert.equal(written.trimEnd().split("\n").length, 2);
  assert.deepEqual(readJournal(readProfile(local.profile)).events, []);
  assert.equal(readJournal(readProfile(local.profile)).gaps[0].code, "conflicting_event");
});

test("serializes concurrent delivery of one occurrence", async (t) => {
  const local = fixture(t);
  const writes = Array.from({ length: 8 }, () => new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [command, "record", local.profile], {
      cwd: local.project, stdio: ["pipe", "ignore", "ignore"], timeout: 7000,
    });
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", resolve);
    child.stdin.end(rows(started()));
  }));
  assert.deepEqual(await Promise.all(writes), Array(8).fill(0));
  const lines = readFileSync(local.journal, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).event_id, "started_a");
});

test("continues after an incomplete append and makes the missing coverage visible", (t) => {
  const local = fixture(t);
  assert.equal(run(local, ["record", local.profile], rows(started())).status, 0);
  appendFileSync(local.journal, '{"schema_version":1,"task_id":');
  assert.equal(run(local, ["record", local.profile], rows(started({
    event_id: "switched_b", task_id: "task_b", event_type: "task.switched", data: { previous_task_id: "task_a" },
  }))).status, 0);
  const result = readJournal(readProfile(local.profile));
  assert.deepEqual(result.events.map((event) => event.event_id), ["started_a", "switched_b"]);
  assert.ok(result.gaps.some((gap) => gap.code === "journal_invalid"));
});

test("keeps a passive hook running and keeps a project journal outside the worktree", (t) => {
  const local = fixture(t);
  const unknown = "bad-source-private@email.test";
  assert.deepEqual(run(local, ["hook", local.profile, unknown], "bad"), {
    status: 0, stdout: "", stderr: "methodology-metrics: source_unconfigured\n",
  });
  assert.deepEqual(run(local, ["hook", local.profile, "codex"], "{"), {
    status: 0, stdout: "", stderr: "methodology-metrics: coverage_gap\n",
  });
  local.properties.journal = join(local.project, "metrics.jsonl");
  local.writeProfile();
  assert.deepEqual(run(local, ["record", local.profile], rows(started())), {
    status: 2, stdout: "", stderr: "methodology-metrics: invalid_profile\n",
  });
  assert.equal(existsSync(local.properties.journal), false);
});

test("reports unavailable flock without suppressing a passive hook", (t) => {
  const local = fixture(t);
  assert.equal(run(local, ["record", local.profile], rows(started())).status, 0);
  const first = readFileSync(local.journal, "utf8");
  const env = { ...process.env, PATH: local.project };
  assert.deepEqual(run(local, ["record", local.profile], rows(started()), env), {
    status: 2, stdout: "", stderr: "methodology-metrics: journal_lock_unavailable\n",
  });
  assert.deepEqual(run(local, ["hook", local.profile, "codex"], "{", env), {
    status: 0, stdout: "", stderr: "methodology-metrics: journal_lock_unavailable\n",
  });
  assert.equal(readFileSync(local.journal, "utf8"), first);
});

function summary(local: ReturnType<typeof fixture>, task: string, asOf = "2030-01-01T00:00:00Z") {
  const result = run(local, ["summary", local.profile, task, "--as-of", asOf]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("reports one GitHub job after importing identical REST and webhook projections", (t) => {
  const local = fixture(t);
  Object.assign(local.properties.sources, {
    rest: { kind: "github_jobs", path: "jobs.jsonl", task_id: "task_a" },
    webhook: { kind: "github_webhook", path: "webhook.jsonl", task_id: "task_a" },
  });
  Object.assign(local.properties.categories, { outcome: ["success"] });
  local.writeProfile();
  assert.equal(run(local, ["record", local.profile], rows(started())).status, 0);
  const job = {
    id: 4, run_id: 1, run_attempt: 1, head_sha: "a".repeat(40), status: "completed",
    conclusion: "success", started_at: "2026-11-19T10:10:00Z", completed_at: "2026-11-19T10:20:00Z",
    steps: [],
  };
  const repository = { id: 5 };
  writeFileSync(join(local.storage, "jobs.jsonl"), rows({ jobs: [job], repository }));
  writeFileSync(join(local.storage, "webhook.jsonl"), rows({ workflow_job: job, repository, action: "completed" }));
  assert.equal(run(local, ["collect", local.profile, "rest"]).status, 0);
  const before = summary(local, "task_a").ci.job_rows;
  assert.equal(before.length, 1);
  assert.equal(before[0].outcome, "success");
  assert.deepEqual(run(local, ["collect", local.profile, "webhook"]), {
    status: 0, stdout: "Recorded 0 events, 2 repeats, 0 gaps.\n", stderr: "",
  });
  const after = summary(local, "task_a");
  assert.deepEqual(after.ci.job_rows, before);
  assert.deepEqual(after.coverage.gaps, []);
});

test("scopes verified source windows and collection gaps to their configured task", (t) => {
  const local = fixture(t);
  const through = "2026-11-19T11:00:00Z";
  Object.assign(local.properties.sources, {
    compact_a: { kind: "claude_monitoring", path: "compactions.jsonl", task_id: "task_a" },
  });
  Object.assign(local.properties, {
    coverage: [{ source_id: "compact_a", event_types: ["context.compacted"], from: stamp, through, status: "complete" }],
  });
  local.properties.issued_ids.push("started_b", "accepted_a", "accepted_b");
  local.writeProfile();
  assert.equal(run(local, ["record", local.profile], rows(
    started({ data: {} }),
    started({ event_id: "started_b", task_id: "task_b", data: {} }),
    started({ event_id: "accepted_a", event_type: "task.accepted", occurred_at: through, data: {} }),
    started({ event_id: "accepted_b", event_type: "task.accepted", task_id: "task_b", occurred_at: through, data: {} }),
  )).status, 0);

  assert.deepEqual(summary(local, "task_a").compactions.count, { status: "complete", value: 0 });
  assert.deepEqual(summary(local, "task_b").compactions.count, { status: "unavailable", value: null });
  assert.equal(run(local, ["collect", local.profile, "compact_a"]).status, 1);
  assert.deepEqual(summary(local, "task_a").coverage.gaps, [{ source_id: "compact_a", code: "source_missing" }]);
  assert.deepEqual(summary(local, "task_b").coverage.gaps, []);
  assert.equal(run(local, ["collect", local.profile, "audits"]).status, 1);
  assert.deepEqual(summary(local, "task_b").coverage.gaps, [{ source_id: "audits", code: "source_missing" }]);
});

test("reconciles compatible partial facts and honors the summary receipt cutoff", (t) => {
  const local = fixture(t);
  const early = "2026-11-19T10:05:00Z";
  const later = "2026-11-19T10:10:00Z";
  Object.assign(local.properties.sources, { observed: { kind: "normalized" } });
  local.writeProfile();
  assert.equal(run(local, ["record", local.profile], rows(started({ occurred_at: null, data: {} }))).status, 0);
  assert.equal(run(local, ["record", local.profile], rows(started({ source_id: "observed", observed_at: later }))).status, 0);
  assert.equal(summary(local, "task_a", early).lead_time.endpoint_estimated, true);
  assert.equal(summary(local, "task_a", later).lead_time.endpoint_estimated, false);
  const events = readJournal(readProfile(local.profile)).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].data.worktree_id, "worktree_a");
  assert.equal(events[0].observed_at, stamp);
});

for (const delivery of ["split", "batched", "reversed"] as const) {
  test(`reconstructs the first conflicting receipt after ${delivery} delivery`, (t) => {
    const local = fixture(t);
    const initial = started({ data: {} });
    const enrich = started({ observed_at: "2026-11-19T10:05:00Z", data: { worktree_id: "worktree_a" } });
    const conflict = started({
      occurred_at: "2026-11-19T10:12:00Z", observed_at: "2026-11-19T10:15:00Z", data: {},
    });
    const record = (...events: MetricsEvent[]) => run(local, ["record", local.profile], rows(...events));
    if (delivery === "split") {
      assert.equal(record(initial, enrich).status, 0);
      assert.equal(record(conflict).status, 1);
    } else {
      const events = delivery === "batched" ? [initial, enrich, conflict] : [conflict, enrich, initial];
      assert.equal(record(...events).status, 1);
    }

    const early = summary(local, "task_a", "2026-11-19T10:07:00Z");
    assert.equal(early.lead_time.start_at, "2026-11-19T10:00:00.000Z");
    assert.deepEqual(early.coverage.gaps, []);
    const late = summary(local, "task_a", "2026-11-19T10:20:00Z");
    assert.equal(late.lead_time.start_at, null);
    assert.deepEqual(late.coverage.gaps, [{ source_id: "tasks", code: "conflicting_event" }]);
  });
}

test("retains an earlier observed receipt delivered after an exact later replay", (t) => {
  const local = fixture(t);
  const at = "2026-11-19T10:15:00Z";
  const record = (event: MetricsEvent) => run(local, ["record", local.profile], rows(event));
  assert.equal(record(started({ observed_at: at })).status, 0);
  assert.equal(record(started()).status, 0);
  assert.equal(summary(local, "task_a", "2026-11-19T10:07:00Z").lead_time.start_at, "2026-11-19T10:00:00.000Z");
});
