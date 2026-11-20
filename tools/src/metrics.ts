#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with { type: "json" };
import { adaptRecord, indexCodexRollout, type AdapterContext } from "./metrics/adapters.js";
import {
  isTrainSource, isTrustedIdentity, mapIdentity, normalizeEvent, parseUtc, recordObject, type MetricsEvent,
} from "./metrics/events.js";
import { armSession, boundHook } from "./metrics/binding.js";
import { nativeHook, sessionFor } from "./metrics/native.js";
import { configureHooks } from "./metrics/setup.js";
import { mark, runTest, gitRewrite } from "./metrics/operations.js";
import { syncGithub } from "./metrics/github-sync.js";
import { adaptGithub } from "./metrics/github.js";
import { appendJournal, coverageGap, readJournal, type CoverageGap } from "./metrics/journal.js";
import { coverageFile, readProfile, type MetricsProfile, type MetricsSource } from "./metrics/profile.js";
import { summarize } from "./metrics/report.js";

const usage = [
  "Usage: methodology-metrics record PROFILE",
  "       methodology-metrics collect PROFILE SOURCE",
  "       methodology-metrics hook PROFILE SOURCE",
  "       methodology-metrics install-hooks|uninstall-hooks|arm-session PROFILE SOURCE",
  "       methodology-metrics mark PROFILE SOURCE EVENT OCCURRENCE [--at UTC] [--actor operator|agent|automation]",
  "       methodology-metrics run-test PROFILE SOURCE SUITE ATTEMPT -- COMMAND [ARG...]",
  "       methodology-metrics git-rewrite PROFILE SOURCE amend|rebase",
  "       methodology-metrics github-sync PROFILE SOURCE OWNER/REPO PR",
  "       methodology-metrics compare PROFILE BEFORE_TASK AFTER_TASK --as-of UTC",
  "       methodology-metrics summary PROFILE TASK --as-of UTC",
].join("\n");
const normalizedKinds = new Set(["normalized", "task", "audit", "development"]);
const safeErrors = new Set([
  "invalid_arguments", "invalid_profile", "invalid_input", "line_limit",
  "session_binding_required", "occurrence_conflict", "unsafe_hook_settings", "journal_permissions", "journal_limit", "journal_unavailable", "journal_lock_unavailable", "journal_lock_busy",
]);
const maxRowBytes = 256 * 1024;
const maxBatchBytes = 16 * 1024 * 1024;
const maxBatchRows = 50_000;

function warn(code: string) {
  console.error(`methodology-metrics: ${code}`);
}

async function readInput(input: AsyncIterable<Buffer>, limit: number) {
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error("line_limit");
    parts.push(chunk);
  }
  return Buffer.concat(parts, bytes);
}

function readSource(profile: MetricsProfile, source: MetricsSource) {
  if (!source.path) throw new Error("source_missing");
  try {
    const path = realpathSync(source.path);
    const info = statSync(path);
    if (!info.isFile() || path === profile.journal || path === coverageFile(profile.journal)) {
      throw new Error("source_unreadable");
    }
    if (info.size > maxBatchBytes) throw new Error("line_limit");
    return createReadStream(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("source_missing");
    }
    if (error instanceof Error && error.message === "line_limit") throw error;
    throw new Error("source_unreadable");
  }
}

