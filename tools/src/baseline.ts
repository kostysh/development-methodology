#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import packageInfo from "../package.json" with { type: "json" };
import { Repository } from "./baseline/git.js";
import { inspectHook } from "./baseline/hook.js";
import { changes, freeze, loadBaseline, readJson } from "./baseline/manifest.js";

const flags = {
  freeze: ["--source", "--protect"],
  verify: ["--baseline", "--manifest", "--candidate"],
  hook: ["--host", "--repo", "--baseline", "--manifest"],
} as const;
type Command = keyof typeof flags;

function run([command, ...args]: string[]): number {
  if (command === "--version" && !args.length) {
    console.log(packageInfo.version);
    return 0;
  }
  if (!Object.hasOwn(flags, command)) throw new Error("Expected freeze, verify, hook or --version");
  const required: readonly string[] = flags[command as Command];
  const values = new Map<string, string>();
  const paths: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!required.includes(flag) || !value || values.has(flag) && flag !== "--protect") {
      throw new Error(`Invalid argument for ${command}`);
    }
    values.set(flag, value);
    if (flag === "--protect") paths.push(value);
  }
  for (const key of required) {
    if (!values.has(key)) throw new Error(`Missing ${key} for ${command}`);
  }
  const root = values.get("--repo") ?? process.cwd();
  const host = values.get("--host");
  if (command === "hook" && (!isAbsolute(root) || host !== "claude" && host !== "codex")) {
    throw new Error("Expected an absolute --repo and a supported --host");
  }
  const repo = new Repository(root);
  if (command === "freeze") {
    const source = repo.commit(values.get("--source"), "source");
    console.log(JSON.stringify(freeze(repo, source, paths), null, 2));
    return 0;
  }
  if (command === "hook" && realpathSync.native(root) !== repo.root) {
    throw new Error("--repo must be the Git worktree root");
  }
  const commit = repo.commit(values.get("--baseline"), "baseline");
  const baseline = loadBaseline(repo, commit, values.get("--manifest")!);
  if (command === "verify") {
    const found = changes(repo, baseline, repo.commit(values.get("--candidate"), "candidate"));
    if (found.length) {
      console.error(found.join("\n"));
      return 1;
    }
  } else {
    inspectHook(host!, root, repo.root, baseline, readJson(readFileSync(0), "hook input"));
  }
  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  console.error(`methodology-baseline: ${error instanceof Error ? error.message : "Cannot verify input"}`);
  process.exitCode = 2;
}
