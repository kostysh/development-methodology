import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { utf8 } from "./git.js";
import { object, type Baseline } from "./manifest.js";

function invalidPatch(): never {
  throw new Error("Malformed or unsupported single-environment apply_patch request");
}

// Interpret only raw local hunks. Keep body lines separate from headers, including
// header-like text in context lines. The host trims Unicode whitespace at header ends.
function patchTargets(command: unknown): string[] {
  if (typeof command !== "string" || !command.isWellFormed()) invalidPatch();
  const raw = command.split(/\r?\n/);
  const hasText = (line: string) => /\P{White_Space}/u.test(line);
  const first = raw.findIndex(hasText);
  const last = raw.findLastIndex(hasText);
  if (first < 0 || !/^\p{White_Space}*\*\*\* Begin Patch\p{White_Space}*$/u.test(raw[first])
      || !/^\p{White_Space}*\*\*\* End Patch\p{White_Space}*$/u.test(raw[last])) invalidPatch();
  const lines = raw.slice(first + 1, last);

  const targets: string[] = [];
  let i = 0;
  const header = () => lines[i]?.replace(/\p{White_Space}+$/u, "") ?? "";
  while (i < lines.length) {
    const line = header();
    const kind = ["Add File", "Delete File", "Update File"].find((k) => line.startsWith(`*** ${k}: `));
    if (!kind) invalidPatch();
    targets.push(line.slice(`*** ${kind}: `.length));
    i++;
    if (kind === "Add File") {
      while (lines[i]?.startsWith("+")) i++;
    } else if (kind === "Update File") {
      if (header().startsWith("*** Move to: ")) {
        targets.push(header().slice("*** Move to: ".length));
        i++;
      }
      let hasLine = false;
      let atEndOfFile = false;
      while (i < lines.length) {
        const marker = header();
        if (marker === "*** End of File") {
          if (!hasLine || atEndOfFile) invalidPatch();
          atEndOfFile = true;
        } else if (lines[i].startsWith("*** ")) {
          break;
        } else if (marker === "@@" || marker.startsWith("@@ ")) {
          // A context marker must be followed by a change or context line.
          const next = lines[i + 1];
          if (next === undefined || next !== "" && !/^[ +\-]/.test(next)) invalidPatch();
          hasLine = false;
          atEndOfFile = false;
        } else if ((lines[i] === "" || /^[ +\-]/.test(lines[i])) && !atEndOfFile) {
          hasLine = true;
        } else {
          invalidPatch();
        }
        i++;
      }
      if (!hasLine) invalidPatch();
    }
  }
  if (!targets.length) invalidPatch();
  return targets;
}

function within(path: string, base: string): boolean {
  const part = relative(base, path);
  return part !== ".." && !part.startsWith("../");
}

// Resolve each existing component before interpreting the next '..'. A missing
// component permits a new leaf. A dangling link or non-directory parent is ambiguous.
function physicalPath(path: string): string {
  let current = "/";
  let directory = true;
  try {
    for (const part of path.split("/")) {
      if (!part) continue;
      if (!directory) throw new Error();
      if (part === ".") continue;
      if (part === "..") {
        current = dirname(current);
        continue;
      }
      current = join(current, part);
      const info = lstatSync(current, { throwIfNoEntry: false });
      if (info?.isSymbolicLink()) {
        current = utf8(realpathSync.native(current, { encoding: "buffer" }), "resolved path");
        directory = statSync(current).isDirectory();
      } else {
        directory = !info || info.isDirectory();
      }
    }
    return current;
  } catch {
    throw new Error(`Cannot resolve path ${JSON.stringify(path)}`);
  }
}

function localPath(value: unknown): value is string {
  return typeof value === "string" && !!value && value.isWellFormed() && !value.includes("\0");
}

export function inspectHook(host: string, configuredRoot: string, root: string, baseline: Baseline, event: unknown) {
  if (!object(event) || event.hook_event_name !== "PreToolUse" || !object(event.tool_input)) {
    throw new Error("Expected a PreToolUse tool input");
  }
  const cwd = event.cwd;
  if (!localPath(cwd) || !isAbsolute(cwd)) throw new Error("Expected an absolute hook cwd");
  const allowedRoots = [resolve(configuredRoot), root];
  if (!allowedRoots.some((base) => within(resolve(cwd), base))
      || !within(physicalPath(cwd), root) || !statSync(cwd).isDirectory()) {
    throw new Error("Hook cwd is outside the configured worktree or is not a directory");
  }

  const targets: unknown[] = host === "codex" && event.tool_name === "apply_patch"
    ? patchTargets(event.tool_input.command)
    : host === "claude" && (event.tool_name === "Edit" || event.tool_name === "Write")
      ? [event.tool_input.file_path]
      : [];
  if (!targets.length) throw new Error("Unsupported host or tool in hook request");

  const protectedPaths = new Set<string>();
  for (const path of [baseline.manifest.path, ...baseline.paths, ...baseline.entries.map((e) => e.path)]) {
    const absolute = join(root, path.replace(/\/$/, ""));
    protectedPaths.add(absolute);
    protectedPaths.add(physicalPath(absolute));
  }
  for (const target of targets) {
    if (!localPath(target) || host === "claude" && !isAbsolute(target)) throw new Error("Invalid hook target path");
    const raw = isAbsolute(target) ? target : `${cwd}/${target}`;
    const normalized = resolve(raw);
    const base = allowedRoots.find((base) => within(normalized, base));
    if (!base) throw new Error(`Target outside worktree ${JSON.stringify(target)}`);
    const lexical = join(root, relative(base, normalized));
    const interpretations = new Set([lexical, physicalPath(normalized), physicalPath(raw)]);
    for (const path of interpretations) {
      if (!within(path, root) || relative(root, path).split("/").includes(".git")) {
        throw new Error(`Target outside worktree files ${JSON.stringify(target)}`);
      }
      for (const protectedPath of protectedPaths) {
        if (within(path, protectedPath) || within(protectedPath, path)) {
          throw new Error(`Protected target ${JSON.stringify(relative(root, path) || ".")}`);
        }
      }
    }
  }
}
