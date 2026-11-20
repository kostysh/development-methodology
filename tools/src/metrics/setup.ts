import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { recordObject } from "./events.js";
import type { MetricsProfile } from "./profile.js";

export type Client = "codex" | "claude";
type Role = "metrics" | "recovery";
export type Route = { role: Role; root: string; profile: string; source?: string; session?: string; installed: number };
type Owner = { original: string | null; last: string | null; routes: Route[] };
function bad(): never { throw new Error("unsafe_hook_settings"); }
const parse = (bytes: string | null) => recordObject(JSON.parse(bytes ?? "{}")) ?? bad();
const format = (config: object) => JSON.stringify(config, null, 2) + "\n";
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function git(root: string, ...args: string[]) {
  const cmd = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 });
  if (cmd.status !== 0) throw new Error("hook_project_requires_git");
  return cmd.stdout.trimEnd();
}

function locations(root: string, client: Client) {
  const common = realpathSync(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  let layer = root;
  if (client === "codex") {
    const [main, ...fields] = git(root, "worktree", "list", "--porcelain", "-z").split("\0");
    if (!main.startsWith("worktree ") || fields[0] === "bare") bad();
    layer = join(realpathSync(main.slice(9)), relative(git(root, "rev-parse", "--show-toplevel"), root));
  }
  const folder = client === "codex" ? ".codex" : ".claude";
  const file = join(layer, folder, client === "codex" ? "hooks.json" : "settings.local.json");
  const key = createHash("sha256").update(file).digest("hex");
  return { file, local: join(root, folder), common, state: join(common, "methodology-hooks-" + key + ".json") };
}

function bytes(path: string, privateFile = false): string | null {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return null;
  if (!info.isFile() || info.nlink !== 1 || info.size > (privateFile ? 16 : 1) * 1024 * 1024 ||
      (privateFile && (info.mode & 0o077) !== 0)) bad();
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
}

function replace(path: string, before: string | null, after: string | null, privateFile = false) {
  function checkCurrent() {
    if (bytes(path, privateFile) !== before) throw new Error("hook_settings_changed");
  }
  checkCurrent();
  if (before === after) return;
  if (after === null) { unlinkSync(path); return; }
  const tmp = join(dirname(path), ".methodology-" + randomUUID());
  try {
    writeFileSync(tmp, after, { flag: "wx", mode: lstatSync(path, { throwIfNoEntry: false })?.mode ?? 0o600 });
    checkCurrent();
    renameSync(tmp, path);
  } finally { if (existsSync(tmp)) unlinkSync(tmp); }
}

function ensureDirectory(path: string) {
  if (!lstatSync(path, { throwIfNoEntry: false })) mkdirSync(path, { mode: 0o700 });
  if (realpathSync(path) !== path || !lstatSync(path).isDirectory()) bad();
}

function events(role: Role, client: Client) {
  return role === "recovery" ? ["SessionStart"] : [
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", ...(client === "claude" ? ["PostToolUseFailure"] : []),
    "PostCompact", "Stop", "SessionEnd",
  ];
}

const group = (role: Role, command: string) => ({
  ...(role === "recovery" ? { matcher: "compact" } : {}), hooks: [{ type: "command", command }],
});
const command = (role: Role, client: Client) => "methodology-" + role + " dispatch-hook " + client;
const quote = (arg: string) => "'" + arg.replaceAll("'", "'\\''") + "'";

// v5.0.0 wrote four fully shell-quoted arguments and the executable. Remove
// only its exact single-handler group for this profile/source, including when
// the previous Node installation no longer exists.
function legacy(value: unknown, route: Route) {
  if (route.role !== "metrics") return false;
  const items = recordObject(value)?.hooks;
  const cmd = Array.isArray(items) && recordObject(items[0])?.command;
  if (typeof cmd !== "string" || !same(value, group("metrics", cmd))) return false;
  const suffix = " " + ["hook", route.profile, route.source!].map(quote).join(" ");
  return cmd.endsWith(suffix) && /^'(?:[^']|'\\'')*\/node' '(?:[^']|'\\'')*\/metrics\.js'$/u.test(cmd.slice(0, -suffix.length));
}

function transform(text: string | null, role: Role, client: Client, edit: "add" | "remove" | "legacy", route?: Route) {
  const cfg = parse(text);
  const hooks = cfg.hooks === undefined ? {} : recordObject(cfg.hooks) ?? bad();
  const wanted = group(role, command(role, client));
  let changed = false;
  for (const event of events(role, client)) {
    const rows = hooks[event] ?? [];
    if (!Array.isArray(rows)) bad();
    const updated = edit === "add" ? (rows.some(row => same(row, wanted)) ? rows : [...rows, wanted])
      : rows.filter(row => edit === "legacy" ? !legacy(row, route!) : !same(row, wanted));
    if (updated.length === rows.length) continue;
    changed = true;
    if (updated.length) hooks[event] = updated;
    else delete hooks[event];
  }
  if (!changed) return text;
  if (Object.keys(hooks).length) cfg.hooks = hooks;
  else delete cfg.hooks;
  return format(cfg);
}

