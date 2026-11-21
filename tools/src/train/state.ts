import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { BranchPolicy, Config } from "./config.js";
import type { Receipt } from "./engine.js";

export function read<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
export function save(path: string, value: unknown) {
  const temp = path + "." + randomUUID() + ".tmp";
  const fd = openSync(temp, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  const dir = openSync(join(path, ".."), "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
function tryFlock(fd: number, shared: boolean) {
  const r = spawnSync("flock", [shared ? "-sn" : "-xn", "-E", "75", "3"], {stdio:["ignore","ignore","ignore",fd]});
  if (r.status === 0) return Object.assign(() => closeSync(fd), {fd});
  closeSync(fd);
  if (r.status === 75) return;
  throw new Error("Cannot acquire file lock");
}
export function lock(path: string) {
  return tryFlock(openSync(path, "a", 0o600),false);
}
export class AuthorityBusy extends Error {
  constructor() { super("Decision authority busy; retry"); }
}
export function authorityLock(path: string, shared: boolean) {
  const fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  const release = tryFlock(fd,shared);
  if (!release) throw new AuthorityBusy();
  try {
    const file = fstatSync(fd), named = lstatSync(path);
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o022) || file.dev !== named.dev || file.ino !== named.ino)
      throw new Error("Trusted stable authority lock file required");
    return release;
  } catch (error) { release(); throw error; }
}
export function receipt(config: Config): Receipt {
  const id = randomUUID();
  return { id, started: new Date().toISOString(), result: "running", mode: config.mode, branchPolicy: config.branchPolicy ?? "rulesets", integrated: [], proposed: [],
    excluded: [], queue: [], queueWaitMs: 0, selected: [], incidents: [], decisions: [], flakes: [], attempts: [], recovery: [],
    log: join(config.stateDir, "runs", id + ".json") };
}
export function history(config: Config): Receipt[] {
  const dir = join(config.stateDir, "runs");
  mkdirSync(dir, {recursive: true, mode: 0o700});
  return readdirSync(dir).filter(p => /^[a-f\d-]{36}\.json$/.test(p)).map(p => read<Receipt>(join(dir,p)))
    .sort((a,b) => a.started.localeCompare(b.started));
}
export type Pending = { run: string; base: string; candidate: string; tree: string; branchPolicy?: BranchPolicy; published?: boolean;
  included: {pr: number; head: string; ref?: string}[]; excluded: number[]; deployment: string | null };
export type State = { repository: string; branch: string; admitted: Record<string,{head: string; at: number}>;
  pending?: Pending; resource?: string; expectedBase?: string };
export function load(c: Config): State {
  const path = join(c.stateDir, "state.json");
  const s = existsSync(path) ? read<State>(path) : { repository: c.repository, branch: c.branch, admitted: {} };
  if (s.repository !== c.repository || s.branch !== c.branch) throw new Error("State belongs to another train");
  return s;
}
