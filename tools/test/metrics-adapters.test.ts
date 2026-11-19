import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { adaptRecord, indexCodexRollout } from "../dist/metrics/adapters.js";
import { mapIdentity, normalizeEvent } from "../dist/metrics/events.js";

const observedAt = "2026-02-19T11:30:00.000Z";
const occurredAt = "2026-02-19T11:29:59.123Z";
const privateValue = "synthetic-private-value from /restricted/file.txt";

function alias(namespace: string, value: string): string {
  return createHmac("sha256", "fixture-key")
    .update(JSON.stringify([namespace, value]))
    .digest("hex");
}

const context = {
  projectId: alias("project", "test-project"),
  sourceId: alias("source", "local-export"),
  observedAt,
  alias,
  category: (field: string, value: unknown) => field === "model" && value === "claude-sonnet-5" ? value : null,
};

const codexRecord = {
  type: "token_usage_record",
  timestamp: occurredAt,
  payload: {
    thread_id: "019c7d47-883c-7c56-81fc-0ffffffffff1",
    session_id: "019c7d47-883c-7c56-81fc-0ffffffffff2",
    turn_id: "019c7d47-883c-7c56-81fc-0ffffffffff3",
    root_turn_id: "019c7d47-883c-7c56-81fc-0ffffffffff4",
    response_id: "resp_fixture_01",
    usage: {
      input_tokens: 200,
      cached_input_tokens: 120,
      cache_write_input_tokens: 0,
      output_tokens: 30,
      reasoning_output_tokens: 10,
      total_tokens: 230,
    },
    turn_token_usage: { input_tokens: 600, output_tokens: 50 },
    thread_token_usage: { input_tokens: 900, output_tokens: 90 },
    unsafe_payload: privateValue,
  },
};

test("Codex rollout emits one usage delta and discards cumulative snapshots and unobserved metadata", () => {
  const [event] = adaptRecord("codex_rollout", codexRecord, context);
  assert.equal(event.occurred_at, occurredAt);
  assert.equal(event.observed_at, observedAt);
  assert.equal(event.task_id, null);
  assert.equal(event.event_type, "model.usage");
  assert.deepEqual(event.data, {
    provider_id: alias("provider", "codex"),
    session_id: alias("codex.session", codexRecord.payload.session_id),
    thread_id: alias("codex.thread", codexRecord.payload.thread_id),
    turn_id: alias("codex.turn", codexRecord.payload.turn_id),
    root_turn_id: alias("codex.turn", codexRecord.payload.root_turn_id),
    parent_thread_id: null,
    response_id: alias("codex.response", codexRecord.payload.response_id),
    model: null,
    input_tokens: 200,
    cached_input_tokens: 120,
    cache_write_input_tokens: 0,
    output_tokens: 30,
    reasoning_output_tokens: 10,
  });
  assert.doesNotMatch(JSON.stringify(event), /resp_fixture|synthetic-private-value|019c7d47/);

  const cumulative = { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: codexRecord.payload.usage } } };
  assert.deepEqual(adaptRecord("codex_rollout", cumulative, context), []);
  assert.deepEqual(adaptRecord("codex_rollout", { type: "compacted", payload: { message: privateValue } }, context), []);
});

test("Codex response identity survives replay and timestamp order without collapsing another response in the turn", () => {
  const taskId = alias("task", "fixture-work");
  const [first] = adaptRecord("codex_rollout", codexRecord, { ...context, taskId });
  const [later] = adaptRecord("codex_rollout", {
    ...codexRecord,
    timestamp: "2026-02-19T11:29:58.123Z",
    payload: { ...codexRecord.payload, response_id: "resp_fixture_02" },
  }, context);
  const [replay] = adaptRecord("codex_rollout", codexRecord, {
    ...context,
    sourceId: alias("source", "same-entry-replayed"),
    observedAt: "2026-02-19T12:00:00.000Z",
  });
  assert.equal(first.task_id, taskId);
  assert.equal(first.event_id, replay.event_id);
  assert.equal(first.data.turn_id, later.data.turn_id);
  assert.notEqual(first.event_id, later.event_id);
  assert.ok(Date.parse(later.occurred_at) < Date.parse(first.occurred_at));
});

