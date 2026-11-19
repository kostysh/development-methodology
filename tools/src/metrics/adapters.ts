import { parseUtc, recordObject, type MetricsEvent } from "./events.js";

export interface CodexRolloutFacts {
  readonly modelByTurn: ReadonlyMap<string, string | null>;
  readonly parentByThread: ReadonlyMap<string, string | null>;
}

export interface AdapterContext {
  projectId: string;
  sourceId: string;
  observedAt: string;
  alias(namespace: string, verifiedId: string): string;
  taskId?: string;
  // These facts come from an occurrence receipt verified by the caller.
  occurrenceId?: string;
  occurredAt?: string;
  codexRollout?: CodexRolloutFacts;
  category?(field: string, value: unknown): string | null;
  reportGap?(code: string): void;
}

type JsonObject = Record<string, unknown>;
type EventType = "model.usage" | "context.compacted" | "permission.review_started" | "permission.review_finished";

function identity(value: unknown): string | null {
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/.test(value)) {
    return value;
  }
  return null;
}

export function indexCodexRollout(records: Iterable<unknown>): CodexRolloutFacts {
  const modelByTurn = new Map<string, string | null>();
  const parentByThread = new Map<string, string | null>();

  function index(values: Map<string, string | null>, rawKey: unknown, rawValue: unknown): void {
    const key = identity(rawKey);
    const value = identity(rawValue);
    if (key === null || value === null) return;
    const previous = values.get(key);
    values.set(key, previous === undefined || previous === value ? value : null);
  }

  for (const raw of records) {
    const record = recordObject(raw);
    if (record?.type === "turn_context") {
      const payload = recordObject(record.payload);
      index(modelByTurn, payload?.turn_id, payload?.model);
    } else if (record?.type === "session_meta") {
      const payload = recordObject(record.payload);
      index(parentByThread, payload?.id, payload?.parent_thread_id);
    }
  }
  return { modelByTurn, parentByThread };
}

function tokenCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

function alias(context: AdapterContext, namespace: string, raw: unknown): string | null {
  const value = identity(raw);
  return value === null ? null : context.alias(namespace, value);
}

function event(
  context: AdapterContext,
  eventType: EventType,
  occurrenceKey: readonly string[],
  occurredAt: unknown,
  data: MetricsEvent["data"],
): MetricsEvent {
  return {
    schema_version: 1,
    project_id: context.projectId,
    source_id: context.sourceId,
    event_id: context.alias(`event.${eventType}`, JSON.stringify(occurrenceKey)),
    event_type: eventType,
    occurred_at: parseUtc(occurredAt) ?? parseUtc(context.occurredAt),
    observed_at: context.observedAt,
    actor_role: eventType === "model.usage" ? "agent" : "automation",
    task_id: context.taskId ?? null,
    data,
  };
}

function codexRollout(record: JsonObject, context: AdapterContext): MetricsEvent[] {
  if (record.type !== "token_usage_record") return [];

  const payload = recordObject(record.payload);
  const responseId = identity(payload?.response_id);
  if (responseId === null) {
    context.reportGap?.("usage_response_identity_missing");
    return [];
  }

  const usage = recordObject(payload?.usage);
  const input = tokenCount(usage?.input_tokens);
  const cacheRead = tokenCount(usage?.cached_input_tokens);
  const cacheWrite = tokenCount(usage?.cache_write_input_tokens);
  const output = tokenCount(usage?.output_tokens);
  const reasoning = tokenCount(usage?.reasoning_output_tokens);
  const threadId = identity(payload?.thread_id);
  const turnId = identity(payload?.turn_id);
  if (input === null || cacheRead === null || output === null) {
    context.reportGap?.("usage_counts_partial");
  }
  if ([input, cacheRead, cacheWrite, output, reasoning].every((count) => count === null)) return [];

  const parent = threadId === null ? null : context.codexRollout?.parentByThread.get(threadId);
  const model = turnId === null ? null : context.codexRollout?.modelByTurn.get(turnId);

  // This record contains per-response usage. The other two usage objects
  // and `event_msg.token_count` are accumulated or last-count projections.
  return [event(context, "model.usage", ["codex", responseId], record.timestamp, {
    provider_id: context.alias("provider", "codex"),
    session_id: alias(context, "codex.session", payload?.session_id),
    thread_id: alias(context, "codex.thread", threadId),
    turn_id: alias(context, "codex.turn", turnId),
    root_turn_id: alias(context, "codex.turn", payload?.root_turn_id),
    parent_thread_id: alias(context, "codex.thread", parent),
    response_id: context.alias("codex.response", responseId),
    model: context.category?.("model", model) ?? null,
    input_tokens: input,
    cached_input_tokens: cacheRead,
    cache_write_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
  })];
}

