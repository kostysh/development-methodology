import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { isEventType, isTrustedIdentity, mapIdentity, normalizeEvent, recordObject, type MetricsEvent } from "./events.js";
import { appendJournal, coverageGap } from "./journal.js";
import type { MetricsProfile } from "./profile.js";

export function operationSource(profile: MetricsProfile, id: string) {
  const source = profile.sources[id];
  if (!source?.task_id || !["normalized", "task", "development", "audit"].includes(source.kind)) {
    throw new Error("invalid_arguments");
  }
  return source;
}

export function mark(profile: MetricsProfile, source: string, type: string, occurrence: string, data: unknown,
  actor: MetricsEvent["actor_role"] = "operator", at?: string, requireNew = false) {
  const config = operationSource(profile, source);
  if (!isEventType(type) || !/^[\w.:-]{1,160}$/u.test(occurrence) || !recordObject(data)) throw new Error("invalid_arguments");
  const now = new Date().toISOString();
  const event = normalizeEvent({ schema_version: 1, project_id: profile.project_id, source_id: source,
    event_id: mapIdentity(profile, "event." + type, JSON.stringify([source, config.task_id, occurrence])),
    event_type: type, task_id: config.task_id, occurred_at: at ?? now, observed_at: now, actor_role: actor, data }, profile);
  const result = appendJournal(profile, [event], [], at === undefined);
  if (result.gaps || (requireNew && result.repeat)) throw new Error("occurrence_conflict");
}

export function runTest(profile: MetricsProfile, source: string, suite: string, attempt: string, argv: string[]) {
  if (!argv.length || !isTrustedIdentity(suite, profile) || !isTrustedIdentity(attempt, profile)) throw new Error("invalid_arguments");
  const cwd = realpathSync(process.cwd());
  const rel = relative(profile.projectRoot, cwd);
  if (isAbsolute(rel) || rel.split(sep)[0] === "..") throw new Error("invalid_arguments");
  const git = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { encoding: "utf8", timeout: 5000 });
  const sha = git.status === 0 ? git.stdout.trim() : null;
  const facts = { suite_id: suite, attempt_id: attempt, checkout_sha: sha, worktree_id: mapIdentity(profile, "git.worktree", cwd) };
  mark(profile, source, "test.started", attempt, facts, "automation", undefined, true);
  const start = performance.now();
  const child = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
  const duration = Math.round(performance.now() - start);
  const exit = child.status;
  const outcome = exit === 0 ? "success" : "failure";
  mark(profile, source, "test.finished", attempt, { ...facts, exit_code: exit, duration_ms: duration,
    outcome: profile.categories.outcome?.includes(outcome) ? outcome : null }, "automation");
  return exit ?? 1;
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
    appendJournal(profile, [], [coverageGap("git_rewrite_unverified", source)]);
    return 1;
  }
  // Keep the historical event key for amendments captured before branch-reflog support.
  const occurrenceClock = "HEAD" + selector.slice(selector.indexOf("@{"));
  const occurrence = mapIdentity(profile, "git.rewrite", JSON.stringify([ref, old, head, occurrenceClock]));
  mark(profile, source, "ref.rewritten", occurrence, { ref_id: mapIdentity(profile, "git.ref", ref),
    old_sha: old, new_sha: head, operation_type: profile.categories.operation_type?.includes(reason) ? reason : null }, "automation");
  return 0;
}
