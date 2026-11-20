import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command } from "./process.js";

export function oid(s: unknown): string {
  if (typeof s !== "string" || !/^[0-9a-f]{40}$/.test(s)) throw new Error("Invalid Git object ID");
  return s;
}
export class RejectedLease extends Error {}
export class Objects {
  writerLock?: number;
  authorityFd?: number;
  constructor(readonly dir: string, readonly remote: string, readonly branch: string,
    readonly deadline: number, readonly token?: string) {}
  git(args: string[], allowed = [0], extra: NodeJS.ProcessEnv = {}) {
    const auth = this.token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraHeader",
      GIT_CONFIG_VALUE_0: "Authorization: Basic " + Buffer.from("x-access-token:" + this.token).toString("base64") } : {};
    return command("git", ["-c", "core.hooksPath=/dev/null", ...args], { deadline: this.deadline, cwd: this.dir,
      allowed, authorityFd: args[0] === "push" ? this.authorityFd : undefined, writerLock: args[0] === "push" ? this.writerLock : undefined, env: { HOME: this.dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Methodology train", GIT_COMMITTER_NAME: "Methodology train",
        GIT_AUTHOR_EMAIL: "train@localhost", GIT_COMMITTER_EMAIL: "train@localhost", ...auth, ...extra } });
  }
  init() { this.git(["init", "--bare", "--template="]); }
  fetch(ref: string) {
    this.git(["fetch", "--no-tags", "--no-recurse-submodules", "--", this.remote, ref]);
    return oid(this.git(["rev-parse", "FETCH_HEAD"]).out);
  }
  base() { return this.fetch("refs/heads/" + this.branch); }
  merge(base: string, head: string): string | null {
    if (this.git(["merge-base", "--is-ancestor", oid(head), oid(base)], [0, 1]).code === 0) return base;
    const r = this.git(["merge-tree", "--write-tree", oid(base), oid(head)], [0, 1]);
    if (r.code === 1) return null;
    return oid(this.git(["commit-tree", oid(r.out), "-p", base, "-p", head, "-m", "Integrate reviewed candidate"]).out);
  }
  paths(base: string, head: string) {
    return this.git(["diff", "--name-only", "--no-renames", "-z", oid(base) + "..." + oid(head)]).out.split("\0").filter(Boolean);
  }
  delta(base: string, head: string) {
    return this.git(["diff", "--name-only", "--no-renames", "-z", oid(base), oid(head)]).out.split("\0").filter(Boolean);
  }
  tree(commit: string) { return oid(this.git(["rev-parse", oid(commit) + "^{tree}"]).out); }
  publish(base: string, candidate: string) {
    this.git(["merge-base", "--is-ancestor", oid(base), oid(candidate)]);
    const ref = "refs/heads/" + this.branch;
    const result = this.git(["push", "--porcelain", "--force-with-lease=" + ref + ":" + base, "--", this.remote, candidate + ":" + ref], [0,1]);
    if (result.code !== 0 && result.out.split("\n").some(s => s.startsWith("!\t") && s.endsWith("[rejected] (stale info)")))
      throw new RejectedLease("Leased Git push failed: expected base changed");
    if (result.code !== 0) throw new Error("Leased Git push failed; reconcile the remote ref");
  }
  checkout(commit: string, root: string) {
    // git archive applies PR-controlled export-ignore/export-subst. Export the index instead.
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { mode: 0o755 });
    chmodSync(root, 0o755);
    const extra = { GIT_WORK_TREE: root, GIT_INDEX_FILE: join(this.dir, "suite.index") };
    this.git(["read-tree", oid(commit)], [0], extra);
    // A submodule requires a separately verified source. An empty directory loses that source.
    if (this.git(["ls-files", "--stage", "-z"], [0], extra).out.split("\0").some(row => row.startsWith("160000 "))) {
      throw new Error("Suite checkout requires an unsupported submodule");
    }
    // Checkout filters (including built-in ident, EOL and encoding) could silently
    // change blob bytes. Repository-local info/attributes has highest precedence.
    const info = join(this.dir, "info");
    mkdirSync(info, {recursive:true});
    const attributes = join(info, "attributes");
    writeFileSync(attributes, "* -text -ident -filter !eol !working-tree-encoding\n", {flag:"wx",mode:0o600});
    // The verifier runs as an unprivileged UID. Only the bind-mounted snapshot
    // needs ordinary checkout modes; its host parent is a private directory.
    const mask = process.umask(0o022);
    try { this.git(["checkout-index", "--all", "--force", "--prefix=" + root + "/"], [0], extra); }
    finally { process.umask(mask); rmSync(attributes); }
  }
}
