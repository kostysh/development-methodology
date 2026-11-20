#!/usr/bin/env node
import { join } from "node:path";
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with { type: "json" };
import { sourceKey } from "./metrics/events.js";
import type { Client } from "./metrics/setup.js";
import { begin, finish, setup, type Setup } from "./task/lifecycle.js";
import { chooseSkills } from "./task/skills.js";
import { common, load, locked, store } from "./task/store.js";

const usage = [
  "Usage: methodology-task setup PROJECT --clients codex,claude [--recovery] [--skills tracked|per-checkout --skill NAME ...] [--skill-source DIR]",
  "       methodology-task begin TASK WORKTREE CLIENT=SESSION_ID ...",
  "       methodology-task begin TASK",
  "       methodology-task finish TASK [--accepted]",
  "Set METHODOLOGY_TASK_HOME to the dedicated private coordinator directory. Run setup in the project.",
].join("\n");

function run(args: string[]) {
  if (args.length === 1 && (args[0] === "--version" || args[0] === "--help")) {
    console.log(args[0] === "--version" ? packageInfo.version : usage);
    return 0;
  }
  const [command, ...input] = args;
  const { positionals, values } = parseArgs({ args: input, allowPositionals: true, options: command === "setup" ? {
    clients: { type: "string" }, skills: { type: "string" }, skill: { type: "string", multiple: true },
    "skill-source": { type: "string" }, recovery: { type: "boolean" },
  } : command === "finish" ? { accepted: { type: "boolean" } } : {} });
  const [task, worktree, ...sessions] = positionals;
  if (!task || !["setup", "begin", "finish"].includes(command) || (command !== "begin" && positionals.length !== 1)) throw new Error(usage);
  const home = store(command === "setup");
  return locked(home, () => {
    if (command === "setup") {
      const clients = String(values.clients ?? "").split(",").sort() as Client[];
      if (!sourceKey.test(task) || clients.some(client => client !== "codex" && client !== "claude") || new Set(clients).size !== clients.length) throw new Error(usage);
      const skills = chooseSkills(values.skills as string | undefined, values.skill as string[] | undefined, values["skill-source"] as string | undefined);
      console.log(JSON.stringify(setup(home, { project: task, repository: common(process.cwd()), clients, recovery: !!values.recovery, skills })));
      return 0;
    }
    const settings = load<Setup>(join(home, "settings.json"));
    const result = command === "begin" ? begin(home, settings, task, worktree, sessions) : finish(home, settings, task, !!values.accepted);
    console.log(JSON.stringify(result, null, 2));
    return result.status === "awaiting_callback" || ("spool" in result && (result.spool.gaps > 0 || result.doctors.some(d => d.callback !== "observed"))) ? 1 : 0;
  });
}
try { process.exitCode = run(process.argv.slice(2)); }
catch (error) {
  console.error("methodology-task:", error instanceof Error ? error.message : "Unavailable coordinator input.");
  process.exitCode = 2;
}
