#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with { type: "json" };
import { adaptRecord, indexCodexRollout, type AdapterContext } from "./metrics/adapters.js";
import {
  isTrainSource, isTrustedIdentity, mapIdentity, normalizeEvent, parseUtc, recordObject, type MetricsEvent,
} from "./metrics/events.js";
import { adaptGithub } from "./metrics/github.js";
import { appendJournal, coverageGap, readJournal, type CoverageGap } from "./metrics/journal.js";
import { coverageFile, readProfile, type MetricsProfile, type MetricsSource } from "./metrics/profile.js";
import { summarize } from "./metrics/report.js";

const usage = [
  "Usage: methodology-metrics record PROFILE",
  "       methodology-metrics collect PROFILE SOURCE",
  "       methodology-metrics hook PROFILE SOURCE",
  "       methodology-metrics summary PROFILE TASK --as-of UTC",
].join("\n");
const normalizedKinds = new Set(["normalized", "task", "audit", "development"]);
const safeErrors = new Set([
  "invalid_arguments", "invalid_profile", "invalid_input", "line_limit",
  "journal_permissions", "journal_limit", "journal_unavailable", "journal_lock_unavailable", "journal_lock_busy",
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
) {
  const events: MetricsEvent[] = [];
  const gaps: CoverageGap[] = [];
  const observedAt = new Date().toISOString();
  const note = (code: string, gapSource = sourceId) => gaps.push(coverageGap(code, gapSource, observedAt));
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(rawInput);
  } catch {
    note("invalid_input");
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
      note("line_limit");
      continue;
    }
    try {
      parsedRows.push({ line: index + 1, payload: JSON.parse(line) });
    } catch {
      note("invalid_input");
    }
  }

  const codexRollout = source?.kind === "codex_rollout"
    ? indexCodexRollout(parsedRows.map(({ payload }) => payload))
    : undefined;
  for (const { line, payload } of parsedRows) {
    if (!source || normalizedKinds.has(source.kind)) {
      try {
        const event = normalizeEvent(payload, profile);
        if ((sourceId && event.source_id !== sourceId)
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
      const adapted = source.kind === "github_webhook" || source.kind === "github_jobs"
        ? adaptGithub(source.kind, payload, context)
        : adaptRecord(source.kind, payload, context);
      for (const row of adapted) events.push(normalizeEvent(row, profile));
    } catch {
      note("invalid_event");
    }
  }
  return { events, gaps };
}

async function persist(profile: MetricsProfile, operation: string, sourceName?: string): Promise<number> {
  const source = sourceName && Object.hasOwn(profile.sources, sourceName) ? profile.sources[sourceName] : undefined;
  if (sourceName && !source) {
    appendJournal(profile, [], [coverageGap("source_unconfigured")]);
    warn("source_unconfigured");
    return 1;
  }

  let raw: Buffer;
  try {
    const input = operation === "collect" ? readSource(profile, source!) : process.stdin;
    raw = await readInput(input, operation === "hook" ? maxRowBytes : maxBatchBytes);
  } catch (error) {
    const code = error instanceof Error && (error.message === "line_limit" || error.message === "source_missing")
      ? error.message : operation === "collect" ? "source_unreadable" : "invalid_input";
    appendJournal(profile, [], [coverageGap(code, sourceName ?? null)]);
    warn(code);
    return 1;
  }
  if (operation === "collect" && source?.content_sha256
      && createHash("sha256").update(raw).digest("hex") !== source.content_sha256) {
    appendJournal(profile, [], [coverageGap("source_changed", sourceName!)]);
    warn("source_changed");
    return 1;
  }

  const { events, gaps } = ingest(profile, operation, raw, sourceName ?? null, source);
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
      options: { help: { type: "boolean", short: "h" }, version: { type: "boolean" }, "as-of": { type: "string" } },
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
    if (!positionals.length && asOf === undefined && values.help !== values.version) {
      console.log(values.help ? usage : packageInfo.version);
      return 0;
    }
    const [operation, profilePath, target] = positionals;
    if (!profilePath || values.help || values.version
        || (operation === "record" && (positionals.length !== 2 || asOf !== undefined))
        || (operation === "collect" && (positionals.length !== 3 || !target || asOf !== undefined))
        || (operation === "hook" && (positionals.length !== 3 || !target || asOf !== undefined))
        || (operation === "summary" && (positionals.length !== 3 || !target || !parseUtc(asOf)))
        || !["record", "collect", "hook", "summary"].includes(operation)) throw new Error("invalid_arguments");
    const profile = readProfile(profilePath);
    if (operation === "summary") {
      if (!isTrustedIdentity(target, profile)) throw new Error("invalid_arguments");
      const sourceApplies = (sourceId: string | null) => {
        const sourceTask = sourceId === null ? undefined : profile.sources[sourceId].task_id;
        return sourceTask === undefined || sourceTask === target;
      };
      const journal = readJournal(profile, asOf);
      const applicableGaps = journal.gaps.filter(({ source_id }) => sourceApplies(source_id));
      const applicableCoverage = profile.coverage?.filter(({ source_id }) => sourceApplies(source_id));
      const trainSources = new Set(Object.entries(profile.sources)
        .filter(([, source]) => isTrainSource(source) && source.task_id === target)
        .map(([sourceId]) => sourceId));
      const report = summarize({ ...journal, gaps: applicableGaps }, target, asOf!, applicableCoverage, trainSources);
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }
    status = await persist(profile, operation, target);
  } catch (error) {
    warn(error instanceof Error && safeErrors.has(error.message) ? error.message : "invalid_input");
  }
  return passive ? 0 : status;
}

process.exitCode = await main();
