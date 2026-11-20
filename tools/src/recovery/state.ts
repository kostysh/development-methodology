import { randomUUID } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { recordObject } from "../metrics/events.js";
import { readGit } from "./git.js";
import type { SnapshotProfile } from "./snapshot.js";

type Profile = SnapshotProfile & { line_limit: number; byte_limit: number };
// Existing profiles accepted whole 384 KiB atomic writes. New profiles set
// their own smaller budget for material injected into the agent context.
const maximumByteLimit = 512 * 1024;
const alias = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const privateRead = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export class StateError extends Error {}

function invalidProfile(): never {
  throw new Error("invalid_profile");
}

export function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

export function gitRoot(cwd: string): string | undefined {
  return readGit(cwd, ["rev-parse", "--show-toplevel"])?.toString("utf8").replace(/\n$/u, "");
}

export function readProfile(path: string): Profile {
  const fullPath = realpathSync.native(path);
  const fd = openSync(fullPath, privateRead);
  let data: Record<string, unknown> | undefined;
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 1024 * 1024 || (info.mode & 0o022) !== 0) invalidProfile();
    data = recordObject(JSON.parse(readFileSync(fd, "utf8")));
  } finally {
    closeSync(fd);
  }
  if (!data || typeof data.worktree !== "string" || !isAbsolute(data.worktree)
      || typeof data.task_id !== "string" || !alias.test(data.task_id) || data.task_id.length > 252
      || !Number.isSafeInteger(data.line_limit) || Number(data.line_limit) < 1) invalidProfile();
  const worktree = realpathSync.native(data.worktree);
  if (gitRoot(worktree) !== worktree || within(worktree, fullPath) || within(worktree, path)) invalidProfile();
  const byteLimit = data.byte_limit === undefined ? maximumByteLimit : data.byte_limit;
  if (typeof byteLimit !== "number" || !Number.isSafeInteger(byteLimit)
      || byteLimit < 1 || byteLimit > maximumByteLimit) invalidProfile();
  const profile: Profile = { task_id: data.task_id, worktree, line_limit: Number(data.line_limit), byte_limit: byteLimit };
  if (data.base_ref !== undefined) {
    if (typeof data.base_ref !== "string" || !data.base_ref || /[\x00-\x1f\x7f]/u.test(data.base_ref)) invalidProfile();
    profile.base_ref = data.base_ref;
  }
  if (data.github !== undefined) {
    const gh = recordObject(data.github);
    if (!gh || typeof gh.repository !== "string" || !/^[a-z\d_.-]+\/[a-z\d_.-]+$/iu.test(gh.repository)
        || gh.repository.split("/").some((name) => name === "." || name === "..")) invalidProfile();
    profile.github = { repository: gh.repository };
    for (const key of ["issue", "pr", "run"] as const) {
      if (gh[key] === undefined) continue;
      if (!Number.isSafeInteger(gh[key]) || Number(gh[key]) <= 0) invalidProfile();
      profile.github[key] = Number(gh[key]);
    }
  }
  if (data.resources !== undefined) {
    if (!Array.isArray(data.resources)) invalidProfile();
    const seen = new Set<string>();
    profile.resources = data.resources.map((entry: unknown) => {
      const row = recordObject(entry);
      if (!row || typeof row.id !== "string" || !alias.test(row.id) || typeof row.type !== "string" || !alias.test(row.type)
          || typeof row.record !== "string" || !isAbsolute(row.record) || seen.has(row.id)) invalidProfile();
      seen.add(row.id);
      return { id: row.id, type: row.type, record: row.record };
    });
  }
  return profile;
}

/** Read one extra byte to detect excess input without allocating the whole file or stream. */
export function readBoundedState(fd: number, limit: number): Buffer {
  const bytes = Buffer.alloc(limit + 1);
  let length = 0;
  while (length <= limit) {
    const count = readSync(fd, bytes, length, bytes.length - length, null);
    if (!count) return bytes.subarray(0, length);
    length += count;
  }
  throw new StateError("state_exceeds_byte_limit");
}

function decode(bytes: Buffer, limit: number): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new StateError("invalid_utf8");
  }
  if (!text.trim()) throw new StateError("empty_state");
  let lines = text.endsWith("\n") ? 0 : 1;
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) {
    if (++lines > limit) throw new StateError("state_exceeds_line_limit");
  }
  return text;
}

// Pin each Linux directory while descending. Reads and atomic renames then
// use the same opened directory even if its name is concurrently replaced.
function withState<T>(profile: Profile, writing: boolean, use: (dir: string, file: string) => T): T {
  const name = profile.task_id + ".md";
  const relativePath = ".methodology/task-state/" + name;
  const indexed = readGit(profile.worktree, ["ls-files", "--stage", "-z", "--", relativePath]);
  if (!indexed || indexed.length || !readGit(profile.worktree, ["check-ignore", "--quiet", "--", relativePath])) {
    throw new StateError("state_must_be_untracked_and_ignored");
  }
  const handles: number[] = [];
  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const pin = (path: string): string => {
    const fd = openSync(path, flags);
    handles.push(fd);
    return `/proc/self/fd/${fd}`;
  };
  try {
    let dir = pin(profile.worktree);
    for (const name of [".methodology", "task-state"]) {
      const next = join(dir, name);
      if (writing) {
        try { mkdirSync(next, { mode: 0o700 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      }
      dir = pin(next);
    }
    return use(dir, join(dir, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StateError("missing_state");
    if (error instanceof StateError) throw error;
    throw new StateError("state_unavailable");
  } finally {
    for (const fd of handles.reverse()) closeSync(fd);
  }
}

export function writeState(profile: Profile, bytes: Buffer): void {
  if (bytes.length > profile.byte_limit) throw new StateError("state_exceeds_byte_limit");
  decode(bytes, profile.line_limit);
  withState(profile, true, (dir, file) => {
    const prior = lstatSync(file, { throwIfNoEntry: false });
    if (prior && (!prior.isFile() || prior.nlink !== 1)) throw new StateError("unsafe_state_file");
    const temporary = join(dir, `.state-${randomUUID()}.tmp`);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      try { writeFileSync(fd, bytes); fsyncSync(fd); }
      finally { closeSync(fd); }
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  });
}

export function readState(profile: Profile): string {
  return withState(profile, false, (_dir, file) => {
    const fd = openSync(file, privateRead);
    try {
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0) throw new StateError("unsafe_state_file");
      return decode(readBoundedState(fd, profile.byte_limit), profile.line_limit);
    } finally {
      closeSync(fd);
    }
  });
}
