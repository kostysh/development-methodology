import { isDeepStrictEqual } from "node:util";
import { byteOrder, gitPath, regular, Repository, utf8, type Entry } from "./git.js";

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJson(bytes: Buffer, label: string): unknown {
  try {
    const text = utf8(bytes, label);
    const value: unknown = JSON.parse(text);
    // JSON.parse keeps the last duplicate field. A host or a reviewer may read
    // the first instead, so reject ambiguous objects even when both values match.
    const fields: Set<string>[] = [];
    for (const token of text.matchAll(/([{}])|("(?:[^"\\]|\\.)*")(\s*:)?/gu)) {
      if (token[1] === "{") fields.push(new Set());
      else if (token[1] === "}") fields.pop();
      else if (token[3]) {
        const key: string = JSON.parse(token[2]);
        const current = fields.at(-1)!;
        if (current.has(key)) throw new Error();
        current.add(key);
      }
    }
    return value;
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
}

export function freeze(repo: Repository, source: string, selectors: unknown[]) {
  if (!selectors.length) throw new Error("Expected at least one protected path");
  const paths = [...new Set(selectors.map((path) => gitPath(path, true)))].sort(byteOrder);
  return { version: 1, source, paths, entries: repo.inventory(source, paths, true) };
}

export function loadBaseline(repo: Repository, baseline: string, path: string) {
  gitPath(path);
  const entry = repo.lookup(baseline, path);
  if (!entry || entry.path !== path || !regular(entry)) {
    throw new Error(`Expected a regular baseline manifest at ${JSON.stringify(path)}`);
  }
  repo.checkBlobs([entry]);
  const value = readJson(repo.blob(entry), `manifest ${JSON.stringify(path)}`);
  if (!object(value) || !Array.isArray(value.paths) || value.version !== 1) {
    throw new Error(`Invalid manifest schema at ${JSON.stringify(path)}`);
  }
  const source = repo.commit(value.source, "source");
  const expected = freeze(repo, source, value.paths);
  if (!isDeepStrictEqual(value, expected)) {
    throw new Error(`Manifest disagrees with source inventory at ${JSON.stringify(path)}`);
  }
  if (expected.paths.some((selector) => path === selector || selector.endsWith("/") && path.startsWith(selector))) {
    throw new Error(`Manifest inside protected selection at ${JSON.stringify(path)}`);
  }
  const current = repo.inventory(baseline, expected.paths, true);
  if (!isDeepStrictEqual(current, expected.entries)) throw new Error("Baseline inventory disagrees with source");
  return { ...expected, manifest: entry };
}

export type Baseline = ReturnType<typeof loadBaseline>;

export function changes(repo: Repository, baseline: Baseline, candidate: string): string[] {
  const expected = new Map([...baseline.entries, baseline.manifest].map((entry) => [entry.path, entry]));
  const observed = repo.inventory(candidate, [...baseline.paths, baseline.manifest.path], false);
  const actual = new Map(observed.map((entry) => [entry.path, entry]));
  const changed: string[] = [];
  const paths = new Set([...expected.keys(), ...actual.keys()]);
  for (const path of [...paths].sort(byteOrder)) {
    const before: Entry | undefined = expected.get(path);
    const after = actual.get(path);
    let reason: string;
    if (!before) reason = "Added protected path";
    else if (!after) reason = "Missing protected path";
    else if (before.mode !== after.mode) reason = "Changed protected file mode or type";
    else if (before.oid !== after.oid) reason = "Changed protected content";
    else continue;
    changed.push(`${reason} ${JSON.stringify(path)}`);
  }
  return changed;
}