function currentOwner(raw: string | null, current: string | null): Owner {
  if (raw === null) return { original: current, last: current, routes: [] };
  return JSON.parse(raw) as Owner;
}

export function configureNative(root: string, client: Client, role: Role, profile: string, install: boolean, source?: string, session?: string) {
  const loc = locations(root, client);
  const lock = openSync(loc.common, "r");
  try {
    if (spawnSync("flock", ["-x", "-w", "2", "3"], { stdio: ["ignore", "ignore", "ignore", lock] }).status !== 0) bad();
    if (install) {
      ensureDirectory(loc.local);
      ensureDirectory(dirname(loc.file));
    } else if (existsSync(dirname(loc.file)) && realpathSync(dirname(loc.file)) !== dirname(loc.file)) bad();
    const prior = bytes(loc.file);
    const raw = bytes(loc.state, true);
    const owner = currentOwner(raw, prior);
    const full = realpathSync(profile);
    const matches = (r: Route) => r.role === role && r.root === root && r.profile === full && r.source === source;
    const existing = owner.routes.find(matches);
    const route = { role, root, profile: full, ...(source ? { source } : {}), ...(session ? { session } : {}), installed: Date.now() };
    let current = transform(prior, role, client, "legacy", route);
    if (owner.last !== prior) {
      // Preserve later edits. Rollback removes only the registrations we own.
      owner.original = current;
      for (const active of new Set(owner.routes.map(r => r.role))) owner.original = transform(owner.original, active, client, "remove");
    } else owner.original = transform(owner.original, role, client, "legacy", route);
    const includes = !!existing;
    if (install && existing && existing.session !== session) throw new Error("recovery_hook_already_installed");
    if (install && !includes) {
      if (role === "recovery" && owner.routes.some(r => r.role === role && r.root === root)) throw new Error("recovery_hook_already_installed");
      if (!owner.routes.some(r => r.role === role) && transform(current, role, client, "remove") !== current) {
        throw new Error("hook_registration_conflict");
      }
      owner.routes.push(route);
    }
    if (!install) owner.routes = owner.routes.filter(r => !matches(r));
    if (install) current = transform(current, role, client, "add");
    else if (includes && !owner.routes.some(r => r.role === role)) current = transform(current, role, client, "remove");
    if (!install && includes && !owner.routes.length) current = owner.original;
    owner.last = current;
    // Register the route before exposing a command. Remove its command before
    // discarding rollback state. A retry reconciles both files.
    if (install) replace(loc.state, raw, format(owner), true);
    replace(loc.file, prior, current);
    if (!install && raw !== null) replace(loc.state, raw, owner.routes.length ? format(owner) : null, true);
  } finally { closeSync(lock); }
}

export function metricClient(profile: MetricsProfile, id: string): Client {
  const src = profile.sources[id];
  if (!src?.task_id || !["codex_hook", "claude_hook"].includes(src.kind)) throw new Error("session_binding_required");
  return src.kind === "codex_hook" ? "codex" : "claude";
}

export function configureHooks(path: string, profile: MetricsProfile, id: string, install: boolean) {
  configureNative(profile.projectRoot, metricClient(profile, id), "metrics", path, install, id);
}

function locateRoutes(root: string, client: Client, role: Role) {
  const loc = locations(root, client);
  const raw = bytes(loc.state, true);
  if (!raw) return [];
  return currentOwner(raw, null).routes.filter(r => r.root === root && r.role === role);
}

export function registered(profilePath: string, profile: MetricsProfile, id: string) {
  const root = profile.projectRoot, client = metricClient(profile, id);
  const route = locateRoutes(root, client, "metrics").find(r => r.profile === realpathSync(profilePath) && r.source === id);
  const loc = locations(root, client);
  if (!lstatSync(loc.local, { throwIfNoEntry: false })?.isDirectory() || realpathSync(loc.local) !== loc.local) return null;
  const current = bytes(loc.file);
  return route && current !== null && transform(current, "metrics", client, "add") === current ? route.installed : null;
}

export async function dispatchNative(client: string, role: Role, input: Buffer, run: (route: Route) => number | Promise<number>) {
  if (client !== "codex" && client !== "claude") throw new Error("invalid_arguments");
  const row = recordObject(JSON.parse(input.toString("utf8")));
  if (typeof row?.cwd !== "string" || !events(role, client).includes(String(row.hook_event_name))) return 0;
  let cwd = realpathSync(row.cwd);
  const top = realpathSync(git(cwd, "rev-parse", "--show-toplevel"));
  let status = 0;
  for (;;) {
    for (const r of locateRoutes(cwd, client, role)) {
      if (role === "recovery" && (!r.session || r.session !== row.session_id)) continue;
      if (await run(r) !== 0) status = 1;
    }
    if (cwd === top || dirname(cwd) === cwd) break;
    cwd = dirname(cwd);
  }
  return status;
}