test("Codex joins configured model and parent through exact rollout identities", () => {
  const parent = "019c7d47-883c-7c56-81fc-0ffffffffff7";
  const turn = {
    type: "turn_context", payload: { turn_id: codexRecord.payload.turn_id, model: "gpt-6.2-sol" },
  };
  const meta = {
    type: "session_meta", payload: { id: codexRecord.payload.thread_id, parent_thread_id: parent, cwd: privateValue },
  };
  const modelContext = {
    ...context,
    category: (field: string, value: unknown) => field === "model" && value === "gpt-6.2-sol" ? value : null,
  };
  const [event] = adaptRecord("codex_rollout", codexRecord, {
    ...modelContext, codexRollout: indexCodexRollout([codexRecord, turn, meta]),
  });
  assert.equal(event.data.model, "gpt-6.2-sol");
  assert.equal(event.data.parent_thread_id, alias("codex.thread", parent));
  assert.doesNotMatch(JSON.stringify(event), /synthetic-private-value/);

  const [conflict] = adaptRecord("codex_rollout", codexRecord, {
    ...modelContext,
    codexRollout: indexCodexRollout([turn, { ...turn, payload: { ...turn.payload, model: "gpt-6.2-astra" } }, turn]),
  });
  assert.equal(conflict.data.model, null);
  assert.equal(conflict.data.parent_thread_id, null);

  const [unrelated] = adaptRecord("codex_rollout", codexRecord, {
    ...modelContext,
    codexRollout: indexCodexRollout([{
      ...turn, payload: { ...turn.payload, turn_id: codexRecord.payload.root_turn_id },
    }]),
  });
  assert.equal(unrelated.data.model, null);
});

test("partial Codex counts and invalid occurrence times stay unknown, and missing IDs report safe gaps", () => {
  const gaps: string[] = [];
  const observed = { ...context, reportGap: (gap: string) => gaps.push(gap) };
  const [partial] = adaptRecord("codex_rollout", {
    ...codexRecord,
    timestamp: "2026-02-30T00:00:00Z",
    payload: {
      ...codexRecord.payload,
      session_id: privateValue,
      usage: { input_tokens: -10, output_tokens: 0, cached_input_tokens: Number.MAX_SAFE_INTEGER + 1 },
    },
  }, observed);
  assert.equal(partial.occurred_at, null);
  assert.equal(partial.data.session_id, null);
  assert.equal(partial.data.input_tokens, null);
  assert.equal(partial.data.cached_input_tokens, null);
  assert.equal(partial.data.output_tokens, 0);
  assert.deepEqual(adaptRecord("codex_rollout", {
    ...codexRecord,
    payload: { ...codexRecord.payload, response_id: privateValue },
  }, observed), []);
  assert.deepEqual(adaptRecord("codex_rollout", {
    ...codexRecord, payload: { response_id: "resp_fixture_01", usage: { raw: privateValue } },
  }, observed), []);
  assert.deepEqual(gaps, ["usage_counts_partial", "usage_response_identity_missing", "usage_counts_partial"]);
});

const claudePostCompact = {
  hook_event_name: "PostCompact",
  session_id: "8cace447-1546-48c7-9e26-502aede0eaf2",
  transcript_path: "/restricted/transcript.jsonl",
  cwd: "/restricted/task",
  trigger: "auto",
  compact_summary: privateValue,
};