function ingest(
  profile: MetricsProfile,
  operation: string,
  rawInput: Buffer,
  sourceId: string | null,
  source: MetricsSource | undefined,
  deferred = false,
  profilePath?: string,
) {
  const events: MetricsEvent[] = [];
  const gaps: CoverageGap[] = [];
  const observedAt = new Date().toISOString();
  const note = (code: string, gapSource = sourceId) => gaps.push(coverageGap(code, gapSource, observedAt));
  const scopedNativeHook = operation === "hook" && source?.task_id && source.kind.endsWith("_hook");
  // A malformed or truncated native callback has no verifiable task identity.
  // Surface the diagnostic on stderr without charging an unrelated session's task.
  const inputFault = (code: string) => scopedNativeHook ? warn(code) : note(code);
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(rawInput);
  } catch {
    inputFault("invalid_input");
    return { events, gaps };
  }
  const rows = operation === "hook" ? [raw] : raw.split("\n");
  if (rows.length > maxBatchRows) {
    note("line_limit");
    return { events, gaps };
  }
  const parsedRows: { line: number; payload: unknown }[] = [];
  for (const [index, line] of rows.entries()) {
    if (!line.trim() && operation !== "hook") continue;
    if (Buffer.byteLength(line) > maxRowBytes) {
      inputFault("line_limit");
      continue;
    }
    try {
      parsedRows.push({ line: index + 1, payload: JSON.parse(line) });
    } catch {
      inputFault("invalid_input");
    }
  }

  const codexRollout = source?.kind === "codex_rollout"
    ? indexCodexRollout(parsedRows.map(({ payload }) => payload))
    : undefined;
  for (const { line, payload } of parsedRows) {
    if (!source || normalizedKinds.has(source.kind)) {
      try {
        const event = normalizeEvent(payload, profile);
        if ((!source && !normalizedKinds.has(profile.sources[event.source_id].kind))
            || (sourceId && event.source_id !== sourceId)
            || (source?.task_id && event.task_id !== source.task_id)) throw new Error("invalid_event");
        events.push(event);
      } catch {
        const row = recordObject(payload);
        const reportedSource = typeof row?.source_id === "string"
          && Object.hasOwn(profile.sources, row.source_id) ? row.source_id : null;
        note("invalid_event", sourceId ?? reportedSource);
      }
      continue;
    }

    try {
      const context: AdapterContext = {
        projectId: profile.project_id,
        sourceId: sourceId!,
        observedAt,
        alias: (namespace, id) => mapIdentity(profile, namespace, id),
        category: (field, value) => typeof value === "string" && profile.categories[field]?.includes(value) ? value : null,
        reportGap: note,
        taskId: source.task_id,
        occurrenceId: operation === "collect" && source.content_sha256 ? `${source.content_sha256}:${line}` : undefined,
        codexRollout,
      };
      const bound = operation === "hook" && source.kind.endsWith("_hook") && source.task_id
        ? boundHook(profile, sourceId!, payload) : source;
      if (!bound) continue;
      if (bound.task_id && /^(?:claude|codex)_/u.test(source.kind)) {
        if (!bound.session_id) { note("session_binding_required"); continue; }
        if (sessionFor(source.kind, payload) !== bound.session_id) continue;
      }
      // Some hosts persist the compaction boundary only after the synchronous
      // callback returns. A detached, bounded reread survives noninteractive teardown.
      const native = recordObject(payload);
      if (operation === "hook" && !deferred && bound.session_id && bound.path && source.kind.endsWith("_hook") && profilePath &&
          (native?.hook_event_name === "PostCompact" || native?.hook_event_name === "Stop")) {
        const receipt = { hook_event_name: native.hook_event_name, session_id: native.session_id, transcript_path: native.transcript_path };
        // Pass only the three allowed selectors. The worker rechecks the active binding.
        const child = spawn(process.execPath, [process.argv[1], "flush-hook", profilePath, sourceId!],
          { detached: true, stdio: ["pipe", "ignore", "ignore"] });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(receipt));
        child.unref();
        context.reportGap = code => {
          if (code !== "source_unreadable" && code !== "compaction_occurrence_identity_missing") note(code);
        };
      }
      const adapted = operation === "hook" && bound.session_id && source.kind.endsWith("_hook")
        ? nativeHook(bound, payload, context)
        : source.kind === "github_webhook" || source.kind === "github_jobs"
        ? adaptGithub(source.kind, payload, context)
        : adaptRecord(source.kind, payload, context);
      for (const row of adapted) events.push(normalizeEvent(row, profile));
    } catch {
      note("invalid_event");
    }
  }
  return { events, gaps };
}

async function persist(profile: MetricsProfile, operation: string, sourceName?: string, profilePath?: string): Promise<number> {
  const source = sourceName && Object.hasOwn(profile.sources, sourceName) ? profile.sources[sourceName] : undefined;
  if (sourceName && !source) {
    appendJournal(profile, [], [coverageGap("source_unconfigured")]);
    warn("source_unconfigured");
    return 1;
  }

  const deferred = operation === "flush-hook";
  if (deferred) {
    if (!source?.task_id || !source.kind.endsWith("_hook")) throw new Error("invalid_arguments");
    operation = "hook";
    await delay(700);
  }
  let raw: Buffer;
  try {
    const input = operation === "collect" ? readSource(profile, source!) : process.stdin;
    raw = await readInput(input, operation === "hook" ? maxRowBytes : maxBatchBytes);
  } catch (error) {
    const code = error instanceof Error && (error.message === "line_limit" || error.message === "source_missing")
      ? error.message : operation === "collect" ? "source_unreadable" : "invalid_input";
    if (!(operation === "hook" && source?.task_id && source.kind.endsWith("_hook"))) {
      appendJournal(profile, [], [coverageGap(code, sourceName ?? null)]);
    }
    warn(code);
    return 1;
  }
  if (operation === "collect" && source?.content_sha256
      && createHash("sha256").update(raw).digest("hex") !== source.content_sha256) {
    appendJournal(profile, [], [coverageGap("source_changed", sourceName!)]);
    warn("source_changed");
    return 1;
  }

  if (deferred) {
    const selectors = recordObject(JSON.parse(raw.toString("utf8")));
    if (!selectors || !["Stop", "PostCompact"].includes(String(selectors.hook_event_name)) ||
        Object.keys(selectors).some(k => !["hook_event_name", "session_id", "transcript_path"].includes(k))) throw new Error("invalid_arguments");
  }
  const { events, gaps } = ingest(profile, operation, raw, sourceName ?? null, source, deferred, profilePath);
  if (operation === "hook" && !events.length && !gaps.length) return 0;
  const result = appendJournal(profile, events, gaps);
  if (operation !== "hook") {
    console.log(`Recorded ${result.appended} events, ${result.repeat} repeats, ${result.gaps} gaps.`);
  }
  if (result.gaps) {
    warn("coverage_gap");
    return 1;
  }
  return 0;
}

