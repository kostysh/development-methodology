import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { gitPath, Repository, utf8 } from "../baseline/git.js";
import { canonical, identifier, onlyKeys, Rejection, string, strings } from "./input.js";

export function readGit(cwd: string, args: string[], label: string, allowedStatuses = [0]) {
  const result = spawnSync("git", ["--no-replace-objects", ...args], {
    cwd, timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    env: {
      PATH: process.env.PATH?.split(":").filter(isAbsolute).join(":") || "/usr/bin:/bin",
      LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  if (result.error || !allowedStatuses.includes(result.status ?? -1)) throw new Error(`Cannot read ${label} with Git`);
  return { status: result.status, output: utf8(result.stdout, label) };
}

function inside(root: string, path: string) {
  const local = relative(root, path);
  return !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`);
}

function verifyLocalPath(root: string, path: string) {
  let directory = resolve(root, path);
  for (;;) {
    try {
      lstatSync(directory);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      directory = dirname(directory);
      continue;
    }
    let resolved: string;
    try {
      resolved = realpathSync(directory);
    } catch {
      throw new Rejection(`Cannot resolve staging path ${JSON.stringify(path)}`);
    }
    if (!inside(root, resolved)) throw new Rejection(`Staging path leaves approved worktree ${JSON.stringify(path)}`);
    break;
  }
}

export function checkGit(input: Record<string, unknown>) {
  onlyKeys(input, ["worktree", "commonDir", "remote", "pushUrl", "branch", "destination", "head", "paths"]);
  const worktree = canonical(input.worktree, "worktree");
  const commonDir = canonical(input.commonDir, "common Git directory");
  const remote = identifier(input.remote, "Git remote name");
  const pushUrl = string(input.pushUrl, "Git push URL");
  const branch = string(input.branch, "local Git branch");
  const destination = string(input.destination, "destination Git ref");
  for (const ref of [branch, destination]) {
    if (!ref.startsWith("refs/heads/") || readGit(worktree, ["check-ref-format", ref], "ref format", [0, 1]).status) {
      throw new Error("Expected fully qualified local and destination branch refs");
    }
  }
  const repo = new Repository(worktree);
  if (repo.root !== worktree || commonDir !== readGit(worktree,
    ["rev-parse", "--path-format=absolute", "--git-common-dir"], "common Git directory").output.replace(/\n$/u, "")) {
    throw new Rejection("Unexpected Git repository or worktree");
  }
  const sha = repo.commit(input.head, "expected HEAD");
  const head = readGit(worktree, ["rev-parse", "--verify", "HEAD"], "HEAD").output.trim();
  const onBranch = readGit(worktree, ["symbolic-ref", "-q", "HEAD"], "local branch", [0, 1]).output.trim();
  if (head !== sha || onBranch !== branch) throw new Rejection("Unexpected Git HEAD or local branch");
  const urls = readGit(worktree, ["remote", "get-url", "--all", "--push", remote], "Git push URL").output;
  if (urls !== `${pushUrl}\n` || /[\r\n]/u.test(pushUrl)) throw new Rejection("Unexpected Git push URL");

  const paths = strings(input.paths, "write path").map((path) => gitPath(path, true));
  if (!paths.length) throw new Error("Expected declared write paths");
  const staged = readGit(worktree, ["diff", "--cached", "--no-renames", "--name-only", "-z", "HEAD", "--"],
    "staged paths").output.split("\0");
  if (staged.pop() !== "") throw new Error("Incomplete staged path listing");
  for (const path of staged) {
    gitPath(path);
    if (!paths.some((approved) => approved.endsWith("/") ? path.startsWith(approved) : path === approved)) {
      throw new Rejection(`Undeclared staged path ${JSON.stringify(path)}`);
    }
  }
  for (const path of new Set([...paths, ...staged])) {
    verifyLocalPath(worktree, path);
    const ignored = readGit(worktree, ["check-ignore", "--no-index", "--", `./${path}`], "ignore rules", [0, 1]);
    if (ignored.status === 0) throw new Rejection(`Ignored write path ${JSON.stringify(path)}`);
  }
  return { head, destination, staged };
}
