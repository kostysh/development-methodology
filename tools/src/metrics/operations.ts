import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { isEventType, isTrustedIdentity, issuedAlias, sourceKey, mapIdentity, normalizeEvent, recordObject, type MetricsEvent } from "./events.js";
import { appendJournal, coverageGap } from "./journal.js";
import { checkObservation, withSpool } from "./spool.js";
import type { MetricsProfile } from "./profile.js";

export function operationSource(profile: MetricsProfile, id: string) {
  const source = profile.sources[id];
  if (!source?.task_id || !["normalized", "task", "development", "audit", "operation_spool"].includes(source.kind)) {
    throw new Error("invalid_arguments");
  }
  return source;
}

const operationIds = new Set([
  "suite_id", "attempt_id", "decision_id", "operation_id", "audit_id", "prior_audit_id",
  "subject_id", "finding_occurrence_id", "observation_id", "cause_id", "dispute_id",
]);

function operationData(profile: MetricsProfile, task: string, data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([field, value]) => {
    if (!operationIds.has(field) || typeof value !== "string" || isTrustedIdentity(value, profile) || !issuedAlias.test(value)) {
      return [field, value];
    }
    const identity = field === "prior_audit_id" ? "audit_id" : field;
    return [field, mapIdentity(profile, "operation." + identity, JSON.stringify([task, value]))];
  }));
}

export function mark(profile: MetricsProfile, source: string, type: string, occurrence: string, data: unknown,
  actor?: MetricsEvent["actor_role"], at?: string, requireNew = false) {
  const config = operationSource(profile, source);
  const fields = recordObject(data);
  if (!isEventType(type) || !/^[\w.:-]{1,160}$/u.test(occurrence) || !fields) throw new Error("invalid_arguments");
  const now = new Date().toISOString();
  const spooled = config.kind === "operation_spool";
  const event = normalizeEvent({ schema_version: 1, project_id: profile.project_id, source_id: source,
    event_id: mapIdentity(profile, "event." + type, JSON.stringify([source, config.task_id, occurrence])),
    event_type: type, task_id: config.task_id, occurred_at: at ?? now, observed_at: now,
    actor_role: actor ?? (spooled ? "agent" : "operator"), data: operationData(profile, config.task_id!, fields) }, profile);
  const append = (storage: MetricsProfile) => appendJournal(storage, [event], [], { operationClock: at === undefined });
  if (spooled) checkObservation(event, source, config.task_id!, now);
  const result = spooled ? withSpool(profile, source, true, append) : append(profile);
  if (result.gaps || (requireNew && result.repeat)) throw new Error("occurrence_conflict");
}

function operationGap(profile: MetricsProfile, source: string, code: string) {
  const write = (storage: MetricsProfile) => appendJournal(storage, [], [coverageGap(code, source)]);
  if (operationSource(profile, source).kind === "operation_spool") withSpool(profile, source, true, write);
  else write(profile);
}

export function runTest(profile: MetricsProfile | undefined, source: string, suite: string, attempt: string, argv: string[]) {
  if (!sourceKey.test(source) || !argv[0] || argv[0].startsWith("-") || ![suite, attempt].every(id => issuedAlias.test(id) ||
      /^m_[a-f0-9]{32}_[a-f0-9]{32}$/u.test(id))) throw new Error("invalid_arguments");
  const cwd = realpathSync(process.cwd());
  if (profile) {
    const rel = relative(profile.projectRoot, cwd);
    if (isAbsolute(rel) || rel.split(sep)[0] === "..") throw new Error("invalid_arguments");
  }
  let facts;
  const warn = () => console.error("methodology-metrics: test_coverage_gap");
  try {
    if (!profile) throw new Error("invalid_profile");
    operationSource(profile, source);
    const git = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { encoding: "utf8", timeout: 5000 });
    const sha = git.status === 0 ? git.stdout.trim() : null;
    const startFacts = { suite_id: suite, attempt_id: attempt, checkout_sha: sha, worktree_id: mapIdentity(profile, "git.worktree", cwd) };
    mark(profile, source, "test.started", attempt, startFacts, "automation", undefined, true);
    facts = startFacts;
  } catch (error) {
    warn();
    if (profile && error instanceof Error && error.message === "occurrence_conflict") {
      try { operationGap(profile, source, "test_coverage_gap"); } catch { /* The warning already identifies lost coverage. */ }
    }
  }

  const start = performance.now();
  const child = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
  const duration = Math.round(performance.now() - start);
  const outcome = child.signal ? "cancelled" : child.status === 0 ? "success" : "failure";
  if (facts && profile) {
    try {
      mark(profile, source, "test.finished", attempt, { ...facts, exit_code: child.status, duration_ms: duration,
        outcome: profile.categories.outcome?.includes(outcome) ? outcome : null }, "automation");
    } catch { warn(); }
  }
  if (child.signal) return 128 + osConstants.signals[child.signal];
  if (child.error) return (child.error as NodeJS.ErrnoException).code === "ENOENT" ? 127 : 126;
  return child.status ?? 1;
}

// This operation runs from Git's post-rewrite hook. The old and new tip must also
// be present in Git's supplied old/new pairs. Other rewritten commits are not ref moves.
export function gitRewrite(profile: MetricsProfile, source: string, reason: string, input: string) {
  if (!["amend", "rebase"].includes(reason)) throw new Error("invalid_arguments");
  const git = (...args: string[]) => {
    const child = spawnSync("git", args, { cwd: profile.projectRoot, encoding: "utf8", timeout: 5000 });
    return child.status === 0 ? child.stdout.trim() : "";
  };
  if (realpathSync(process.cwd()) !== profile.projectRoot) throw new Error("invalid_arguments");
  const ref = git("symbolic-ref", "--quiet", "HEAD");
  // A rebase may add a final checkout entry to HEAD after rewriting the branch.
  // Read the named branch's two entries in the same Git invocation.
  const entries = ref ? git("reflog", "-2", "--date=raw", "--format=%H%x09%gD", ref).split("\n") : [];
  const [head, selector] = (entries[0] ?? "").split("\t");
  const old = entries[1]?.split("\t")[0];
  if (!ref || !old || !head || !selector?.includes("@{") || old === head || !input.split("\n").some(line => {
    const [before, after] = line.split(/\s+/u); return before === old && after === head;
  })) {
    operationGap(profile, source, "git_rewrite_unverified");
    return 1;
  }
  // Keep the historical event key for amendments captured before branch-reflog support.
  const occurrenceClock = "HEAD" + selector.slice(selector.indexOf("@{"));
  const occurrence = mapIdentity(profile, "git.rewrite", JSON.stringify([ref, old, head, occurrenceClock]));
  mark(profile, source, "ref.rewritten", occurrence, { ref_id: mapIdentity(profile, "git.ref", ref),
    old_sha: old, new_sha: head, operation_type: profile.categories.operation_type?.includes(reason) ? reason : null }, "automation");
  return 0;
}
