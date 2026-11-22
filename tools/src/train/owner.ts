import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { gitPath } from "../baseline/git.js";
import { gates, trustedPath, type Gate } from "./config.js";
import { Objects, oid } from "./git.js";
import { GitHub } from "./github.js";
import { candidateCi, validateOwnerWorkflow, type OwnerWorkflow } from "./owner-ci.js";
import { verifyUnselectedHead } from "./operate.js";
import { command } from "./process.js";
import { authorityLock, save } from "./state.js";

type Profile = {
  repository: string; branch: string; ownerLogin: string; controlBase: string; defaultControlBase: string;
  protectedPaths: string[]; checks: Gate[]; workflows: OwnerWorkflow[];
};
type Review = {
  repository: string; branch: string; base: string; pr: number; head: string; ref: string;
  verdict: string; reviewer: string; evidence: string;
};
type Item = { pr: number; head: string; review: Review; dependencies: number[] };
type Batch = { base: string; pulls: Item[] };
type Operation = "owner-prepare" | "owner-check" | "owner-publish";

function need(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function line(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= 512 && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(value);
}
function readLocal(path: string) {
  const parent = dirname(path);
  trustedPath(path);
  trustedPath(parent, true);
  need(!(lstatSync(parent).mode & 0o077) && lstatSync(path).nlink === 1,
    "Store the profile and batch in private operator directories, outside project checkouts");
  // Files written by a PR checkout must never select the repository, control baseline or evidence.
  const inside = command("git", ["rev-parse", "--git-dir"], {
    cwd: parent, deadline: Date.now() + 10_000, allowed: [0,128],
  });
  need(inside.code === 128 && inside.err.startsWith("fatal: not a git repository"),
    "Profile and batch must be outside any Git repository");
  return JSON.parse(readFileSync(path, "utf8"));
}
function profile(path: string): Profile {
  const c: Profile = readLocal(path);
  need(c && typeof c.repository === "string" && /^[A-Za-z0-9-]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(c.repository) &&
    typeof c.ownerLogin === "string" && /^[A-Za-z0-9-]+$/.test(c.ownerLogin) && line(c.branch),
    "Specify a github.com owner login, repository and target branch");
  if (c.branch === "integration/nightly") {
    oid(c.controlBase);
    oid(c.defaultControlBase);
  }
  c.checks ??= [];
  need(Array.isArray(c.checks), "Specify PR checks as an array");
  need(Array.isArray(c.protectedPaths), "Specify the protected project CI and deployment control paths");
  c.protectedPaths = [".github", ...c.protectedPaths.map(p => gitPath(p, true))];
  need(Array.isArray(c.workflows) && c.workflows.length, "Specify mandatory candidate workflows");
  return c;
}
function confirmedTip(path: string, c: Profile): string {
  if (!lstatSync(path, { throwIfNoEntry: false })) return c.controlBase;
  let record;
  try {
    record = readLocal(path);
    need(record?.repository === c.repository && record.branch === c.branch &&
      Object.keys(record).every(k => ["repository","branch","tip","pending"].includes(k)), "unexpected checkpoint fields");
    oid(record.tip);
  } catch {
    throw new Error("Invalid integration tip checkpoint; reconcile " + path + " before continuing");
  }
  need(!Object.hasOwn(record, "pending"), "Unconfirmed prior publication; reconcile " + path + " before continuing");
  return record.tip;
}
function batch(path: string, c: Profile): Batch {
  const b: Batch = readLocal(path);
  oid(b.base);
  need(Array.isArray(b.pulls) && b.pulls.length && new Set(b.pulls.map(p => p.pr)).size === b.pulls.length,
    "Specify a nonempty ordered batch of unique PRs");
  for (const p of b.pulls) {
    oid(p.head);
    need(positive(p.pr) && Array.isArray(p.dependencies) && p.dependencies.every(positive) &&
      !p.dependencies.includes(p.pr), "Invalid PR or dependencies");
    const v = p.review;
    need(v && v.repository === c.repository && v.branch === c.branch && v.head === p.head && v.base === b.base &&
      v.pr === p.pr && line(v.ref) && v.verdict === "PASS" && line(v.reviewer) && line(v.evidence),
      "Missing independent PASS for exact repository, target, base, PR, source ref and head: #" + p.pr);
  }
  return b;
}

// Keep the owner's existing logged-in gh/keyring session. Git never reads credentials from
// the project or checks out its tree. No authenticated process runs candidate scripts.
function ghSession(): NodeJS.ProcessEnv {
  const { HOME, GH_CONFIG_DIR, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS } = process.env;
  return { HOME, GH_CONFIG_DIR, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS,
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" };
}
class OwnerReader extends GitHub {
  constructor(c: Profile, deadline: number, readonly directory: string) { super(c, "", deadline); }
  override api<T>(path: string): T {
    // All owner API requests are reads. Git handles the two allowed ref writes.
    const result = command("gh", ["api", "--hostname", "github.com", "-X", "GET", path],
      { cwd: this.directory, deadline: this.deadline, env: ghSession(), allowed: [0,1,2,4] });
    need(result.code === 0, "Owner gh could not read " + path + " (exit " + result.code +
      "). Check the logged-in github.com account, keyring access and repository permissions from this schedule.");
    return JSON.parse(result.out) as T;
  }
}
class OwnerObjects extends Objects {
  stamp?: string;
  override git(args: string[], allowed = [0], extra: NodeJS.ProcessEnv = {}) {
    const clock = this.stamp ? { GIT_AUTHOR_DATE: this.stamp, GIT_COMMITTER_DATE: this.stamp } : {};
    return super.git(args, allowed, { ...ghSession(), ...clock, ...extra, GIT_ALLOW_PROTOCOL: "https",
      GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_0: "!gh auth git-credential", GIT_CONFIG_KEY_1: "http.followRedirects", GIT_CONFIG_VALUE_1: "false" });
  }
  stage(candidate: string, branch: string) {
    const ref = "refs/heads/" + branch;
    const existing = this.git(["ls-remote", "--refs", "--exit-code", "--", this.remote, ref], [0,2]);
    if (existing.code === 2) {
      this.git(["push", "--porcelain", "--force-with-lease=" + ref + ":", "--", this.remote, oid(candidate) + ":" + ref]);
    }
    need(this.fetch(ref) === candidate, "Candidate branch changed or already points elsewhere");
  }
}

function admit(gh: OwnerReader, o: OwnerObjects, c: Profile, b: Batch, checks: Gate[]) {
  const admitted = new Set<number>();
  for (const item of b.pulls) {
    const p = gh.get(item.pr);
    need(gh.eligible(p) && p.number === item.pr && p.head === item.head && p.ref === item.review.ref &&
      p.baseSha === b.base && !p.ref.startsWith("methodology-candidates/"), "PR eligibility or reviewed revision changed: #" + item.pr);
    if (checks.length) {
      const results = gh.results(p, checks);
      const failed = checks.filter((_, i) => results[i].exitCode !== 0);
      need(!failed.length, "Missing or unsuccessful checks on #" + p.number + ": " + failed.map(g => g.name).join(", "));
    }
    for (const dep of item.dependencies) {
      if (admitted.has(dep)) continue;
      const previous = gh.get(dep);
      need(previous.number === dep && previous.sameRepo && previous.target === c.branch && previous.merged &&
        o.git(["merge-base", "--is-ancestor", oid(previous.head), b.base], [0,1,128]).code === 0,
        "Missing integrated or earlier dependency #" + dep + " for #" + item.pr);
    }
    admitted.add(item.pr);
  }
}
function controls(c: Profile, paths: string[]) {
  const blocked = paths.filter(path => c.protectedPaths.some(root =>
    path === root || path.startsWith(root + "/") || root.startsWith(path + "/")));
  need(!blocked.length, "Protected CI or deployment controls changed: " + blocked.map(p => JSON.stringify(p)).join(", "));
}

export async function ownerTrain(op: Operation, profilePath: string, batchPath: string, expected?: string) {
  const c = profile(profilePath);
  const b = batch(batchPath, c);
  if (op !== "owner-prepare") oid(expected);
  const deadline = Date.now() + 10 * 60_000;
  const dir = mkdtempSync(join(tmpdir(), "methodology-owner-"));
  try {
    const gh = new OwnerReader(c, deadline, dir);
    const viewer = gh.api<{login:string}>("/user");
    need(viewer.login?.toLowerCase() === c.ownerLogin.toLowerCase(), "Active gh login differs from the commissioned owner");
    const meta = gh.api<{full_name:string; default_branch:string}>("/repos/" + c.repository);
    const legacy = c.branch === "integration/nightly";
    need(meta.full_name === c.repository && line(meta.default_branch) &&
      !meta.default_branch.startsWith("methodology-candidates/") &&
      (legacy ? meta.default_branch !== c.branch : meta.default_branch === c.branch),
    "The owner train target must be the default branch or the legacy integration/nightly test branch");
    const o = new OwnerObjects(dir, "https://github.com/" + c.repository + ".git", c.branch, deadline);
    o.init();
    const checkpoint = profilePath + ".tip.json";
    function verifyTip() {
      const confirmed = legacy ? confirmedTip(checkpoint, c) : b.base;
      let live;
      try { live = o.base(); }
      catch { throw new Error("Cannot read the integration branch; reconcile the remote ref and owner access"); }
      need(live === b.base && b.base === confirmed,
        legacy ? "Integration base moved or differs from the last confirmed tip; reconcile the branch and obtain fresh review"
          : "Integration base moved during this batch; use the current default-branch tip and rebuild the batch");
    }
    verifyTip();
    function bindWorkflow<T extends { path: string; blob: string }>(w: T): T {
      need(w && typeof w.path === "string" && /^\.github\/workflows\/[a-zA-Z0-9._-]+\.ya?ml$/.test(w.path),
        "Specify a GitHub Actions workflow path");
      const blob = oid(o.git(["rev-parse", "--verify", b.base + ":" + w.path]).out);
      need(!legacy || blob === w.blob, "Unapproved workflow: " + w.path);
      return { ...w, blob };
    }
    const workflows = c.workflows.map(w => validateOwnerWorkflow(bindWorkflow(w)));
    need(new Set(workflows.map(w => w.id)).size === workflows.length, "Duplicate candidate workflow");
    const checks = c.checks.map(g => !legacy && g?.workflow ? { ...g, workflow: bindWorkflow(g.workflow) } : g);
    need(gates(checks, legacy) && checks.every(g => g.workflow?.publicRead !== true),
      "Specify the PR checks and their trusted publishers");
    if (legacy) {
      need(o.git(["merge-base", "--is-ancestor", c.controlBase, b.base], [0,1,128]).code === 0,
        "Integration base is outside the commissioned control baseline");
      controls(c, o.delta(c.controlBase, b.base));
    }
    admit(gh, o, c, b, checks);
    // Rebuilding from the same immutable inputs gives the same commit, including its timestamp.
    o.stamp = o.git(["show", "-s", "--format=%cI", b.base]).out;
    let candidate = b.base;
    for (const p of b.pulls) {
      need(o.fetch("refs/pull/" + p.pr + "/head") === p.head, "PR head moved: #" + p.pr);
      controls(c, o.paths(b.base, p.head));
      const merged = o.merge(candidate, p.head);
      need(merged, "Merge conflict on #" + p.pr);
      need(merged !== candidate, "Already included PR head: #" + p.pr);
      candidate = merged;
    }
    controls(c, o.delta(b.base, candidate));
    const candidateBranch = "methodology-candidates/" + candidate;
    const receipt = { repository: c.repository, branch: c.branch, base: b.base, candidate, candidateBranch,
      pulls: b.pulls.map(p => p.pr) };
    function checkDefaultControls() {
      if (!legacy) return;
      const current = o.fetch("refs/heads/" + meta.default_branch);
      need(o.git(["merge-base", "--is-ancestor", c.defaultControlBase, current], [0,1,128]).code === 0,
        "Default branch is outside the commissioned control baseline");
      controls(c, o.delta(c.defaultControlBase, current));
    }
    function checkUnselected() {
      const excluded = gh.list().filter(p => !receipt.pulls.includes(p.number));
      for (const p of excluded) verifyUnselectedHead(o, p, candidate);
      return excluded;
    }
    if (op === "owner-prepare") {
      checkUnselected();
      checkDefaultControls();
      o.stage(candidate, candidateBranch);
      return { ...receipt, status: "prepared" };
    }
    need(expected === candidate && o.fetch("refs/heads/" + candidateBranch) === candidate,
      "Tested candidate does not match reconstructed batch or candidate branch");
    const ci = candidateCi(gh, c.repository, candidateBranch, candidate, workflows);
    if (ci.status !== "pass" || op === "owner-check") return { ...receipt, ...ci };
    // A public PR head remains mutable. Re-read all admission evidence before the base lease;
    // GitHub cannot atomically lock the PR metadata and the target with the owner's Free account.
    admit(gh, o, c, b, checks);
    checkDefaultControls();
    const release = authorityLock(profilePath, false);
    try {
      verifyTip();
      const excluded = checkUnselected();
      const target = { repository: c.repository, branch: c.branch };
      // A killed process or uncertain push leaves its intent for explicit reconciliation.
      if (legacy) save(checkpoint, { ...target, tip: b.base, pending: candidate });
      o.authorityFd = release.fd;
      o.publish(b.base, candidate);
      try {
        need(o.base() === candidate, "Integration branch moved");
        // GitHub may update indirect merge state after the ref. Bound the total polling window.
        const end = Math.min(deadline, Date.now() + 12_000);
        const reader = new OwnerReader(c, end, dir);
        let waiting = b.pulls;
        while (waiting.length) {
          waiting = waiting.filter(p => {
            const after = reader.get(p.pr);
            need(after.number === p.pr && after.sameRepo && after.target === c.branch && after.ref === p.review.ref &&
              after.head === p.head && after.draft === false && (after.open || after.merged),
              "PR changed after final admission: #" + p.pr);
            return after.open || !after.merged;
          });
          if (waiting.length) {
            need(Date.now() + 1000 < end, "GitHub has not confirmed merged PRs: " + waiting.map(p => "#" + p.pr).join(", "));
            await sleep(1000);
          }
        }
        for (const p of excluded) {
          const after = gh.get(p.number);
          need(!after.merged, "Excluded PR unexpectedly merged: #" + p.number);
          if (after.open && after.target === c.branch) verifyUnselectedHead(o, after, candidate);
        }
        need(o.base() === candidate, "Integration branch moved during PR reconciliation");
        if (legacy) save(checkpoint, { ...target, tip: candidate });
      } catch (error) {
        throw new Error("Publication occurred; reconcile before any retry or deployment: " + (error as Error).message);
      }
    } finally { release(); }
    return { ...receipt, ...ci, status: "published" };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
