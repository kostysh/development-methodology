import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import packageInfo from "../../package.json" with { type: "json" };
import { issuedAlias } from "../metrics/events.js";
import { bindSession, withFlushLock } from "../metrics/binding.js";
import { appendJournal, readJournal } from "../metrics/journal.js";
import { mark } from "../metrics/operations.js";
import { readProfile } from "../metrics/profile.js";
import { summarize } from "../metrics/report.js";
import { configureNative, type Client } from "../metrics/setup.js";
import { importSpool, withSpool } from "../metrics/spool.js";
import { gitRoot, readProfile as recoveryProfile } from "../recovery/state.js";
import { prepareSkills, type Skills } from "./skills.js";
import { common, git, load, save } from "./store.js";

export type Setup = { repository: string; project: string; clients: Client[]; recovery: boolean; skills: Skills };
type Sessions = Partial<Record<Client, string>>;
type Task = { task: string; root: string; sessions: Sessions; started: boolean };
type Doctor = { client: Client; registered: boolean; command_available: boolean; session_selected: boolean; callback: string; last_observed_at: string | null };
type Closing = { accepted: boolean; doctors: Doctor[] };
type Incomplete = { status: "setup_cancelled"; accepted: false; task: string };
type Finished = Closing & { status: "finished"; summary: ReturnType<typeof summarize>; spool: ReturnType<typeof importSpool> };
const stateName = "assignment.json";
const profileName = "metrics.json";
const recoveryName = "recovery.json";

export function setup(home: string, value: Setup) {
  const path = join(home, "settings.json");
  if (existsSync(path)) {
    if (JSON.stringify(load(path)) !== JSON.stringify(value)) throw new Error("Coordinator settings differ. Use the existing settings or a new private directory.");
  } else {
    if (readdirSync(home).length) throw new Error("Choose an empty private coordinator directory.");
    save(path, value);
  }
  return { status: "configured", clients: value.clients, recovery: value.recovery, skills: value.skills.policy };
}

function exclusions(repo: string, recovery: boolean) {
  const info = join(repo, "info");
  if (!existsSync(info)) mkdirSync(info, { mode: 0o700 });
  const dir = openSync(info, constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const fd = openSync("/proc/self/fd/" + dir + "/exclude", constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      const file = fstatSync(fd);
      if (!file.isFile() || file.nlink !== 1 || file.size > 1024 * 1024) throw new Error("Unsafe Git exclude file.");
      const text = readFileSync(fd, "utf8");
      const patterns = ["/.methodology/operation-spool-*", ...(recovery ? ["/.methodology/task-state/"] : [])];
      const missing = patterns.filter(pattern => !text.split(/\r?\n/u).includes(pattern));
      if (missing.length) writeSync(fd, (text && !text.endsWith("\n") ? "\n" : "") + missing.join("\n") + "\n");
    } finally { closeSync(fd); }
  } finally { closeSync(dir); }
}

function sessionsFor(clients: Client[], raw: string[]) {
  const bindings: Sessions = {};
  for (const selector of raw) {
    const match = /^(codex|claude)=([A-Za-z0-9][A-Za-z0-9_.:-]{0,254})$/u.exec(selector);
    if (!match) throw new Error("Supply CLIENT=ID for every configured client.");
    const client = match[1] as Client;
    if (!clients.includes(client) || bindings[client]) throw new Error("Unexpected or duplicate client.");
    bindings[client] = match[2];
  }
  if (clients.some(client => !bindings[client])) throw new Error("A selected native session ID is missing.");
  return Object.fromEntries(clients.map(client => [client, bindings[client]])) as Sessions;
}

function doctor(profile: string, client: Client, probe: boolean): Doctor {
  const cmd = fileURLToPath(new URL("../metrics.js", import.meta.url));
  const result = spawnSync(process.execPath, [cmd, "doctor", profile, client, ...(probe ? ["--probe"] : [])], { encoding: "utf8", timeout: 10000 });
  if (result.status !== 0 && result.status !== 1) throw new Error("Cannot verify native registration. Check the trusted installation and retry.");
  const output = JSON.parse(result.stdout) as Doctor;
  return output;
}

const nextAction: Record<Client, string> = {
  codex: "Open the assigned Codex session in the trusted checkout. Inspect and trust the registered commands in /hooks (desktop: Settings > Hooks), then perform a tool action.",
  claude: "Approve folder trust in the assigned Claude Code session. In VS Code also trust the workspace and confirm Project local settings in /status. Perform a tool action.",
};

function taskDir(home: string, task: string) {
  if (!issuedAlias.test(task)) throw new Error("Use an issued task identifier of 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.");
  return join(home, "task-" + task);
}

function assignment(home: string, dir: string, settings: Setup, task: string, worktree?: string, selectors: string[] = []): Task {
  const path = join(dir, stateName);
  const old = existsSync(path) ? load<Task>(path) : undefined;
  if (old && worktree === undefined) return old;
  if (!worktree) throw new Error("Supply the task checkout and the selected session IDs on the first begin.");
  const root = realpathSync(worktree);
  if (gitRoot(root) !== root || common(root) !== settings.repository) throw new Error("Select a worktree root from the configured repository.");
  const sessions = sessionsFor(settings.clients, selectors);
  if (old) {
    if (root !== old.root || JSON.stringify(sessions) !== JSON.stringify(old.sessions)) throw new Error("This task already has a different worktree or session.");
    return old;
  }
  for (const other of readdirSync(home).filter(name => name.startsWith("task-"))) {
    const location = join(home, other);
    if (existsSync(join(location, "finished.json")) || !existsSync(join(location, stateName))) continue;
    const active = load<Task>(join(location, stateName));
    if (active.root === root || settings.clients.some(client => active.sessions[client] === sessions[client])) {
      throw new Error("An active task already owns this checkout or selected session. Use its begin or finish it first.");
    }
  }
  if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 });
  const value = { task, root, sessions, started: false };
  save(path, value);
  return value;
}

