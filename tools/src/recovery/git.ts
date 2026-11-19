import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";

// All reads select the repository through cwd. Discard caller overrides for
// the worktree, index and object store, even when launched from a Git hook.
export function readGit(cwd: string, args: string[]): Buffer | null {
  const result = spawnSync("git", [
    "--no-optional-locks", "--no-replace-objects", "-c", "core.fsmonitor=false", ...args,
  ], {
    cwd,
    env: {
      PATH: process.env.PATH?.split(":").filter(isAbsolute).join(":") || "/usr/bin:/bin",
      HOME: process.env.HOME, LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "",
    },
    timeout: 4000, maxBuffer: 16 * 1024 * 1024,
  });
  return result.status === 0 && !result.error ? result.stdout : null;
}