function readArguments() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: { help: { type: "boolean", short: "h" }, version: { type: "boolean" }, at: { type: "string" }, actor: { type: "string" }, "as-of": { type: "string" } },
    });
  } catch {
    throw new Error("invalid_arguments");
  }
}

async function main(): Promise<number> {
  const passive = process.argv[2] === "hook";
  let status = 2;
  try {
    const { values, positionals } = readArguments();
    const asOf = values["as-of"];
    if (!positionals.length && values.at === undefined && values.actor === undefined && asOf === undefined && values.help !== values.version) {
      console.log(values.help ? usage : packageInfo.version);
      return 0;
    }
    const [operation, profilePath, target] = positionals;
    const markClock = values.at;
    const actor = values.actor ?? "operator";
    if (!profilePath || values.help || values.version
        || ((markClock !== undefined || values.actor !== undefined) && operation !== "mark")
        || (operation === "mark" && (positionals.length !== 5 || asOf !== undefined ||
          (markClock !== undefined && !parseUtc(markClock)) || !["operator", "agent", "automation"].includes(actor)))
        || (operation === "run-test" && (positionals.length < 6 || process.argv[7] !== "--" || asOf !== undefined))
        || (operation === "git-rewrite" && (positionals.length !== 4 || asOf !== undefined))
        || (operation === "github-sync" && (positionals.length !== 5 || asOf !== undefined))
        || (operation === "compare" && (positionals.length !== 4 || target === positionals[3] || !parseUtc(asOf)))
        || (operation === "record" && (positionals.length !== 2 || asOf !== undefined))
        || (operation === "collect" && (positionals.length !== 3 || !target || asOf !== undefined))
        || ((operation === "hook" || operation === "flush-hook") && (positionals.length !== 3 || !target || asOf !== undefined))
        || (operation === "summary" && (positionals.length !== 3 || !target || !parseUtc(asOf)))
        || ((operation.endsWith("-hooks") || operation === "arm-session") && (positionals.length !== 3 || !target || asOf !== undefined))
        || !["flush-hook", "mark", "compare", "run-test", "github-sync", "git-rewrite", "arm-session", "install-hooks", "uninstall-hooks", "record", "collect", "hook", "summary"].includes(operation)) throw new Error("invalid_arguments");
    const profile = readProfile(profilePath);
    if (operation === "mark") {
      const input = (await readInput(process.stdin, maxRowBytes)).toString("utf8").trim();
      mark(profile, target, positionals[3], positionals[4], input ? JSON.parse(input) : {},
        actor as MetricsEvent["actor_role"], markClock);
      return 0;
    }
    if (operation === "run-test") return runTest(profile, target, positionals[3], positionals[4], positionals.slice(5));
    if (operation === "github-sync") return await syncGithub(profile, target, positionals[3], positionals[4]);
    if (operation === "git-rewrite") return gitRewrite(profile, target, positionals[3], (await readInput(process.stdin, maxBatchBytes)).toString("utf8"));
    if (operation === "arm-session") {
      console.log(armSession(profile, target));
      return 0;
    }
    if (operation.endsWith("-hooks")) {
      configureHooks(profilePath, profile, target, operation === "install-hooks");
      return 0;
    }
    if (operation === "summary" || operation === "compare") {
      const journal = readJournal(profile, asOf);
      const reportFor = (task: string) => {
        if (!isTrustedIdentity(task, profile)) throw new Error("invalid_arguments");
        const applies = (id: string | null) => id === null || !profile.sources[id].task_id || profile.sources[id].task_id === task;
        const gaps = journal.gaps.filter(row => applies(row.source_id));
        const declarations = profile.coverage?.filter(row => applies(row.source_id));
        const trainSources = new Set(Object.entries(profile.sources).filter(([, src]) => isTrainSource(src) && src.task_id === task).map(([id]) => id));
        return summarize({ ...journal, gaps }, task, asOf!, declarations, trainSources);
      };
      const first = reportFor(target);
      if (operation === "summary") console.log(JSON.stringify(first, null, 2));
      else {
        const second = reportFor(positionals[3]);
        const facts = (report: typeof first) => ({
          task_id: report.task_id,
          acceptance_ms: report.lead_time.endpoint_estimated ? null : report.lead_time.calendar_ms.value,
          disputes: report.test_disputes.raised.status === "complete" ? report.test_disputes.raised.value : null,
          rework: report.seven_day_rework_share,
        });
        const before = facts(first);
        const after = facts(second);
        const delta = (a: number | null, b: number | null) => a === null || b === null
          ? { status: "insufficient_data", value: null } : { status: "known", value: b - a };
        console.log(JSON.stringify({ before, after, change: { acceptance_ms: delta(before.acceptance_ms, after.acceptance_ms),
          disputes: delta(before.disputes, after.disputes) } }, null, 2));
      }
      return 0;
    }
    status = await persist(profile, operation, target, profilePath);
  } catch (error) {
    warn(error instanceof Error && safeErrors.has(error.message) ? error.message : "invalid_input");
  }
  return passive ? 0 : status;
}

process.exitCode = await main();
