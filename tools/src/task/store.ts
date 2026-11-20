import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readGit } from "../recovery/git.js";

export function git(root: string, ...args: string[]) {
  const value = readGit(root, args);
  if (!value) throw new Error("Cannot read the selected Git checkout.");
  return value.toString("utf8").replace(/\n$/u, "");
}

export function common(root: string) {
  return realpathSync(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
}

export function outsideRepository(path: string) {
  // Git can reject an inaccessible or moved checkout. Check metadata before
  // creating any private file, including in an administrative directory.
  for (let dir = path; ; dir = dirname(dir)) {
    const marker = join(dir, ".git");
    const info = lstatSync(marker, { throwIfNoEntry: false });
    if (info?.isFile() || info?.isSymbolicLink() || existsSync(join(marker, "HEAD")) ||
        (existsSync(join(dir, "HEAD")) && existsSync(join(dir, "objects")))) {
      throw new Error("Use a private coordinator directory outside all Git repositories.");
    }
    if (dir === dirname(dir)) break;
  }
}

export function store(setup: boolean) {
  const path = process.env.METHODOLOGY_TASK_HOME;
  if (!path || !isAbsolute(path) || path !== resolve(path) || realpathSync(dirname(path)) !== dirname(path)) {
    throw new Error("Set METHODOLOGY_TASK_HOME to an absolute private directory with an existing parent.");
  }
  outsideRepository(path);
  if (setup && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) {
    throw new Error("The coordinator must own its private directory with mode 0700.");
  }
  return path;
}

export function locked<T>(path: string, fn: () => T) {
  const dir = openSync(path, "r");
  try {
    if (spawnSync("/usr/bin/flock", ["-x", "-w", "10", "3"], { stdio: ["ignore", "ignore", "ignore", dir] }).status !== 0) {
      throw new Error("Coordinator busy. Retry the same command.");
    }
    return fn();
  } finally { closeSync(dir); }
}

// Files are in the operator-owned directory checked above. Publish a complete
// record in one rename so a retry never reads half of a profile or receipt.
export function save(path: string, value: unknown) {
  const tmp = join(dirname(path), "." + randomUUID());
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, path);
}
export function load<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
