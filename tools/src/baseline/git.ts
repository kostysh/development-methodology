import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";

export type Entry = { path: string; mode: string; oid: string };
type Child = Omit<Entry, "path">;

export function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

export function regular(entry: Child): boolean {
  return entry.mode === "100644" || entry.mode === "100755";
}

export function gitPath(value: unknown, allowDirectory = false): string {
  if (typeof value !== "string" || !value.isWellFormed() || value.includes("\0")) {
    throw new Error("Invalid UTF-8 Git path");
  }
  const path = allowDirectory ? value.replace(/\/$/, "") : value;
  if (path.split("/").some((part) => ["", ".", "..", ".git"].includes(part))) {
    throw new Error(`Invalid Git path ${JSON.stringify(value)}`);
  }
  return value;
}

export function utf8(bytes: Buffer, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`Invalid UTF-8 in ${label}`);
  }
}

// Repository selection comes from cwd. Disable lazy fetch, protocols, and replacement objects.
function git(cwd: string, args: string[], label: string, input?: string): Buffer {
  const result = spawnSync("git", ["--no-replace-objects", ...args], {
    cwd, input, maxBuffer: 128 * 1024 * 1024,
    env: {
      PATH: process.env.PATH?.split(":").filter(isAbsolute).join(":") || "/usr/bin:/bin",
      HOME: process.env.HOME, LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  if (result.error || result.status !== 0) throw new Error(`Cannot read ${label} with Git`);
  return result.stdout;
}

export class Repository {
  readonly root: string;
  private readonly oidLength: number;
  private readonly trees = new Map<string, Map<string, Child>>();

  constructor(cwd: string, location: "worktree" | "objects" = "worktree") {
    const rootFlag = location === "objects" ? "--absolute-git-dir" : "--show-toplevel";
    this.root = utf8(git(cwd, ["rev-parse", rootFlag], "repository root"), "repository root")
      .replace(/\n$/, "");
    const format = git(this.root, ["rev-parse", "--show-object-format=storage"], "object format").toString().trim();
    if (format !== "sha1" && format !== "sha256") throw new Error("Unsupported Git object format");
    this.oidLength = format === "sha1" ? 40 : 64;
  }

  commit(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length !== this.oidLength || /[^0-9a-f]/.test(value)) {
      throw new Error(`Invalid ${label} commit ID`);
    }
    const type = git(this.root, ["cat-file", "-t", value], `${label} commit ${value}`).toString();
    if (type !== "commit\n") throw new Error(`Expected a commit for ${label} ${value}`);
    return value;
  }

  commonAncestor(base: string, head: string): string {
    const ancestors = git(this.root, ["merge-base", "--all", base, head], "common ancestor").toString().trim();
    return this.commit(ancestors, "unique common ancestor");
  }

  blob(entry: Entry): Buffer {
    return git(this.root, ["cat-file", "blob", entry.oid], `blob for ${JSON.stringify(entry.path)}`);
  }

  // ls-tree describes tree entries even when their blobs are missing in a partial clone.
  checkBlobs(entries: Entry[]): void {
    const paths = new Map(entries.filter(regular).map((entry) => [entry.oid, entry.path]));
    if (!paths.size) return;
    const ids = [...paths.keys()];
    const rows = git(this.root, ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
      "selected blobs", ids.join("\n") + "\n").toString().split("\n");
    for (const [i, oid] of ids.entries()) {
      if (rows[i] !== `${oid} blob`) throw new Error(`Unavailable blob for ${JSON.stringify(paths.get(oid))}`);
    }
  }

  private children(tree: string): Map<string, Child> {
    const cached = this.trees.get(tree);
    if (cached) return cached;
    const output = git(this.root, ["ls-tree", "-z", "--full-tree", tree], `tree ${tree}`);
    // Byte-preserving keys keep unrelated non-UTF-8 names distinct from valid selected paths.
    const children = new Map<string, Child>();
    const rows = output.toString("latin1").split("\0");
    if (rows.pop() !== "") throw new Error("Incomplete Git tree listing");
    for (const row of rows) {
      const tab = row.indexOf("\t");
      const [mode, , oid] = row.slice(0, tab).split(" ");
      const name = row.slice(tab + 1);
      if (tab < 0 || !name || name.includes("/") || children.has(name)) throw new Error("Invalid Git tree");
      children.set(name, { mode, oid });
    }
    this.trees.set(tree, children);
    return children;
  }

  // A blocking ancestor is returned at its actual path so verify can report the displacement.
  lookup(commit: string, path: string): Entry | undefined {
    let tree = commit;
    let prefix = "";
    for (const part of path.split("/")) {
      const child = this.children(tree).get(Buffer.from(part).toString("latin1"));
      if (!child) return undefined;
      prefix = prefix ? `${prefix}/${part}` : part;
      if (prefix === path || child.mode !== "040000") return { path: prefix, ...child };
      tree = child.oid;
    }
    return undefined;
  }

  inventory(commit: string, selectors: string[], trusted: boolean): Entry[] {
    const found = new Map<string, Entry>();
    for (const selector of selectors) {
      const directory = selector.endsWith("/");
      const path = directory ? selector.slice(0, -1) : selector;
      const root = this.lookup(commit, path);
      if (!root) {
        if (trusted) throw new Error(`Missing selection ${JSON.stringify(selector)}`);
        continue;
      }
      if (!directory || root.path !== path || root.mode !== "040000") {
        if (trusted && (directory || root.path !== path || !regular(root))) {
          throw new Error(`Wrong file type for selection ${JSON.stringify(selector)}`);
        }
        found.set(root.path, root);
        continue;
      }
      let hasFile = false;
      const pending = [root];
      while (pending.length) {
        const parent = pending.pop()!;
        for (const [bytes, child] of this.children(parent.oid)) {
          const name = utf8(Buffer.from(bytes, "latin1"), `directory ${JSON.stringify(parent.path)}`);
          const entry = { path: gitPath(`${parent.path}/${name}`), ...child };
          if (entry.mode === "040000") pending.push(entry);
          else {
            if (trusted && !regular(entry)) throw new Error(`Nonregular file ${JSON.stringify(entry.path)}`);
            found.set(entry.path, entry);
            hasFile = true;
          }
        }
      }
      if (trusted && !hasFile) throw new Error(`Empty directory selection ${JSON.stringify(selector)}`);
    }
    const entries = [...found.values()].sort((a, b) => byteOrder(a.path, b.path));
    this.checkBlobs(entries);
    return entries;
  }
}
