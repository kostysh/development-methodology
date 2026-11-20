#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import packageInfo from "../package.json" with { type: "json" };
import { recordObject } from "./metrics/events.js";
import { configureNative, dispatchNative } from "./metrics/setup.js";
import { snapshot } from "./recovery/snapshot.js";
import { gitRoot, readBoundedState, readProfile, readState, StateError, within, writeState } from "./recovery/state.js";

const usage = "Usage: methodology-recovery --version | {write|snapshot|recover|hook} PROFILE | install-hook PROFILE --client codex|claude --session-id ID | uninstall-hook PROFILE --client codex|claude";
const manual = "Use manual task recovery. Reconcile the assigned task, its authority and current facts before polling or resuming work.";
type Profile = ReturnType<typeof readProfile>;

function packet(profile: Profile) {
  let state: string;
  let missingState = false;
  try {
    state = readState(profile);
  } catch (error) {
    missingState = true;
    state = `Task state unavailable (${error instanceof StateError ? error.message : "unavailable"}). ${manual}`;
  }
  const current = snapshot(profile);
  const text = [
    "Reconcile the task state and fresh snapshot before polling or resuming work.",
    "Apply the operator's instructions since the saved locator. Keep held actions and previous check results tied to their original revision.",
    "For a completed operation, verify its identity and launch revision, then read its saved stdout, stderr and exit status.",
    "", "Task state", state, "", "Fresh snapshot", JSON.stringify(current),
  ].join("\n");
  return { text, partial: missingState || current.gaps.length > 0 };
}

function hook(profilePath: string, input?: Buffer): number {
  let context: string;
  try {
    const event = recordObject(JSON.parse(input?.toString("utf8") ?? readFileSync(0, "utf8")));
    if (!event || typeof event.hook_event_name !== "string") throw new Error();
    if (event.hook_event_name !== "SessionStart") return 0;
    if (typeof event.source !== "string") throw new Error();
    if (event.source !== "compact") return 0;
    const profile = readProfile(profilePath);
    if (typeof event.cwd !== "string" || !isAbsolute(event.cwd)) throw new Error();
    const cwd = realpathSync.native(event.cwd);
    if (!within(profile.worktree, cwd) || gitRoot(cwd) !== profile.worktree) throw new Error();
    context = packet(profile).text;
  } catch {
    context = manual;
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
  return 0;
}

async function run(args: string[]): Promise<number> {
  const [command, path] = args;
  if (args.length === 1 && (command === "--version" || command === "--help")) {
    console.log(command === "--version" ? packageInfo.version : usage);
    return 0;
  }
  if (command === "dispatch-hook" && args.length === 2) {
    const input = readBoundedState(0, 256 * 1024);
    return dispatchNative(path, "recovery", input, r => hook(r.profile, input));
  }
  if (command === "install-hook" || command === "uninstall-hook") {
    const install = command === "install-hook";
    const [, , flag, client, selector, id] = args;
    if (flag !== "--client" || (client !== "claude" && client !== "codex") ||
        (install ? args.length !== 6 || selector !== "--session-id" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/u.test(id) : args.length !== 4)) {
      console.error(usage); return 2;
    }
    configureNative(readProfile(path).worktree, client, "recovery", path, install, undefined, id);
    return 0;
  }
  if (args.length !== 2 || !["write", "snapshot", "recover", "hook"].includes(command)) {
    console.error(usage);
    return 2;
  }
  if (command === "hook") return hook(path);
  const profile = readProfile(path);
  if (command === "write") {
    writeState(profile, readBoundedState(0, profile.byte_limit));
    return 0;
  }
  if (command === "snapshot") {
    const current = snapshot(profile);
    console.log(JSON.stringify(current));
    return current.gaps.length > 0 ? 1 : 0;
  }
  const result = packet(profile);
  console.log(result.text);
  return result.partial ? 1 : 0;
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  const rejected = error instanceof StateError;
  console.error(`methodology-recovery: ${rejected ? error.message : "invalid binding or unavailable input"}`);
  process.exitCode = rejected ? 1 : 2;
}
