import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { recordObject } from "./events.js";
import type { MetricsProfile, MetricsSource } from "./profile.js";

const sessionId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/u;
type Binding = { project: string; task: string; observed?: number; started?: boolean;
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

export function bindSession(profile: MetricsProfile, id: string, session: string) {
  const source = profile.sources[id];
  if (!source?.task_id || !["codex_hook", "claude_hook"].includes(source.kind) || source.session_id ||
      !sessionId.test(session)) throw new Error("invalid_arguments");
  withBinding(profile, id, (prior, save) => {
    if (prior?.project === profile.projectRoot && prior?.task === source.task_id && prior.session === session) return;
    save({ task: source.task_id!, project: profile.projectRoot, session });
  });
}

export function observation(profile: MetricsProfile, id: string, reset: boolean) {
  const source = profile.sources[id];
  return withBinding(profile, id, (prior, save) => {
    const state = prior?.task === source.task_id && prior?.project === profile.projectRoot &&
      (!source.session_id || prior?.session === source.session_id) ? prior : undefined;
    if (reset && state?.observed) save({ ...state, observed: undefined });
    return { selected: !!(source.session_id || state?.session), observed: reset ? undefined : state?.observed };
  });
}

export function boundHook(profile: MetricsProfile, id: string, raw: unknown, fromClient: boolean, deferred: boolean): MetricsSource | undefined {
  const source = profile.sources[id];
  const row = recordObject(raw);
  if (!source.task_id || !row || typeof row.session_id !== "string" || !sessionId.test(row.session_id)) return;
  const session = row.session_id;
  // The deferred worker can only reuse a previously observed binding. It must
  // never create a new binding or attest that the client just called a hook.
  if (!deferred) {
    if (typeof row.cwd !== "string" || !isAbsolute(row.cwd)) return;
    const rel = relative(profile.projectRoot, realpathSync(row.cwd));
    if (isAbsolute(rel) || rel.split(sep)[0] === "..") return;
  }
  return withBinding(profile, id, (prior, save) => {
    let state = prior && prior.task === source.task_id && prior.project === profile.projectRoot ? prior : undefined;
    if (source.session_id) {
      if (source.session_id !== session) return;
      if (state?.session !== session) state = { project: profile.projectRoot, task: source.task_id!, session };
      if (fromClient && !deferred) save({ ...state, observed: Date.now() });
      return source;
    }
    if (state?.session !== session) return;
    if (!state.started && state.offset === undefined) {
      if (deferred) return;
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
      state = { ...state, path, offset, started: true };
      save(state);
    }
    if (fromClient && !deferred) save({ ...state, observed: Date.now() });
    return { ...source, session_id: session, path: state.path, offset: state.offset };
  });
}
