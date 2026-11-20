import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { adaptRecord, compaction, indexCodexRollout, monitoringAttributes, toolHook, type AdapterContext } from "./adapters.js";
import { parseUtc, recordObject, type MetricsEvent } from "./events.js";
import type { MetricsSource } from "./profile.js";

export function sessionFor(kind: string, value: unknown): unknown {
  const row = recordObject(value);
  if (!row) return;
  if (kind === "codex_app_server") return recordObject(row.params)?.threadId;
  if (kind === "codex_rollout") return recordObject(row.payload)?.thread_id;
  if (kind === "claude_monitoring") return monitoringAttributes(row.attributes)?.["session.id"];
  return row.session_id;
}

// The native PostCompact payload lacks a unique occurrence ID on both clients.
// Match only the explicitly selected session file. Its durable boundary survives hook replay.
function transcript(path: string, hookPath: unknown, offset: number): Record<string, unknown>[] {
  if (typeof hookPath !== "string" || path !== hookPath || realpathSync(path) !== path) throw new Error();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < offset || stat.size - offset > 64 * 1024 * 1024) throw new Error();
    const bytes = Buffer.alloc(stat.size - offset);
    let read = 0;
    while (read < bytes.length) {
      const n = readSync(fd, bytes, read, bytes.length - read, offset + read);
      if (!n) throw new Error();
      read += n;
    }
    const text = bytes.toString("utf8");
    const rows = text.split("\n");
    if (rows.at(-1) === "") rows.pop();
    return rows.map(line => recordObject(JSON.parse(line)) ?? {});
  } finally { closeSync(fd); }
}

export function nativeHook(source: MetricsSource, input: unknown, ctx: AdapterContext): MetricsEvent[] {
  const row = recordObject(input);
  if (!row || !source.session_id || row.session_id !== source.session_id) return [];
  const harness = source.kind === "codex_hook" ? "codex" : "claude";
  const thread = source.session_id;
  const events = toolHook(harness, row, ctx);
  if (row.hook_event_name !== "PostCompact" && row.hook_event_name !== "Stop" && row.hook_event_name !== "SessionEnd") return events;
  if (!source.path) {
    if (row.hook_event_name === "PostCompact") ctx.reportGap?.("compaction_occurrence_identity_missing");
    return events;
  }
  try {
    const rows = transcript(source.path, row.transcript_path, source.offset ?? 0);
    if (harness === "codex") {
      const headers = rows.filter(r => r.type === "session_meta");
      if (headers.some(r => recordObject(r.payload)?.id !== thread) || (source.offset === undefined && headers.length !== 1)) throw new Error();
      const indexed = { ...ctx, codexRollout: indexCodexRollout(rows) };
      const ordinals = new Map<string, number>();
      for (const item of rows) {
        const payload = recordObject(item.payload);
        if (item.type === "token_usage_record" && payload?.thread_id === thread) {
          events.push(...adaptRecord("codex_rollout", item, indexed));
        }
        const stamp = parseUtc(item.timestamp);
        if (item.type === "compacted" && stamp) {
          const index = ordinals.get(stamp) ?? 0;
          ordinals.set(stamp, index + 1);
          events.push(compaction(ctx, harness, thread, [stamp, String(index)], stamp, payload?.turn_id, payload?.trigger));
        }
      }
    } else {
      for (const item of rows) {
        if (item.sessionId !== thread || item.isSidechain === true) continue;
        const stamp = parseUtc(item.timestamp);
        if (item.type === "system" && item.subtype === "compact_boundary" && stamp &&
            typeof item.uuid === "string" && /^[\w-]{1,128}$/u.test(item.uuid)) {
          events.push(compaction(ctx, harness, thread, [item.uuid], stamp, null, recordObject(item.compactMetadata)?.trigger));
        }
        const message = recordObject(item.message);
        const usage = recordObject(message?.usage);
        if (item.type !== "assistant" || !usage || !stamp) continue;
        // A provider message may have several transcript projections. Its ID is the
        // response key. Fragment timestamps differ and are not response completion times.
        events.push(...adaptRecord("claude_monitoring", { attributes: {
          "event.name": "api_request", "session.id": thread, request_id: message?.id, model: message?.model,
          input_tokens: usage.input_tokens, cache_read_tokens: usage.cache_read_input_tokens,
          cache_creation_tokens: usage.cache_creation_input_tokens, output_tokens: usage.output_tokens,
        } }, { ...ctx, alias: (ns, id) => ctx.alias(ns === "claude.response" ? "claude.message" : ns, id) }));
      }
    }
    if (row.hook_event_name === "PostCompact" && !events.some(e => e.event_type === "context.compacted")) {
      ctx.reportGap?.("compaction_occurrence_identity_missing");
    }
  } catch { ctx.reportGap?.("source_unreadable"); }
  return events;
}
