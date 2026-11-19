import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { parseUtc, recordObject } from "../metrics/events.js";
import { readGit } from "./git.js";
import { readGithub, type GithubSelection } from "./snapshot-github.js";

type ResourceSelection = { type: string; id: string; record: string };

export type SnapshotProfile = {
  task_id: string;
  worktree: string;
  base_ref?: string;
  github?: GithubSelection;
  resources?: ResourceSelection[];
};

function gitText(cwd: string, ...args: string[]): string | null {
  const bytes = readGit(cwd, args);
  try {
    return bytes && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\n$/u, "");
  } catch {
    return null;
  }
}

function commitOid(cwd: string, ref: string): string | null {
  const value = gitText(cwd, "rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`);
  return value !== null && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value) ? value : null;
}

function changes(cwd: string) {
  const data = readGit(cwd, ["status", "--porcelain=v2", "-z", "--renames",
    "--untracked-files=all", "--ignore-submodules=none"]);
  if (data === null) return null;
  const rows = data.toString("latin1").split("\0");
  if (rows.pop() !== "") return null;
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let unmerged = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    switch (row[0]) {
      case "1":
      case "2":
        if (row[2] !== ".") staged++;
        if (row[3] !== ".") unstaged++;
        if (row[0] === "2" && !rows[++index]) return null;
        break;
      case "u": unmerged++; break;
      case "?": untracked++; break;
      default: return null;
    }
  }
  return { staged, unstaged, untracked, unmerged };
}

function gitState({ worktree, base_ref }: SnapshotProfile, gaps: string[]) {
  const head_oid = commitOid(worktree, "HEAD");
  const headRef = gitText(worktree, "symbolic-ref", "--quiet", "HEAD");
  const branch = headRef?.replace(/^refs\/heads\//u, "") ?? null;
  const detached = branch !== null ? false : head_oid !== null
    && gitText(worktree, "rev-parse", "--symbolic-full-name", "HEAD") === "HEAD" ? true : null;
  if (head_oid === null) gaps.push("git.head_oid");
  if (detached === null) gaps.push("git.branch");

  const base_oid = base_ref === undefined ? null : commitOid(worktree, base_ref);
  if (base_ref !== undefined && base_oid === null) gaps.push("git.base_oid");

  let upstream_ref = null;
  if (headRef !== null) {
    const refs = gitText(worktree, "for-each-ref", "--format=%(refname)%00%(upstream)", "--", headRef);
    if (refs === null) gaps.push("git.upstream_ref");
    upstream_ref = refs?.split("\n").find((row) => row.startsWith(headRef + "\0"))?.slice(headRef.length + 1) || null;
    // An unborn branch has no local ref entry, but its upstream can still resolve.
    if (upstream_ref === null && head_oid === null) {
      const resolved = gitText(worktree, "rev-parse", "--verify", "--quiet", "--symbolic-full-name", "--end-of-options", "@{upstream}");
      if (resolved?.startsWith("refs/")) upstream_ref = resolved;
    }
  }
  const upstream_oid = upstream_ref === null ? null : commitOid(worktree, upstream_ref);
  if (upstream_ref !== null && upstream_oid === null) gaps.push("git.upstream_oid");

  let ahead = null;
  let behind = null;
  if (head_oid !== null && upstream_oid !== null) {
    const counts = gitText(worktree, "rev-list", "--left-right", "--count", `${head_oid}...${upstream_oid}`, "--");
    if (counts !== null && /^\d+\t\d+$/u.test(counts)) {
      [ahead, behind] = counts.split("\t").map(Number);
    } else gaps.push("git.ahead_behind");
  }

  const counts = changes(worktree);
  if (counts === null) gaps.push("git.changes");
  return { worktree, branch, detached, head_oid, base_ref, base_oid: base_ref === undefined ? undefined : base_oid,
    upstream_ref, upstream_oid, ahead, behind,
    changes: counts ?? { staged: null, unstaged: null, untracked: null, unmerged: null } };
}

function readSmallText(path: string): string | null {
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd);
      const limit = 64 * 1024;
      if (!stat.isFile() || stat.size > limit) return null;
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) {
        const bytes = readSync(fd, buffer, size, buffer.length - size, null);
        if (bytes === 0) {
          return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
        }
        size += bytes;
      }
      return null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function processMatches(record: Record<string, unknown>): boolean {
  const { pid, boot_id, start_ticks } = record;
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1
      || typeof start_ticks !== "number" || !Number.isSafeInteger(start_ticks) || start_ticks < 1
      || typeof boot_id !== "string" || !/^[0-9a-f-]{36}$/u.test(boot_id)
      || readSmallText("/proc/sys/kernel/random/boot_id")?.trim() !== boot_id) return false;
  const stat = readSmallText(`/proc/${pid}/stat`);
  const endOfName = stat?.lastIndexOf(") ") ?? -1;
  if (!stat?.startsWith(`${pid} (`) || endOfName < 0) return false;
  // The process name can contain spaces and parentheses. Field 22 follows the name.
  const fields = stat.slice(endOfName + 2).trim().split(/\s+/u);
  return /^[A-Za-z]$/u.test(fields[0]) && !/^[ZxX]$/u.test(fields[0]) && fields[19] === String(start_ticks);
}

function resourceState(selection: ResourceSelection, task: string, now: number, gaps: string[]) {
  const { type, id, record } = selection;
  const json = readSmallText(record);
  let value: Record<string, unknown> | undefined;
  try {
    value = json === null ? undefined : recordObject(JSON.parse(json));
  } catch {
    // Only a recognized record may establish ownership.
  }
  const gap = `resources.${id}`;
  if (value?.task_id !== task || value.type !== type || value.id !== id) {
    gaps.push(`${gap}.state`);
    return { type, id, state: null };
  }
  const state = value.state === "released" || (value.state === "active" && (type !== "process" || processMatches(value)))
    ? value.state : null;
  const expires_at = value.expires_at === undefined ? undefined : parseUtc(value.expires_at);
  if (state === null) gaps.push(`${gap}.state`);
  if (expires_at === null) gaps.push(`${gap}.expires_at`);
  const lease_remaining_seconds = expires_at === undefined ? undefined
    : expires_at === null ? null : state === "released" ? 0 : Math.max(0, (Date.parse(expires_at) - now) / 1000);
  return { type, id, state, expires_at, lease_remaining_seconds };
}

export function snapshot(profile: SnapshotProfile) {
  const gaps: string[] = [];
  const git = gitState(profile, gaps);
  const github = profile.github === undefined ? null : readGithub(profile.github, profile.worktree, git, gaps);
  const now = Date.now();
  const resources = profile.resources?.map((entry) => resourceState(entry, profile.task_id, now, gaps)) ?? [];
  return { task_id: profile.task_id, observed_at: new Date(now).toISOString(), git, github, resources, gaps };
}