function compaction(
  context: AdapterContext,
  harness: "claude" | "codex",
  threadId: string,
  occurrenceKey: string[],
  occurredAt: unknown,
  turnId: unknown,
  trigger: unknown,
): MetricsEvent {
  const key = [threadId, ...occurrenceKey];
  return event(context, "context.compacted", [harness, ...key], occurredAt, {
    session_id: harness === "claude" ? context.alias("claude.session", threadId) : null,
    thread_id: context.alias(`${harness}.thread`, threadId),
    turn_id: alias(context, `${harness}.turn`, turnId),
    compaction_id: context.alias(`${harness}.compaction`, JSON.stringify(key)),
    trigger: trigger === "auto" || trigger === "manual" ? trigger : null,
  });
}

function compactionHook(harness: "claude" | "codex", record: JsonObject, context: AdapterContext): MetricsEvent[] {
  // SessionStart/compact is the recovery entry. PostCompact reports completion.
  if (record.hook_event_name !== "PostCompact") return [];

  const occurrenceId = identity(context.occurrenceId);
  const threadId = identity(record.session_id);
  if (occurrenceId === null || threadId === null) {
    context.reportGap?.("compaction_occurrence_identity_missing");
    return [];
  }
  // Codex turn-scoped hooks call their thread identity session_id. Claude
  // Code has a conversation session ID but no turn ID on this hook input.
  return [compaction(context, harness, threadId, [occurrenceId], null,
    harness === "codex" ? record.turn_id : null, record.trigger)];
}

function epochMilliseconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const guardianOutcomes = new Set(["approved", "denied", "timedOut", "aborted"]);

function codexAppServer(record: JsonObject, context: AdapterContext): MetricsEvent[] {
  const params = recordObject(record.params);
  const threadId = identity(params?.threadId);
  if (record.method === "item/completed") {
    const item = recordObject(params?.item);
    if (item?.type !== "contextCompaction") return [];
    const occurrenceId = identity(item.id);
    if (threadId === null || occurrenceId === null) {
      context.reportGap?.("compaction_occurrence_identity_missing");
      return [];
    }
    return [compaction(context, "codex", threadId, [occurrenceId],
      epochMilliseconds(params?.completedAtMs), params?.turnId, null)];
  }

  const finished = record.method === "item/autoApprovalReview/completed";
  if (!finished && record.method !== "item/autoApprovalReview/started") return [];
  const reviewId = identity(params?.reviewId);
  if (threadId === null || reviewId === null) {
    context.reportGap?.("guardian_review_identity_missing");
    return [];
  }

  const data: MetricsEvent["data"] = {
    review_id: context.alias("codex.review", JSON.stringify([threadId, reviewId])),
    session_id: null,
    thread_id: context.alias("codex.thread", threadId),
    turn_id: alias(context, "codex.turn", params?.turnId),
  };
  if (finished) {
    const status = recordObject(params?.review)?.status;
    data.outcome = typeof status === "string" && guardianOutcomes.has(status)
      ? context.category?.("outcome", status) ?? null : null;
    if (data.outcome === null) context.reportGap?.("guardian_review_outcome_unknown");
  }

  return [event(context, finished ? "permission.review_finished" : "permission.review_started",
    ["codex", threadId, reviewId], epochMilliseconds(finished ? params?.completedAtMs : params?.startedAtMs), data)];
}

