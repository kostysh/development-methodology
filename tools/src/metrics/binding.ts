import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { recordObject } from "./events.js";
import type { MetricsProfile, MetricsSource } from "./profile.js";

const prefix = "methodology-bind ";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Binding = { project: string; task: string; pending?: string; until?: number;
  session?: string; path?: string; offset?: number };

function withBinding<T>(profile: MetricsProfile, sourceId: string,
  work: (prior: Binding | undefined, save: (state: Binding) => void) => T): T {
  const path = profile.journal + ".bindings";
  const dir = openSync(dirname(path), "r");
  try {
    if (spawnSync("flock", ["-x", "-w", "2", "3"], { stdio: ["ignore", "ignore", "ignore", dir] }).status !== 0) {
      throw new Error("journal_lock_busy");
    }
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 2 * 1024 * 1024)) {
      throw new Error("journal_permissions");
    }
    const states: Record<string, Binding> = Object.assign(Object.create(null), info ? JSON.parse(readFileSync(path, "utf8")) : {});
    return work(states[sourceId], state => {
      if (state.session) {
        for (const [otherId, other] of Object.entries(profile.sources)) {
          if (otherId === sourceId || other.kind !== profile.sources[sourceId].kind) continue;
          if (other.session_id === state.session) throw new Error("session_already_bound");
          // A task switch consumes the previous source's active binding.
          if (states[otherId]?.session === state.session) delete states[otherId];
        }
      }
      states[sourceId] = state;
      const temp = path + "." + randomUUID();
      writeFileSync(temp, JSON.stringify(states), { flag: "wx", mode: 0o600 });
      renameSync(temp, path);
    });
  } finally { closeSync(dir); }
}

export function armSession(profile: MetricsProfile, id: string): string {
  const source = profile.sources[id];
  if (!source?.task_id || !["codex_hook", "claude_hook"].includes(source.kind) || source.session_id) {
    throw new Error("invalid_arguments");
  }
  const token = randomBytes(24).toString("hex");
  withBinding(profile, id, (_prior, save) => save({ task: source.task_id!, project: profile.projectRoot,
    pending: hash(token), until: Date.now() + 10 * 60_000 }));
  return prefix + token;
}

export function boundHook(profile: MetricsProfile, id: string, raw: unknown): MetricsSource | undefined {
  const source = profile.sources[id];
  if (source.session_id) return source;
  const row = recordObject(raw);
  if (!source.task_id || !row || typeof row.session_id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/u.test(row.session_id)) return;
  const session = row.session_id;
  return withBinding(profile, id, (state, save) => {
    if (!state || state.task !== source.task_id || state.project !== profile.projectRoot) return;
    if (state.session === session) return { ...source, session_id: session, path: state.path, offset: state.offset };
    if (!state.pending || (state.until ?? 0) < Date.now() || row.hook_event_name !== "UserPromptSubmit" ||
        typeof row.prompt !== "string" || !row.prompt.startsWith(prefix) ||
        hash(row.prompt.trimEnd().slice(prefix.length)) !== state.pending) return;
    if (typeof row.cwd !== "string") return;
    const rel = relative(profile.projectRoot, realpathSync(row.cwd));
    if (isAbsolute(rel) || rel.split(sep)[0] === "..") return;
    const path = typeof row.transcript_path === "string" && isAbsolute(row.transcript_path)
      ? resolve(row.transcript_path) : undefined;
    if (source.path && path !== source.path) return;
    let offset = 0;
    if (path && lstatSync(path, { throwIfNoEntry: false })) {
      if (realpathSync(path) !== path) throw new Error("unsafe_hook_settings");
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const info = fstatSync(fd);
        if (!info.isFile() || info.nlink !== 1) throw new Error("unsafe_hook_settings");
        offset = info.size;
      } finally { closeSync(fd); }
    }
    save({ project: state.project, task: state.task, session, path, offset });
    return;
  });
}
