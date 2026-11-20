import type { Config } from "./config.js";
import type { Pull } from "./github.js";

export type Cause = "dependency" | "conflict" | "test" | "interaction" | "other" | "unknown";
export type Exclusion = { pr: number; head: string; cause: Cause; reason: string; tests: string[] };
export type Suite = { result: "pass" | "infra"; detail?: string; started?: boolean } | { result: "fail"; tests: string[] };
export type Kind = "full" | "targeted" | "docs";
export type Receipt = {
  id: string; mode: "dry" | "enabled"; started: string; ended?: string; result: "running" | "completed" | "interrupted" | "skipped";
  retryable?: boolean; interruptionTimeUnknown?: boolean; slot?: string; base?: string; c0?: string; c1?: string; candidate?: string; tree?: string; branchReadback?: string; treeReadback?: string;
  deployed?: string; integrated: number[]; proposed: number[]; excluded: Exclusion[];
  queue: number[]; queueWaitMs: number; selected: number[]; incidents: string[]; decisions: string[];
  flakes: {test: string; owner: string; blocking: boolean}[]; recovery: string[];
  attempts: {kind: Kind; sha: string; tests: string[]; result?: Suite}[]; log: string;
};
export type Entry = { pull: Pull; deps: number[]; migration: boolean; docs: boolean };
export type Kernel = {
  merge(base: string, head: string): string | null;
  run(kind: Kind, sha: string, tests: string[]): Suite;
  priorFlake(id: string): boolean;
  alreadyMerged(pr: number): boolean;
  persist(): void;
};
export function exclude(r: Receipt, p: Pull, cause: Cause, reason: string, tests: string[] = []) {
  if (!r.excluded.some(x => x.pr === p.number)) r.excluded.push({pr: p.number, head: p.head, cause, reason, tests});
}
function hold(reason: string): never { throw new Error(reason); }
export function verifyBatch(config: Pick<Config, "fullBudget" | "flakeOwner">, r: Receipt,
  entries: Entry[], base: string, k: Kernel, docsRoute: boolean) {
  let infra = 0;
  function check(kind: Kind, sha: string, tests: string[] = []): Suite {
    for (;;) {
      if (kind === "full" && r.attempts.filter(a => a.kind === "full").length >= config.fullBudget) hold("Full-suite budget exhausted");
      const attempt: Receipt["attempts"][number] = { kind, sha, tests };
      r.attempts.push(attempt);
      k.persist();
      attempt.result = k.run(kind, sha, tests);
      k.persist();
      if (attempt.result.result !== "infra") return attempt.result;
      if (++infra > 1) hold("Environment action: infrastructure retry failed");
    }
  }
  function assemble(items: Entry[]) {
    let candidate = base;
    const included: Entry[] = [];
    const prefixes: string[] = [];
    for (const e of items) {
      const missing = e.deps.find(dep => !included.some(x => x.pull.number === dep) && !k.alreadyMerged(dep));
      if (missing !== undefined) { exclude(r, e.pull, "dependency", "Requires PR #" + missing); continue; }
      const merged = k.merge(candidate, e.pull.head);
      if (merged === null) { exclude(r, e.pull, "conflict", "Merge conflict against the selected prefix"); continue; }
      candidate = merged;
      included.push(e);
      prefixes.push(candidate);
    }
    return { candidate, included, prefixes };
  }
  let batch = assemble(entries);
  if (!batch.included.length) return;
  r.c0 = batch.candidate;
  const first = check(docsRoute ? "docs" : "full", batch.candidate);
  if (first.result === "fail") {
    if (docsRoute) hold("Documentation fast checks failed: " + first.tests.join(", "));
    const repeat = check("targeted", batch.candidate, first.tests);
    const repeated = repeat.result === "fail" ? repeat.tests : [];
    for (const test of first.tests.filter(id => !repeated.includes(id)))
      r.flakes.push({test, owner: config.flakeOwner, blocking: k.priorFlake(test)});
    if (r.flakes.some(f => f.blocking)) hold("Recurring flaky test requires " + config.flakeOwner);
    if (repeat.result === "fail") {
      // Only a stable, identified failing test can justify excluding a PR.
      const tests = repeat.tests.filter(t => first.tests.includes(t));
      if (!tests.length || check("targeted", base, tests).result !== "pass") hold("Base or diagnosis inconclusive");
      let culprit: Entry | undefined;
      let failed: string[] = [];
      for (let i = 0; i < batch.included.length; i++) {
        const outcome = check("targeted", batch.prefixes[i], tests);
        if (outcome.result === "fail") {
          failed = outcome.tests.filter(t => tests.includes(t));
          if (!failed.length) hold("Prefix failed an unrelated test");
          culprit = batch.included[i];
          break;
        }
      }
      if (!culprit) hold("No failing prefix established");
      const alone = k.merge(base, culprit.pull.head);
      if (alone === null) hold("Could not verify attribution on the isolated PR");
      const isolated = check("targeted", alone, failed);
      if (isolated.result === "fail" && !isolated.tests.some(t => failed.includes(t))) hold("Isolated PR failed an unrelated test");
      const cause = isolated.result === "pass" ? "interaction" : "test";
      exclude(r, culprit.pull, cause, cause === "interaction" ? "Fails only in combination" : "Reproduces on isolated PR", failed);
      batch = assemble(batch.included.filter(e => e !== culprit));
      if (!batch.included.length) return;
      r.c1 = batch.candidate;
      const final = check("full", batch.candidate);
      if (final.result !== "pass") hold("Final candidate failed: " + (final.result === "fail" ? final.tests.join(", ") : "infrastructure"));
    }
  }
  r.candidate = batch.candidate;
  r.proposed = batch.included.map(e => e.pull.number);
  return batch;
}
