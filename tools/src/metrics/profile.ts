import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isEventType, isTrainSource, issuedAlias, parseUtc, recordObject, sourceKey, timeKey, trainObservation } from "./events.js";
import type { ReportCoverage } from "./report.js";

export type MetricsSource = { kind: string; path?: string; task_id?: string; content_sha256?: string; session_id?: string; offset?: number };
export type MetricsProfile = {
  project_id: string;
  projectRoot: string;
  journal: string;
  sources: Record<string, MetricsSource>;
  categories: Record<string, string[]>;
  identityKey: string;
  issuedIds: ReadonlySet<string>;
  coverage?: readonly ReportCoverage[];
};

const kinds = new Set([
  "normalized", "task", "audit", "development",
  "codex_app_server", "codex_hook", "codex_rollout", "claude_hook", "claude_monitoring",
  "github_webhook", "github_jobs",
]);
const categoryFields = new Set([
  "action_type", "change_type", "failure_code", "fixture_version", "model",
  "operation_type", "outcome", "subject_type",
]);
const categoricalValue = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u;
const hexKey = /^[a-f0-9]{64}$/u;

function invalid(): never {
  throw new Error("invalid_profile");
}

function pathValue(value: unknown, base: string): string {
  if (typeof value !== "string" || !value || value.length > 4096 || value.includes("\0")) invalid();
  return resolve(base, value);
}

function outsideWorktree(path: string, project: string): string {
  const parent = realpathSync(dirname(path));
  const rel = relative(project, parent);
  if (!isAbsolute(rel) && rel.split(sep)[0] !== "..") invalid();

  let current = parent;
  for (;;) {
    const marker = resolve(current, ".git");
    const info = statSync(marker, { throwIfNoEntry: false });
    if (info?.isDirectory() && existsSync(resolve(marker, "HEAD"))) invalid();
    if (info?.isFile() && info.size <= 4096 && readFileSync(marker, "utf8").startsWith("gitdir:")) invalid();
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return resolve(parent, basename(path));
}

function parseCoverage(value: unknown, sources: MetricsProfile["sources"]): ReportCoverage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1024) invalid();
  return value.map((item) => {
    const row = recordObject(item);
    if (!row || typeof row.source_id !== "string" || !Object.hasOwn(sources, row.source_id)
        || !Array.isArray(row.event_types) || !row.event_types.length || !row.event_types.every(isEventType)
        || (row.event_types.includes(trainObservation) && !isTrainSource(sources[row.source_id]))
        || (row.status !== "complete" && row.status !== "not_applicable")
        || Object.keys(row).some((key) => !["source_id", "event_types", "from", "through", "status"].includes(key))) {
      invalid();
    }
    const from = parseUtc(row.from);
    const through = parseUtc(row.through);
    if (!from || !through) invalid();
    const timeOrder = row.event_types.includes(trainObservation) ? timeKey : Date.parse;
    if (timeOrder(from) >= timeOrder(through)) invalid();
    return { source_id: row.source_id, event_types: row.event_types, from, through, status: row.status };
  });
}

export function readProfile(file: string): MetricsProfile {
  try {
    const profilePath = realpathSync(file);
    const base = dirname(profilePath);
    const info = statSync(profilePath);
    if (!info.isFile() || info.size > 1024 * 1024 || (info.mode & 0o077) !== 0) invalid();
    const data = recordObject(JSON.parse(readFileSync(profilePath, "utf8")));
    if (!data || typeof data.project_id !== "string" || !sourceKey.test(data.project_id)
        || typeof data.identity_key !== "string" || !hexKey.test(data.identity_key)
        || Object.keys(data).some((key) =>
          !["project_id", "project_root", "journal", "identity_key", "issued_ids", "sources", "categories", "coverage"]
            .includes(key))) invalid();
    const project = realpathSync(pathValue(data.project_root, base));
    if (!statSync(project).isDirectory()) invalid();
    outsideWorktree(profilePath, project);
    const journal = outsideWorktree(pathValue(data.journal, base), project);
    if (journal === profilePath || coverageFile(journal) === profilePath) invalid();
    const issued = data.issued_ids ?? [];
    if (!Array.isArray(issued) || issued.length > 10_000
        || issued.some((id) => typeof id !== "string" || !issuedAlias.test(id))) invalid();
    const issuedIds = new Set<string>(issued);

    const rawSources = recordObject(data.sources);
    if (!rawSources || !Object.keys(rawSources).length || Object.keys(rawSources).length > 256) invalid();
    const sources: MetricsProfile["sources"] = Object.create(null);
    for (const [name, value] of Object.entries(rawSources)) {
      const row = recordObject(value);
      if (!sourceKey.test(name) || !row || typeof row.kind !== "string" || !kinds.has(row.kind)
          || Object.keys(row).some((key) => !["kind", "path", "task_id", "content_sha256", "session_id"].includes(key))) invalid();
      const source: MetricsSource = { kind: row.kind };
      if (row.task_id !== undefined) {
        if (typeof row.task_id !== "string" || !issuedIds.has(row.task_id)) invalid();
        source.task_id = row.task_id;
      }
      if (row.session_id !== undefined) {
        if (!source.task_id || !/^(?:codex_|claude_)/u.test(source.kind)
            || typeof row.session_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/u.test(row.session_id)) invalid();
        source.session_id = row.session_id;
      }
      if (row.path !== undefined) source.path = pathValue(row.path, base);
      if (row.content_sha256 !== undefined) {
        if (!source.path || typeof row.content_sha256 !== "string" || !hexKey.test(row.content_sha256)) invalid();
        source.content_sha256 = row.content_sha256;
      }
      if (source.path === journal || source.path === coverageFile(journal)) invalid();
      sources[name] = source;
    }

    const nativeBindings = new Set<string>();
    for (const src of Object.values(sources)) {
      if (src.session_id && src.kind.endsWith("_hook")) {
        const binding = JSON.stringify([src.kind, src.session_id]);
        if (nativeBindings.has(binding)) invalid();
        nativeBindings.add(binding);
      }
    }

    const rawCategories = recordObject(data.categories ?? {});
    if (!rawCategories) invalid();
    const categories: MetricsProfile["categories"] = Object.create(null);
    for (const [name, values] of Object.entries(rawCategories)) {
      if (!categoryFields.has(name) || !Array.isArray(values) || values.length > 256
          || values.some((value) => typeof value !== "string" || !categoricalValue.test(value))) invalid();
      categories[name] = values;
    }

    return {
      project_id: data.project_id, projectRoot: project, journal, sources, categories,
      identityKey: data.identity_key, issuedIds, coverage: parseCoverage(data.coverage, sources),
    };
  } catch {
    return invalid();
  }
}

export function coverageFile(journal: string): string {
  return `${journal}.coverage.jsonl`;
}