test("Claude Code counts PostCompact with a verified occurrence and ignores SessionStart for counting", () => {
  const gaps: string[] = [];
  const observed = { ...context, reportGap: (gap: string) => gaps.push(gap) };
  assert.deepEqual(adaptRecord("claude_hook", claudePostCompact, observed), []);
  assert.deepEqual(gaps, ["compaction_occurrence_identity_missing"]);

  const receipt = { ...observed, occurrenceId: "capture-1", occurredAt };
  const [first] = adaptRecord("claude_hook", claudePostCompact, receipt);
  const [replay] = adaptRecord("claude_hook", claudePostCompact, { ...receipt, sourceId: alias("source", "replayed-capture") });
  const [next] = adaptRecord("claude_hook", claudePostCompact, { ...observed, occurrenceId: "capture-2" });
  assert.equal(first.occurred_at, occurredAt);
  assert.equal(next.occurred_at, null);
  assert.equal(first.event_type, "context.compacted");
  assert.equal(first.event_id, replay.event_id);
  assert.notEqual(first.event_id, next.event_id);
  assert.notEqual(first.data.compaction_id, next.data.compaction_id);
  assert.equal(first.data.turn_id, null);
  assert.equal(first.data.trigger, "auto");
  assert.doesNotMatch(JSON.stringify(first), /restricted|summary|8cace447/);
  assert.deepEqual(adaptRecord("claude_hook", {
    hook_event_name: "SessionStart", source: "compact", session_id: claudePostCompact.session_id,
  }, receipt), []);
});

test("Codex PostCompact retains the reported turn and uses distinct occurrence receipts within it", () => {
  const hook = {
    hook_event_name: "PostCompact",
    session_id: codexRecord.payload.thread_id,
    turn_id: codexRecord.payload.turn_id,
    trigger: "manual",
  };
  const [first] = adaptRecord("codex_hook", hook, { ...context, occurrenceId: "first" });
  const [second] = adaptRecord("codex_hook", hook, { ...context, occurrenceId: "second" });
  assert.equal(first.data.thread_id, alias("codex.thread", hook.session_id));
  assert.equal(first.data.turn_id, alias("codex.turn", hook.turn_id));
  assert.equal(first.data.session_id, null);
  assert.equal(first.data.trigger, "manual");
  assert.notEqual(first.event_id, second.event_id);
});

test("Codex app-server completion uses a native item identity and time", () => {
  const notification = {
    jsonrpc: "2.0",
    method: "item/completed",
    params: {
      threadId: codexRecord.payload.thread_id,
      turnId: codexRecord.payload.turn_id,
      completedAtMs: Date.parse(occurredAt),
      item: { id: "compact_fixture_02", type: "contextCompaction", raw: privateValue },
    },
  };
  const [second] = adaptRecord("codex_app_server", notification, context);
  const [first] = adaptRecord("codex_app_server", {
    ...notification,
    params: {
      ...notification.params,
      completedAtMs: Date.parse(occurredAt) - 1,
      item: { id: "compact_fixture_01", type: "contextCompaction" },
    },
  }, context);
  const [replay] = adaptRecord("codex_app_server", notification, { ...context, sourceId: alias("source", "local-replay") });
  assert.equal(second.occurred_at, occurredAt);
  assert.equal(second.data.turn_id, first.data.turn_id);
  assert.notEqual(second.event_id, first.event_id);
  assert.equal(second.event_id, replay.event_id);
  assert.equal(second.data.trigger, null);
  assert.doesNotMatch(JSON.stringify(second), /compact_fixture|synthetic-private-value/);
  assert.deepEqual(adaptRecord("codex_app_server", { ...notification, method: "item/started" }, context), []);
  assert.deepEqual(adaptRecord("codex_app_server", { ...notification, method: "thread/compacted" }, context), []);
});

