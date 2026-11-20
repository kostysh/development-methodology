import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Repository } from "../baseline/git.js";
import { changedReviewPaths } from "./review-policy.js";
import { gateLockPath, type Config } from "./config.js";
import { useToken, writerCredential, type Credential } from "./credential.js";
import { activeOwnerHolds, exclude, verifyBatch, type Entry, type OwnerHold, type Receipt } from "./engine.js";
import { GitHub, submissionIdentityIssue, submissionTask, type Pull } from "./github.js";
import { Objects, oid, RejectedLease } from "./git.js";
import { command } from "./process.js";
import { observe } from "./report.js";
import { AuthorityBusy, authorityLock, history, load, lock, read, receipt, save, type Pending } from "./state.js";
import { cleanupContainer, runSuite } from "./suite.js";

type Host = Pick<GitHub, "list"|"get"|"mark"|"comment"|"verifyWriter"|"verifyImmutable"|"gates"|"audit">;
export type Environment = {
  host(c: Config, deadline: number): Host;
  objects(dir: string, c: Config, deadline: number): Objects;
  suite: typeof runSuite;
  cleanup: typeof cleanupContainer;
};
function ordinary(c: Config, deadline: number): Environment {
  let cached: Credential | undefined;
  const token = () => useToken(cached ??= writerCredential(c,deadline));
  return {host: () => new GitHub(c,token,deadline),
    objects: dir => new Objects(dir,"https://github.com/" + c.repository + ".git",c.branch,deadline,token),
    suite:runSuite,cleanup:cleanupContainer};
}
type Dispatch = { pr?: number; docs?: boolean; scheduled?: boolean };
function matches(path: string, list: string[]) { return list.some(p => path === p || (p.endsWith("/") && path.startsWith(p))); }
// Include open submissions and merged history on this target. A closed,
// unmerged PR is a returned attempt, even if its protected branch still exists.
function taskIndex(pulls: Pull[], branch: string) {
  const index = new Map<string, number[]>();
  for (const p of pulls) {
    if ((!p.open && !p.merged) || !p.sameRepo || p.target !== branch) continue;
    const task = submissionTask(p);
    if (!task) continue;
    const entries = index.get(task) ?? [];
    entries.push(p.number);
    index.set(task,entries);
  }
  return index;
}

function dependencies(c: Config, p: Pull, index?: Map<string, number[]>): number[] | string {
  const deps = c.dependencies[p.number] ?? [];
  if (!index || !c.taskDependencies) return deps;
  const task = submissionTask(p);
  if (!task) return "Stable task dependencies require a ready ref matching the exact PR head";
  if (index.get(task)?.length !== 1) return "Ambiguous submission for task " + task;
  const required = Object.hasOwn(c.taskDependencies,task) ? c.taskDependencies[task] : [];
  const resolved = new Set(deps);
  for (const key of required) {
    const matches = index.get(key);
    if (matches?.length !== 1) return (matches?.length ? "Ambiguous" : "Missing") + " prerequisite task " + key;
    resolved.add(matches[0]);
  }
  return [...resolved];
}