const monitoringFields = new Set([
  "event.name", "event.timestamp", "event.sequence", "session.id", "prompt.id", "request_id", "model",
  "input_tokens", "cache_read_tokens", "cache_creation_tokens", "output_tokens",
  "trigger", "success", "duration_ms",
]);

function monitoringAttributes(value: unknown): JsonObject | undefined {
  if (!Array.isArray(value)) return recordObject(value);

  // An OTLP JSON LogRecord uses key/value entries and encodes int64 as strings.
  const attributes: JsonObject = {};
  for (const entry of value) {
    const attribute = recordObject(entry);
    const key = attribute?.key;
    if (typeof key !== "string" || !monitoringFields.has(key)) continue;
    if (Object.hasOwn(attributes, key)) return undefined;

    const scalar = recordObject(attribute?.value);
    const integer = scalar?.intValue;
    attributes[key] = typeof integer === "string" && /^[0-9]{1,16}$/.test(integer)
      ? Number(integer)
      : integer ?? scalar?.stringValue;
  }
  return attributes;
}

function claudeMonitoring(record: JsonObject, context: AdapterContext): MetricsEvent[] {
  const attributes = monitoringAttributes(record.attributes);
  if (attributes?.["event.name"] === "compaction") {
    if (attributes.success === "false") return [];
    if (attributes.success !== "true") {
      context.reportGap?.("compaction_outcome_missing");
      return [];
    }
    const threadId = identity(attributes["session.id"]);
    const occurredAt = parseUtc(attributes["event.timestamp"]);
    const sequence = tokenCount(attributes["event.sequence"]);
    if (threadId === null || occurredAt === null || sequence === null) {
      context.reportGap?.("compaction_occurrence_identity_missing");
      return [];
    }
    // Sequence can restart with the process. The event clock scopes its reuse.
    return [compaction(context, "claude", threadId, [occurredAt, String(sequence)],
      occurredAt, attributes["prompt.id"], attributes.trigger)];
  }
  if (attributes?.["event.name"] !== "api_request") return [];

  // For this configured stream, the API request ID identifies the single
  // measured response. Transcript joins require a verified external mapping.
  const responseId = identity(attributes.request_id);
  if (responseId === null) {
    context.reportGap?.("usage_response_identity_missing");
    return [];
  }

  const uncachedInput = tokenCount(attributes.input_tokens);
  const cacheRead = tokenCount(attributes.cache_read_tokens);
  const cacheWrite = tokenCount(attributes.cache_creation_tokens);
  const output = tokenCount(attributes.output_tokens);
  const input = uncachedInput === null || cacheRead === null || cacheWrite === null
    ? null
    : tokenCount(uncachedInput + cacheRead + cacheWrite);
  if (input === null || output === null) context.reportGap?.("usage_counts_partial");
  const duration = tokenCount(attributes.duration_ms);
  if ([input, cacheRead, cacheWrite, output, duration].every((value) => value === null)) return [];

  return [event(context, "model.usage", ["claude", responseId], attributes["event.timestamp"], {
    provider_id: context.alias("provider", "claude"),
    session_id: alias(context, "claude.session", attributes["session.id"]),
    thread_id: alias(context, "claude.thread", attributes["session.id"]),
    turn_id: alias(context, "claude.turn", attributes["prompt.id"]),
    root_turn_id: null,
    parent_thread_id: null,
    response_id: context.alias("claude.response", responseId),
    model: context.category?.("model", attributes.model) ?? null,
    duration_ms: duration,
    input_tokens: input,
    cached_input_tokens: cacheRead,
    cache_write_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: null,
  })];
}

export function adaptRecord(kind: string, raw: unknown, context: AdapterContext): MetricsEvent[] {
  const record = recordObject(raw);
  if (!record) return [];

  switch (kind) {
    case "codex_rollout":
      return codexRollout(record, context);
    case "codex_hook":
      return compactionHook("codex", record, context);
    case "codex_app_server":
      return codexAppServer(record, context);
    case "claude_hook":
      return compactionHook("claude", record, context);
    case "claude_monitoring":
      return claudeMonitoring(record, context);
    default:
      return [];
  }
}