test("Codex guardian matches start and finish by review ID even when a target item is absent", () => {
  const params = {
    threadId: codexRecord.payload.thread_id,
    turnId: codexRecord.payload.turn_id,
    reviewId: "approval_fixture_01",
    targetItemId: null,
    startedAtMs: Date.parse(occurredAt) - 1000,
    action: { command: privateValue },
  };
  const approvedOutcome = { ...context, category: (field: string, value: unknown) => field === "outcome" && value === "denied" ? value : null };
  const [finished] = adaptRecord("codex_app_server", { method: "item/autoApprovalReview/completed", params: {
    ...params, completedAtMs: Date.parse(occurredAt), review: { status: "denied", reason: privateValue },
  } }, approvedOutcome);
  const [started] = adaptRecord("codex_app_server", { method: "item/autoApprovalReview/started", params: {
    ...params, review: { status: "inProgress" },
  } }, context);
  assert.equal(finished.event_type, "permission.review_finished");
  assert.equal(started.event_type, "permission.review_started");
  assert.equal(finished.occurred_at, occurredAt);
  assert.equal(Date.parse(finished.occurred_at) - Date.parse(started.occurred_at), 1000);
  assert.equal(finished.data.review_id, started.data.review_id);
  assert.notEqual(finished.event_id, started.event_id);
  assert.equal(finished.data.outcome, "denied");
  assert.doesNotMatch(JSON.stringify([finished, started]), /approval_fixture|synthetic-private-value|command|reason/);
});

const claudeAttributes = {
  "event.name": "api_request",
  "event.timestamp": occurredAt,
  "session.id": claudePostCompact.session_id,
  "prompt.id": "5369e83d-558c-4a26-a1af-7ae134c11fea",
  request_id: "req_fixture_01",
  model: "claude-sonnet-5",
  input_tokens: 100,
  cache_read_tokens: 600,
  cache_creation_tokens: 20,
  output_tokens: 45,
  system_prompt: privateValue,
};

test("Claude usage retains measured request duration when token counts are unavailable", () => {
  const [event] = adaptRecord("claude_monitoring", {
    attributes: [
      { key: "event.name", value: { stringValue: "api_request" } },
      { key: "request_id", value: { stringValue: "req_duration" } },
      { key: "event.timestamp", value: { stringValue: occurredAt } },
      { key: "duration_ms", value: { intValue: "30000" } },
    ],
  }, context);
  assert.ok(event, "an identified, timed request is usable independently of token counters");
  assert.equal(event.data.duration_ms, 30000);
  assert.equal(event.occurred_at, occurredAt);
  assert.equal(event.data.input_tokens, null);
});

test("local Claude monitoring normalizes per-request usage and shares session identity with hooks", () => {
  const [event] = adaptRecord("claude_monitoring", { attributes: claudeAttributes, body: privateValue }, context);
  const [hook] = adaptRecord("claude_hook", claudePostCompact, { ...context, occurrenceId: "capture-1" });
  assert.equal(event.data.session_id, hook.data.session_id);
  assert.equal(event.data.thread_id, hook.data.thread_id);
  assert.equal(event.data.turn_id, alias("claude.turn", claudeAttributes["prompt.id"]));
  assert.equal(event.data.response_id, alias("claude.response", "req_fixture_01"));
  assert.equal(event.data.model, "claude-sonnet-5");
  assert.equal(event.data.input_tokens, 720);
  assert.equal(event.data.cached_input_tokens, 600);
  assert.equal(event.data.cache_write_input_tokens, 20);
  assert.equal(event.data.output_tokens, 45);
  assert.equal(event.data.reasoning_output_tokens, null);
  assert.equal(event.occurred_at, occurredAt);
  assert.doesNotMatch(JSON.stringify(event), /req_fixture|synthetic-private-value|5369e83d/);

  const attributes = Object.entries(claudeAttributes).map(([key, value]) => ({
    key,
    value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value },
  }));
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes }, context), [event]);
});