function work(c: Config, id: string) {
  if (!/^[\da-f-]{36}$/.test(id)) throw new Error("Invalid owned workspace ID");
  return join(c.stateDir, "work-" + id);
}
function blockedState(c: Config, p: Pull, d: number) {
  if (!c.mergeGate) return false;
  const [bin,...args] = Array.isArray(c.mergeGate) ? c.mergeGate : [c.mergeGate];
  const result = command(bin,[...args,c.repository,c.branch,String(p.number),p.head],{deadline:d,allowed:[0,1,75]});
  if (result.code === 75) throw new AuthorityBusy();
  return result.code === 1;
}
function deploy(c: Config, sha: string, d: number, writerLock?: number) {
  if (!c.deployment) return;
  const args = [c.repository, c.branch];
  const get = () => command(c.deployment!, ["read", ...args], { deadline: d }).out;
  const current = get();
  if (current !== "none") oid(current);
  if (current !== sha) command(c.deployment, ["deploy", ...args, sha], { deadline: d, writerLock });
  const result = oid(get());
  if (result !== sha) throw new Error("Test deployment revision differs");
  return result;
}
async function readback(c: Config, gh: Host, git: Objects, p: Pending, r: Receipt, d: number) {
  r.branchReadback = git.base();
  r.treeReadback = git.tree(r.branchReadback);
  if (r.branchReadback !== p.candidate || r.treeReadback !== p.tree) throw new Error("Integration ref/tree differs from tested candidate");
  for (const entry of p.included) {
    let pr = gh.get(entry.pr);
    // GitHub indirect-merge recognition can follow the ref update.
    for (let n = 0; !pr.merged && n < 4 && Date.now() + 1000 < d; n++) { await sleep(1000); pr = gh.get(entry.pr); }
    if (!pr.merged || pr.open || pr.head !== entry.head || pr.target !== c.branch)
      throw new Error("Integrated PR readback differs: #" + entry.pr);
  }
  for (const n of p.excluded) if (gh.get(n).merged) throw new Error("Excluded PR unexpectedly merged: #" + n);
  r.integrated = p.included.map(x => x.pr);
  if ((c.deployment ?? null) !== p.deployment) throw new Error("Deployment configuration changed during recovery");
  r.deployed = deploy(c,p.candidate,d,git.writerLock);
}

