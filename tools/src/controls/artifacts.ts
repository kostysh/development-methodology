import { basename, dirname } from "node:path";
import { gitPath, regular, Repository, utf8 } from "../baseline/git.js";
import { readGit } from "./git.js";
import { identifier, onlyKeys, Rejection, strings } from "./input.js";

type Artifact = {
  id: string;
  path: string;
  oid: string;
  mode: string;
  status: string;
  supersedes: string[];
  successors: string[];
  archiveNote: string;
};

const transitions: Record<string, readonly string[]> = {
  draft: ["accepted"],
  accepted: ["superseded","deprecated","archived"],
  superseded: [],
  deprecated: ["archived"],
  archived: [],
};

function scalar(value: string): string {
  const text = value.trim();
  if (text.startsWith("#")) return "";
  if (text.startsWith('"')) {
    const decoded: unknown = JSON.parse(text);
    if (typeof decoded !== "string") throw new Error("Invalid quoted artifact metadata");
    return decoded;
  }
  if (text.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/u.test(text)) throw new Error("Invalid quoted artifact metadata");
    return text.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[|>!*&{\[]/u.test(text)) throw new Error("Unsupported artifact scalar");
  return text.replace(/\s+#.*$/u, "");
}

function metadata(source: string, path: string, keys: Set<string>) {
  const lines = source.split(/\r?\n/u);
  let end = lines.length;
  if (/\.md$/iu.test(path)) {
    if (lines[0] !== "---") return new Map<string, { value: string; items: string[] }>();
    lines.shift();
    end = lines.indexOf("---");
    if (end < 0) throw new Error("Unclosed artifact front matter");
  } else {
    if (lines[0] === "---") lines.shift();
    if (lines.at(-2) === "...") lines.splice(lines.length - 2, 1);
    end = lines.length;
  }
  const values = new Map<string, { value: string; items: string[] }>();
  let fieldSeen = false;
  for (let i = 0; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#") || (fieldSeen && /^ +\S/u.test(line))) continue;
    const field = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+|$)(.*)$/u.exec(line);
    if (!field) throw new Error("Unsupported top-level artifact metadata");
    fieldSeen = true;
    if (!keys.has(field[1])) continue;
    const [, key, value] = field;
    if (values.has(key)) throw new Error(`Repeated artifact field ${key}`);
    const items: string[] = [];
    if (!value.trim()) {
      while (i + 1 < end) {
        const next = /^ +-(?:\s+|$)(.*)$/u.exec(lines[i + 1]);
        if (!next) break;
        items.push(next[1]);
        i += 1;
      }
    }
    values.set(key, { value, items });
  }
  return values;
}

function references(field: { value: string; items: string[] } | undefined, label: string) {
  if (!field) return [];
  const value = field.value.replace(/\s+#.*$/u, "").trim();
  if (value && !(value.startsWith("[") && value.endsWith("]"))) throw new Error(`Expected a list for ${label}`);
  const contents = value.slice(1, -1).trim();
  const items = value ? contents.split(",").filter((item) => item.length) : field.items;
  const result = items.map((item) => identifier(scalar(item), label));
  if (new Set(result).size !== result.length) throw new Error(`Repeated ${label}`);
  return result;
}

function inventory(repo: Repository, commit: string, selectors: string[], idField: string, noteField: string) {
  const artifacts = new Map<string, Artifact>();
  const files = repo.inventory(commit, selectors, false);
  const fields = new Set([idField, "status", "superseded_by", "supersedes", noteField]);
  for (const entry of files) {
    const { path } = entry;
    const names = [basename(path), basename(dirname(path))];
    const named = names.some((name) => /^[A-Z][A-Z-]*-[0-9]+(?:[-.]|$)/u.test(name));
    if (!/\.(md|yaml|yml)$/iu.test(path)) {
      if (!regular(entry) && (named || selectors.some((selector) =>
        selector === path || selector.startsWith(`${path}/`)))) {
        throw new Rejection(`Nonregular artifact path ${JSON.stringify(path)}`);
      }
      continue;
    }
    if (!regular(entry)) throw new Rejection(`Nonregular artifact path ${JSON.stringify(path)}`);
    let artifact: Artifact;
    try {
      const values = metadata(utf8(repo.blob(entry), "artifact"), path, fields);
      if (!named && !values.has(idField) && !selectors.includes(path)) continue;
      const id = identifier(scalar(values.get(idField)?.value ?? ""), "artifact ID");
      const status = scalar(values.get("status")?.value ?? "");
      if (!Object.hasOwn(transitions,status)) throw new Error("Invalid artifact status");
      artifact = {
        id, path, status, oid: entry.oid, mode: entry.mode,
        supersedes: references(values.get("supersedes"), "supersedes"),
        successors: references(values.get("superseded_by"), "superseded_by"),
        archiveNote: scalar(values.get(noteField)?.value ?? ""),
      };
    } catch {
      throw new Rejection(`Invalid artifact metadata in ${JSON.stringify(path)}`);
    }
    const other = artifacts.get(artifact.id);
    if (other) throw new Rejection(`Duplicate artifact ID ${artifact.id} in ${JSON.stringify(other.path)} and ${JSON.stringify(path)}`);
    artifacts.set(artifact.id, artifact);
  }
  return artifacts;
}

export function checkArtifacts(input: Record<string, unknown>, cwd: string) {
  onlyKeys(input, ["base", "candidate", "paths", "idField", "archiveNoteField", "archiveIdPrefixes", "retiredIds"]);
  const repo = new Repository(cwd);
  const base = repo.commit(input.base, "integration base");
  const candidate = repo.commit(input.candidate, "candidate");
  if (readGit(repo.root, ["merge-base", "--is-ancestor", base, candidate], "candidate base", [0, 1]).status) {
    throw new Rejection("Candidate does not contain the expected integration base");
  }
  const selectors = strings(input.paths, "artifact path").map((item) => gitPath(item, true));
  if (!selectors.length) throw new Error("Expected artifact paths");
  const idField = identifier(input.idField ?? "id", "identity field");
  const noteField = identifier(input.archiveNoteField ?? "archive_note", "archive note field");
  if (new Set([idField, noteField, "status", "supersedes", "superseded_by"]).size !== 5
      || ![idField, noteField].every((key) => /^[A-Za-z][A-Za-z_]*$/u.test(key))) {
    throw new Error("Invalid metadata field names");
  }
  const archiveKinds = strings(input.archiveIdPrefixes ?? [], "archive ID prefix");
  const retired = new Set(strings(input.retiredIds, "retired IDs").map((id) => identifier(id, "retired ID")));
  const previous = inventory(repo, base, selectors, idField, noteField);
  const next = inventory(repo, candidate, selectors, idField, noteField);
  if (!next.size) throw new Rejection("No artifacts found in the configured candidate namespace");

  const nextByPath = new Map([...next.values()].map((artifact) => [artifact.path, artifact]));

  for (const [id, old] of previous) {
    const current = next.get(id);
    const atSamePath = nextByPath.get(old.path);
    if (atSamePath && atSamePath.id !== id) throw new Rejection(`Artifact ID changed in ${JSON.stringify(old.path)}`);
    if ((old.status === "archived" || old.status === "superseded") &&
        (!current || current.path !== old.path || current.oid !== old.oid || current.mode !== old.mode)) {
      const label = old.status === "archived" ? "Archived artifact" : "Superseded artifact history";
      throw new Rejection(`${label} changed or disappeared: ${id}`);
    }
    if (current && current.path !== old.path && current.status !== old.status) {
      throw new Rejection(`Artifact moved while its lifecycle changed: ${id}`);
    }
    if (current && current.status !== old.status && !transitions[old.status].includes(current.status)) {
      throw new Rejection(`Invalid artifact transition ${old.status} -> ${current.status}: ${id}`);
    }
  }
  for (const [id, artifact] of next) {
    if (retired.has(id) && !previous.has(id)) throw new Rejection(`Reused retired artifact ID ${id}`);
    if (artifact.status === "archived" && previous.get(id)?.status !== "archived"
        && archiveKinds.some((prefix) => id.startsWith(prefix)) && !artifact.archiveNote.trim()) {
      throw new Rejection(`Archived artifact lacks its configured archive note: ${id}`);
    }
    if (artifact.status === "superseded") {
      if (!artifact.successors.length) throw new Rejection(`Superseded artifact lacks a successor: ${id}`);
      const pending = [...artifact.successors];
      const visited = new Set<string>();
      while (pending.length) {
        const successor = pending.pop()!;
        const target = next.get(successor);
        if (successor === id) throw new Rejection(`Supersession cycle reaches ${id}`);
        if (!target || target.status === "draft") throw new Rejection(`Missing or draft successor ${successor} for ${id}`);
        if (visited.has(successor)) continue;
        visited.add(successor);
        if (target.status === "superseded") pending.push(...target.successors);
      }
      for (const successor of artifact.successors) {
        if (!next.get(successor)!.supersedes.includes(id)) {
          throw new Rejection(`Successor ${successor} lacks reciprocal supersedes for ${id}`);
        }
      }
    }
  }
  return { candidate, artifacts: next.size };
}