test("Claude monitoring keeps missing cache measures unknown and excludes unsupported event shapes", () => {
  const gaps: string[] = [];
  const observed = { ...context, reportGap: (gap: string) => gaps.push(gap) };
  const [event] = adaptRecord("claude_monitoring", { attributes: {
    ...claudeAttributes, cache_read_tokens: undefined, output_tokens: 0, model: privateValue,
  } }, observed);
  assert.equal(event.data.input_tokens, null);
  assert.equal(event.data.cached_input_tokens, null);
  assert.equal(event.data.cache_write_input_tokens, 20);
  assert.equal(event.data.output_tokens, 0);
  assert.equal(event.data.model, null);
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes: {
    ...claudeAttributes, request_id: null, client_request_id: "no-provider-response",
  } }, observed), []);
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes: {
    ...claudeAttributes, "event.name": "api_error",
  } }, observed), []);
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes: [
    { key: "event.name", value: { stringValue: "api_request" } },
    { key: "request_id", value: { stringValue: "first" } },
    { key: "request_id", value: { stringValue: "second" } },
  ] }, observed), []);
  assert.deepEqual(adaptRecord("unrecognized", { body: privateValue }, observed), []);
  assert.deepEqual(adaptRecord("claude_hook", [claudePostCompact], observed), []);
  assert.deepEqual(gaps, ["usage_counts_partial", "usage_response_identity_missing"]);
});

test("Claude monitoring counts successful compaction once and scopes a reused process sequence by time", () => {
  const gaps: string[] = [];
  const observed = { ...context, reportGap: (gap: string) => gaps.push(gap) };
  const attributes = {
    "event.name": "compaction",
    "event.timestamp": occurredAt,
    "event.sequence": 0,
    "session.id": claudePostCompact.session_id,
    trigger: "auto",
    success: "true",
    pre_tokens: 100_000,
    post_tokens: 5000,
    error: privateValue,
  };
  const [first] = adaptRecord("claude_monitoring", { attributes }, observed);
  const [next] = adaptRecord("claude_monitoring", { attributes: { ...attributes, "event.sequence": 1 } }, observed);
  const [restarted] = adaptRecord("claude_monitoring", { attributes: { ...attributes, "event.timestamp": observedAt } }, observed);
  const [replay] = adaptRecord("claude_monitoring", { attributes }, { ...observed, sourceId: alias("source", "local-replay") });
  assert.equal(first.event_type, "context.compacted");
  assert.equal(first.occurred_at, occurredAt);
  assert.equal(first.data.turn_id, null);
  assert.equal(first.data.trigger, "auto");
  assert.equal(first.event_id, replay.event_id);
  assert.notEqual(first.event_id, next.event_id);
  assert.notEqual(first.event_id, restarted.event_id);
  assert.doesNotMatch(JSON.stringify(first), /synthetic-private-value|pre_tokens|post_tokens/);
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes: { ...attributes, success: "false" } }, observed), []);
  assert.deepEqual(adaptRecord("claude_monitoring", { attributes: { ...attributes, success: true } }, observed), []);
  assert.deepEqual(adaptRecord("claude_monitoring", {
    attributes: { ...attributes, "event.sequence": null, "event.timestamp": null },
  }, observed), []);
  assert.deepEqual(gaps, ["compaction_outcome_missing", "compaction_occurrence_identity_missing"]);
});

test("adapted records satisfy the journal codec using real issued identity proofs", () => {
  const profile = {
    project_id: "project_fixture",
    journal: "/unused",
    sources: { local_fixture: { kind: "claude_monitoring" } },
    categories: { model: ["claude-sonnet-5"] },
    identityKey: "2f".repeat(32),
    issuedIds: new Set(["task_fixture"]),
  };
  const [event] = adaptRecord("claude_monitoring", { attributes: claudeAttributes }, {
    ...context,
    projectId: profile.project_id,
    sourceId: "local_fixture",
    taskId: "task_fixture",
    alias: (namespace: string, value: string) => mapIdentity(profile, namespace, value),
  });
  assert.deepEqual(normalizeEvent(event, profile), event);
});