export async function operate(c: Config, options: Dispatch, supplied?: Environment) {
  const d = Date.now() + c.timeoutSeconds * 1000;
  const env = supplied ?? ordinary(c,d);
  const r = receipt(c);
  r.requestedPr = options.pr;
  const started = Date.parse(r.started);
  if (options.scheduled) {
    const hour = new Date(started);
    hour.setUTCMinutes(0,0,0);
    if (!c.schedule || !c.schedule.hoursUtc.includes(hour.getUTCHours()) ||
        started >= hour.getTime() + c.schedule.graceMinutes * 60000) throw new Error("No identifiable open scheduled slot");
    r.slot = hour.toISOString();
  }
  mkdirSync(join(c.stateDir,"runs"), {recursive:true, mode:0o700});
  const release = lock(join(c.stateDir,"train.lock"));
  const persist = () => save(r.log, r);
  if (!release) {
    r.result = "skipped"; r.ended = new Date().toISOString(); persist(); observe(c,r); return r;
  }
  try {
    const prior = history(c);
    if (r.slot && prior.some(p => p.slot === r.slot)) throw new Error("Scheduled slot already observed");
    persist();
    for (const old of prior.filter(p => p.result === "running")) {
      old.result = "interrupted"; old.interruptionTimeUnknown = true; old.ended = new Date().toISOString();
      old.incidents.push("Interrupted process; exact stop time unavailable");
      save(old.log,old); observe(c,old);
      r.recovery.push("Interrupted run " + old.id);
    }
    const s = load(c);
    const checkpoint = () => save(join(c.stateDir,"state.json"), s);
    const gh = env.host(c,d);
    gh.verifyWriter();
    if (s.resource) {
      env.cleanup(s.resource,d);
      rmSync(work(c,s.resource),{recursive:true,force:true});
      r.recovery.push("Cleaned run-owned resources " + s.resource); delete s.resource; checkpoint();
    }
    const usesTaskKeys = Object.keys(c.taskDependencies ?? {}).length > 0;
    const listed = gh.list(usesTaskKeys ? "all" : "open");
    const tasks = usesTaskKeys ? taskIndex(listed,c.branch) : undefined;
    const pulls = listed.filter(p => p.open).sort((a,b) => a.number - b.number);
    const open = new Set(pulls.map(p => String(p.number)));
    for (const n of Object.keys(s.admitted)) if (!open.has(n)) delete s.admitted[n];
    const candidates = pulls.filter(p => {
      if (options.pr && options.pr !== p.number) return false;
      if (c.admission && p.sameRepo && submissionTask(p)) {
        const issue = submissionIdentityIssue(p,c.admission);
        if (issue) {
          exclude(r,p,"other",issue + ". Check the configured PR author and independent review publisher");
          return false;
        }
      }
      return true;
    });
    r.queue = pulls.map(p => p.number);
    if (c.admission?.reviewControls) r.ownerHolds = [];
    if (!s.pending && !candidates.length) { checkpoint(); r.result = "completed"; return r; }

    s.resource = r.id; checkpoint();
    const dir = join(work(c,r.id),"git"); mkdirSync(dir, {recursive:true, mode:0o700});
    const git = env.objects(dir,c,d); git.writerLock = release.fd; git.init();
    r.base = git.base();
    if (s.pending) {
      const p = s.pending;
      if (r.base === p.base) r.recovery.push("Prior write absent on branch; candidate requires new verification");
      else {
        if (c.mode !== "enabled") throw new Error("Reconcile pending publication in enabled mode");
        const old = read<Receipt>(join(c.stateDir,"runs", p.run + ".json"));
        await readback(c,gh,git,p,old,d);
        old.recovery.push("Reconciled by " + r.id); save(old.log,old);
        r.recovery.push("Verified previous merge and test deployment " + p.candidate);
      }
      delete s.pending; checkpoint();
    }
    const exclusionsSinceDisposition = (number: number, task?:string) => {
      const same = (e: Receipt["excluded"][number]) => e.pr === number || (!!task && e.task === task);
      const after = c.disposition?.[number] ?? (task && c.disposition?.[task]);
      const at = after ? prior.findIndex(x => x.id === after && x.excluded.some(same)) : -1;
      return prior.slice(at + 1).filter(x => x.mode === c.mode)
        .flatMap(x => x.excluded.filter(e => same(e) && ["test","interaction","conflict"].includes(e.cause)));
    };
    const policy = c.admission;
    const controls = policy?.reviewControls;
    const protectedChanges = new Set<number>();
    const heldPrs = new Set<number>();
    if (controls && policy) {
      const repository = new Repository(dir,"objects");
      const holds: OwnerHold[] = [];
      for (const p of candidates) {
        if (!p.sameRepo || p.draft || !submissionTask(p)) continue;
        if (git.fetch("refs/pull/" + p.number + "/head") !== p.head) {
          exclude(r,p,"other","PR changed during admission"); continue;
        }
        const paths = changedReviewPaths(controls,r.base,p.head,repository);
        if (!paths.length) continue;
        protectedChanges.add(p.number);
        if (!gh.audit(p,policy,true)) holds.push({pr:p.number,head:p.head,paths});
      }
      if (holds.length) {
        for (const p of candidates) {
          const deps = dependencies(c,p,tasks);
          if (Array.isArray(deps)) for (const requires of new Set(deps)) holds.push({pr:p.number,head:p.head,requires});
        }
        r.ownerHolds = activeOwnerHolds(holds);
        for (const hold of r.ownerHolds) heldPrs.add(hold.pr);
      }
    }
    const eligible: Entry[] = [];
    for (const p of candidates) {
      const old = s.admitted[p.number];
      if (heldPrs.has(p.number) || r.excluded.some(e => e.pr === p.number)) {
        gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      if (old && old.head !== p.head) {
        delete s.admitted[p.number]; gh.mark(p,false); exclude(r,p,"other","Admission invalidated by head change");
        continue;
      }
      const blocks = exclusionsSinceDisposition(p.number,submissionTask(p));
      const recurring = blocks.some((e,i) => blocks.slice(0,i).some(b => b.cause === e.cause && b.tests.join() === e.tests.join()));
      if (recurring || blocks.some(b => b.head === p.head)) {
        if (recurring) r.decisions.push("Operator disposition required for repeated exclusion of #" + p.number);
        gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      if (controls && (!p.sameRepo || p.draft || !submissionTask(p))) {
        if (old || options.pr) exclude(r,p,"other","No eligible immutable submission");
        gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      if (!gh.gates(p,c.checks,protectedChanges.has(p.number)) || blockedState(c,p,d)) {
        if (old || options.pr) exclude(r,p,"other","Missing admission checks or merge permission");
        gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      const deps = dependencies(c,p,tasks);
      if (typeof deps === "string") {
        exclude(r,p,"dependency",deps); gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      if (!controls && git.fetch("refs/pull/" + p.number + "/head") !== p.head) {
        exclude(r,p,"other","PR changed during admission"); gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      const paths = git.paths(r.base,p.head);
      const migration = paths.some(path => matches(path,c.migrationPaths));
      const docs = paths.length > 0 && paths.every(path => matches(path,c.docsPaths));
      if ((options.docs && !docs) || (migration && !gh.gates(p,c.migrationChecks))) {
        exclude(r,p,"other","Required path scope or migration gate failed"); gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      if (git.merge(r.base,p.head) === null) {
        exclude(r,p,"conflict","Merge conflict against the integration base");
        gh.mark(p,false); delete s.admitted[p.number]; continue;
      }
      s.admitted[p.number] ??= {head:p.head,at:Date.now()}; gh.mark(p,true);
      eligible.push({pull:p, deps, migration,docs});
    }
    checkpoint();
    const waiting = eligible.sort((a,b) => s.admitted[a.pull.number].at - s.admitted[b.pull.number].at || a.pull.number - b.pull.number);
    const chosen: Entry[] = [];
    while (waiting.length && chosen.length < c.maxPrs) {
      const at = waiting.findIndex(e => !e.deps.some(id => waiting.some(x => x.pull.number === id)) &&
        (!e.migration || chosen.filter(x => x.migration).length < c.maxMigrations));
      if (at === -1) break;
      chosen.push(waiting.splice(at,1)[0]);
    }
    if (waiting.length && chosen.length < c.maxPrs &&
      waiting.every(e => e.deps.some(id => waiting.some(x => x.pull.number === id)))) {
      r.decisions.push("Check dependency order or cycle for queued PRs " + waiting.map(e => "#" + e.pull.number).join(", "));
    }
    const selected = Date.now();
    r.selected = chosen.map(e => e.pull.number);
    r.queueWaitMs = chosen.reduce((n,e) => n + selected - s.admitted[e.pull.number].at,0);
    const batch = verifyBatch(c,r,chosen,r.base,{
      merge: (a,b) => git.merge(a,b), run: (kind,sha,tests) => env.suite(c,git,r.id,kind,sha,tests), persist,
      priorFlake: id => prior.some(x => x.mode === c.mode && x.ended &&
        started - Date.parse(x.ended) <= c.flakeDays*86400000 && x.flakes.some(f => f.test === id)),
      alreadyMerged: n => { const p = gh.get(n); return p.merged && p.target === c.branch &&
        git.git(["merge-base","--is-ancestor",p.head,r.base!],[0,1,128]).code === 0; },
    }, options.docs === true);
    if (batch) {
      const { candidate,included } = batch;
      r.tree = git.tree(candidate);
      for (const p of pulls.filter(p => !r.proposed.includes(p.number))) {
        if (git.git(["merge-base","--is-ancestor",p.head,candidate],[0,1,128]).code === 0)
          throw new Error("Candidate includes an unselected PR #" + p.number);
      }
      if (options.docs && !git.delta(r.base,candidate).every(path => matches(path,c.docsPaths))) throw new Error("Documentation scope changed");
      if (git.base() !== r.base) throw new Error("Integration base changed; rejecting stale candidate");
      const authority = gateLockPath(c);
      const releaseAuthority = authority ? authorityLock(authority,true) : undefined;
      try {
        git.authorityFd = releaseAuthority?.fd;
        const finalTasks = usesTaskKeys ? taskIndex(gh.list("all"),c.branch) : undefined;
        for (const e of included) {
          if (finalTasks) {
            const deps = dependencies(c,e.pull,finalTasks);
            if (typeof deps === "string" || deps.some((id,i) => id !== e.deps[i]) || deps.length !== e.deps.length)
              throw new Error("Task dependency changed before publication for PR #" + e.pull.number);
          }
          if (c.immutableSources) gh.verifyImmutable(e.pull.ref);
          const p = gh.get(e.pull.number);
          const required = e.migration ? [...c.checks,...c.migrationChecks] : c.checks;
          if (p.head !== e.pull.head || p.ref !== e.pull.ref || !gh.gates(p,required,protectedChanges.has(p.number)) || blockedState(c,p,d)) {
            exclude(r,p,"other","Final PR head, admission checks or permission changed");
            throw new Error("Final admission rejected PR #" + p.number);
          }
        }
        if (c.mode === "enabled") {
          gh.verifyWriter();
          s.pending = { run:r.id, base:r.base, candidate, tree:r.tree,
            included:included.map(e => ({pr:e.pull.number,head:e.pull.head})), excluded:r.excluded.map(e => e.pr), deployment:c.deployment ?? null };
          checkpoint(); persist();
          try { git.publish(r.base,candidate); }
          catch (error) {
            if (error instanceof RejectedLease) { delete s.pending; checkpoint(); }
            throw error;
          }
          await readback(c,gh,git,s.pending,r,d); delete s.pending;
          for (const e of included) delete s.admitted[e.pull.number];
          checkpoint();
        }
      } finally {
        git.authorityFd = undefined;
        releaseAuthority?.();
      }
    }
    for (const e of r.excluded) if (exclusionsSinceDisposition(e.pr,e.task).some(old =>
      old.cause === e.cause && old.tests.join() === e.tests.join())) {
      r.decisions.push("Operator disposition required for repeated exclusion of #" + e.pr);
    }
    r.result = "completed";
    return r;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown train error";
    r.incidents.push(message); r.decisions.push(message);
    if (error instanceof AuthorityBusy) r.retryable = true;
    r.result = message === "Train timeout" ? "interrupted" : "completed";
    return r;
  } finally {
    try {
      if (existsSync(join(c.stateDir,"state.json"))) {
        const s = load(c);
        if (s.resource === r.id) {
          if (r.attempts.length) env.cleanup(r.id,Math.max(Date.now()+5000,d));
          rmSync(work(c,r.id),{recursive:true,force:true}); delete s.resource;
        }
        // Persist confirmed exclusions even when a later gate held the candidate.
        const gh = r.excluded.length ? env.host(c,d) : undefined;
        for (const e of r.excluded) {
          delete s.admitted[e.pr];
          if (gh) {
            const p = gh.get(e.pr); gh.mark(p,false);
            const next = e.cause === "dependency"
              ? ". Resolve the prerequisite and retry the unchanged head, or submit a correction if the dependant must change."
              : e.task ? ". Close this returned PR, correct the editable task branch, submit a fresh ready/" + e.task +
                "-<new-head> PR and obtain fresh checks and independent review." : "";
            gh.comment(e.pr,"Train " + r.id + " returned #" + e.pr + ". " + e.reason +
              (e.tests.length ? ". Tests: " + e.tests.join(", ") : "") + ". Run receipt: " + r.id + next);
          }
        }
        save(join(c.stateDir,"state.json"),s);
        r.queue = Object.keys(s.admitted).map(Number);
      }
    } catch (error) { r.incidents.push("Cleanup or exclusion notification: " + (error as Error).message); }
    try { r.ended = new Date().toISOString(); persist(); observe(c,r); }
    finally { release(); }
  }
}