function issue(dir: string, settings: Setup, state: Task) {
  const path = join(dir, profileName);
  const task_id = state.task;
  if (!existsSync(path)) {
    save(path, { project_id: settings.project, project_root: state.root, identity_key: randomBytes(32).toString("hex"),
      issued_ids: [task_id], journal: "events.jsonl", sources: { owner: { kind: "task", task_id }, ops: { kind: "operation_spool", task_id },
        ...Object.fromEntries(settings.clients.map(client => [client, { kind: client + "_hook", task_id }])) },
      categories: { action_type: ["shell", "read", "edit", "other"], operation_type: ["rebase", "amend"], outcome: ["success", "failure", "cancelled", "skipped", "blocked"] } });
  }
  if (settings.recovery && !existsSync(join(dir, recoveryName))) {
    save(join(dir, recoveryName), { worktree: state.root, task_id, line_limit: 80, byte_limit: 8192 });
  }
}

export function begin(home: string, settings: Setup, task: string, worktree?: string, selectors?: string[]) {
  const dir = taskDir(home, task);
  if (existsSync(join(dir, "closing.json")) || existsSync(join(dir, "finished.json"))) throw new Error("This task is closing or finished.");
  const state = assignment(home, dir, settings, task, worktree, selectors);
  if (common(state.root) !== settings.repository) throw new Error("The task checkout no longer belongs to the configured repository.");
  if (settings.recovery) {
    const binary = spawnSync("methodology-recovery", ["--version"], { encoding: "utf8", timeout: 5000 });
    if (binary.status !== 0 || binary.stdout.trim() !== packageInfo.version) throw new Error("Put the matching methodology-recovery command on the trusted coordinator and client PATH.");
  }
  prepareSkills(settings.skills, state.root, settings.clients);
  if (!state.started) issue(dir, settings, state);
  const path = join(dir, profileName);
  const recovery = join(dir, recoveryName);
  const profile = readProfile(path);
  if (settings.recovery) recoveryProfile(recovery);
  exclusions(settings.repository, settings.recovery);
  if (settings.recovery) git(state.root, "check-ignore", "--quiet", "--", ".methodology/task-state/" + task + ".md");
  if (!state.started) withSpool(profile, "ops", true, storage => appendJournal(storage, [], []));
  for (const client of settings.clients) {
    configureNative(state.root, client, "metrics", path, true, client);
    bindSession(profile, client, state.sessions[client]!);
    if (settings.recovery) configureNative(state.root, client, "recovery", recovery, true, undefined, state.sessions[client]);
  }
  const doctors = settings.clients.map(client => doctor(path, client, !state.started));
  if (!state.started) {
    mark(profile, "owner", "task.started", "begin", {});
    save(join(dir, stateName), { ...state, started: true });
  }
  const pending = doctors.filter(d => d.callback !== "observed");
  return { status: pending.length ? "awaiting_callback" : "ready", task, metrics_profile: path, spool_source: "ops",
    recovery_profile: settings.recovery ? recovery : null, skills: settings.skills.policy, selected_skills: settings.skills.names, doctors,
    next: pending.length ? [...pending.map(d => nextAction[d.client]), "Check the trusted client PATH and rerun methodology-task begin " + task + " to verify the callback."] : [] };
}

function removeRoutes(settings: Setup, state: Task, dir: string) {
  const path = join(dir, profileName), recovery = join(dir, recoveryName);
  for (const client of settings.clients) {
    if (settings.recovery && existsSync(recovery)) configureNative(state.root, client, "recovery", recovery, false);
    if (existsSync(path)) configureNative(state.root, client, "metrics", path, false, client);
  }
}

export function finish(home: string, settings: Setup, task: string, accepted: boolean): Finished | Incomplete {
  const dir = taskDir(home, task);
  const finalPath = join(dir, "finished.json"), closing = join(dir, "closing.json");
  if (existsSync(finalPath)) {
    const final = load<Finished | Incomplete>(finalPath);
    if (accepted && !final.accepted) throw new Error("Task collection already finished without an acceptance receipt.");
    return final;
  }
  const assignmentPath = join(dir, stateName);
  if (!existsSync(assignmentPath)) throw new Error("Unknown task. Check the alias and coordinator directory.");
  const state = load<Task>(assignmentPath);
  if (common(state.root) !== settings.repository) throw new Error("Restore the task checkout before finishing collection.");
  if (!state.started) {
    if (accepted) throw new Error("Begin is incomplete. Retry begin, or finish without acceptance to release its registrations.");
    removeRoutes(settings, state, dir);
    const cancelled: Incomplete = { status: "setup_cancelled", task, accepted: false };
    save(finalPath, cancelled);
    return cancelled;
  }
  const path = join(dir, profileName);
  const profile = readProfile(path);
  const spool = importSpool(profile, "ops");
  const decision: Closing = existsSync(closing) ? load(closing) :
    { accepted, doctors: settings.clients.map(client => doctor(path, client, false)) };
  if (accepted && !decision.accepted) throw new Error("A previous finish did not request acceptance. Retry its original disposition.");
  save(closing, decision);
  removeRoutes(settings, state, dir);
  return withFlushLock(path, "exclusive", () => {
    if (decision.accepted) mark(profile, "owner", "task.accepted", "finish", {});
    const now = new Date().toISOString();
    const summary = summarize(readJournal(profile, now), task, now, profile.coverage, new Set());
    const final: Finished = { status: "finished", ...decision, spool, summary };
    save(finalPath, final);
    return final;
  });
}
