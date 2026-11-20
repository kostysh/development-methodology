import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { recordObject } from "./events.js";
import type { MetricsProfile } from "./profile.js";

const quote = (arg: string) => "'" + arg.replaceAll("'", "'\\''") + "'";

// Codex resolves a linked worktree's project layer against the corresponding
// directory in the main checkout. The binding still checks the selected worktree.
function codexLayer(projectRoot: string) {
  const git = (...args: string[]) => spawnSync("git", ["-C", projectRoot, ...args], { encoding: "utf8", timeout: 5000 });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0) return projectRoot;
  const list = git("worktree", "list", "--porcelain", "-z");
  const [main, ...fields] = list.stdout.split("\0");
  if (list.status !== 0 || !main.startsWith("worktree ") || fields[0] === "bare") throw new Error("unsafe_hook_settings");
  return join(realpathSync(main.slice(9)), relative(realpathSync(top.stdout.trimEnd()), projectRoot));
}

export function configureHooks(profilePath: string, profile: MetricsProfile, sourceId: string, install: boolean) {
  const source = profile.sources[sourceId];
  if (!source?.task_id || !["codex_hook", "claude_hook"].includes(source.kind)) {
    throw new Error("session_binding_required");
  }
  const claude = source.kind === "claude_hook";
  const directory = join(claude ? profile.projectRoot : codexLayer(profile.projectRoot), claude ? ".claude" : ".codex");
  const file = join(directory, claude ? "settings.local.json" : "hooks.json");
  const localLayer = join(profile.projectRoot, ".codex");
  if (install && !claude && directory !== localLayer) {
    // Layer discovery starts in the linked checkout. The client then loads the
    // main checkout's corresponding hooks file. Both directory entries matter.
    if (!existsSync(localLayer)) mkdirSync(localLayer, { mode: 0o700 });
    if (realpathSync(localLayer) !== localLayer) throw new Error("unsafe_hook_settings");
  }
  if (!existsSync(directory) && !install) return;
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error("unsafe_hook_settings");
  const fd = openSync(directory, "r");
  try {
    const lock = spawnSync("flock", ["-x", "-w", "2", "3"], { stdio: ["ignore", "ignore", "ignore", fd] });
    if (lock.status !== 0) throw new Error("unsafe_hook_settings");
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.nlink !== 1 || info.size > 1024 * 1024)) throw new Error("unsafe_hook_settings");
    const config = info ? recordObject(JSON.parse(readFileSync(file, "utf8"))) : {};
    if (!config || (config.hooks !== undefined && !recordObject(config.hooks))) throw new Error("unsafe_hook_settings");
    const hooks = recordObject(config.hooks) ?? {};
    const command = [process.execPath, realpathSync(process.argv[1]), "hook", realpathSync(profilePath), sourceId].map(quote).join(" ");
    const handler = { type: "command", command };
    let changed = false;
    for (const event of ["UserPromptSubmit", "PreToolUse", "PostToolUse", ...(claude ? ["PostToolUseFailure"] : []), "PostCompact", "Stop", "SessionEnd"]) {
      const current = hooks[event] ?? [];
      if (!Array.isArray(current)) throw new Error("unsafe_hook_settings");
      // Remove only the exact group created by this installation. Other hooks may have different matchers or timeouts.
      const ours = (group: unknown) => {
        const row = recordObject(group);
        const entries = row?.hooks;
        const entry = Array.isArray(entries) && entries.length === 1 ? recordObject(entries[0]) : undefined;
        return row && Object.keys(row).length === 1 && entry && Object.keys(entry).length === 2 &&
          entry.type === "command" && entry.command === command;
      };
      if (install && !current.some(ours)) { hooks[event] = [...current, { hooks: [handler] }]; changed = true; }
      if (!install && current.some(ours)) {
        const retained = current.filter(group => !ours(group));
        if (retained.length) hooks[event] = retained;
        else delete hooks[event];
        changed = true;
      }
    }
    if (changed) {
      config.hooks = hooks;
      const temp = join(directory, ".metrics-" + randomUUID());
      try {
        writeFileSync(temp, JSON.stringify(config, null, 2) + "\n", { flag: "wx", mode: info ? info.mode & 0o777 : 0o600 });
        renameSync(temp, file);
      } finally { if (existsSync(temp)) unlinkSync(temp); }
    }
  } finally { closeSync(fd); }
}
