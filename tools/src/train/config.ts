import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

export type WorkflowAuthority = {id: number; path: string; blob: string; publicRead?: boolean};
export type Gate = { name: string; appId: number; workflow?: WorkflowAuthority };
export type Config = {
  repository: string; branch: string; writerAppId: number; stateDir: string; mode: "dry" | "enabled";
  checks: Gate[]; migrationChecks: Gate[]; queueLabel: string; suiteImage: string;
  timeoutSeconds: number; maxPrs: number; maxMigrations: number; fullBudget: number;
  flakeDays: number; flakeOwner: string; migrationPaths: string[]; docsPaths: string[];
  dependencies: Record<string, number[]>; disposition?: Record<string, string>; deployment?: string; immutableSources?: boolean; ruleEvidence?: string; mergeGateLock?: string; mergeGate?: string | [string, ...string[]];
  schedule?: { hoursUtc: number[]; graceMinutes: number };
  metrics?: { profile: string; source: string; task: string };
};

function need(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error("Invalid train profile: " + detail);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function gates(value: unknown, required: boolean): value is Gate[] {
  if (!Array.isArray(value) || (required && !value.length)) return false;
  return value.every(g => {
    if (!g || typeof g.name !== "string" || !g.name.trim() || !positive(g.appId)) return false;
    if (g.appId !== 15368) return g.workflow === undefined;
    const w = g.workflow;
    return w && positive(w.id) && typeof w.path === "string" &&
      /^\.github\/workflows\/[a-zA-Z0-9._-]+\.ya?ml$/.test(w.path) &&
      typeof w.blob === "string" && /^[a-f0-9]{40}$/.test(w.blob) &&
      (w.publicRead === undefined || typeof w.publicRead === "boolean");
  });
}
export function trustedPath(path: string, directory = false) {
  need(typeof path === "string" && isAbsolute(path) && realpathSync(path) === path, "absolute trusted path");
  const stat = lstatSync(path);
  need((directory ? stat.isDirectory() : stat.isFile()) && !(stat.mode & 0o022) &&
    (stat.uid === process.getuid?.() || stat.uid === 0), "trusted owner and permissions on " + path);
}
export function gateLockPath(c: Config) {
  if (!c.mergeGate) return;
  const args = c.mergeGate;
  const profile = Array.isArray(args) && args.length === 3 && args[1] === "gate" ? args[2] : undefined;
  need(!profile || !c.mergeGateLock || profile === c.mergeGateLock, "merge gate and authority lock disagree");
  const path = profile ?? c.mergeGateLock;
  need(typeof path === "string" && isAbsolute(path) && realpathSync(path) === path,
    "a custom mergeGate requires its stable mergeGateLock");
  return path;
}
export function readConfig(path: string): Config {
  trustedPath(path);
  const c = { maxMigrations: 1, fullBudget: 2, migrationPaths: [], docsPaths: [],
    dependencies: {}, migrationChecks: [], ...JSON.parse(readFileSync(path, "utf8")) } as Config;
  need(typeof c.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(c.repository), "repository");
  need(typeof c.branch === "string" && /^[a-zA-Z0-9][\w./-]*$/.test(c.branch) && !c.branch.includes(".."), "branch");
  need(["dry", "enabled"].includes(c.mode) && positive(c.writerAppId), "mode and writerAppId");
  need(gates(c.checks, true) && gates(c.migrationChecks, false), "dedicated trusted check publishers");
  for (const k of ["timeoutSeconds", "maxPrs", "maxMigrations", "flakeDays"] as const) need(positive(c[k]), k);
  need(c.fullBudget === 1 || c.fullBudget === 2, "fullBudget must be 1 or 2");
  need(typeof c.suiteImage === "string" && /^(?:[\w./:-]+@)?sha256:[a-f0-9]{64}$/.test(c.suiteImage), "immutable suiteImage");
  need(typeof c.queueLabel === "string" && /^[\w .-]{1,50}$/.test(c.queueLabel), "queueLabel");
  need(typeof c.flakeOwner === "string" && c.flakeOwner.trim(), "flakeOwner");
  for (const paths of [c.docsPaths, c.migrationPaths]) need(Array.isArray(paths) && paths.every(p =>
    typeof p === "string" && /^[\w.-][\w./-]*$/.test(p) && !p.split("/").includes("..")), "path selectors");
  need(!c.migrationPaths.length || c.migrationChecks.length, "migration replay check");
  need(c.dependencies && typeof c.dependencies === "object" && !Array.isArray(c.dependencies) &&
    Object.entries(c.dependencies).every(([key, ids]) => /^[1-9]\d*$/.test(key) && Array.isArray(ids) &&
      ids.every(positive) && !ids.includes(Number(key))), "dependencies");
  if (c.disposition !== undefined) need(c.disposition && !Array.isArray(c.disposition) &&
    typeof c.disposition === "object" && Object.entries(c.disposition).every(([pr,run]) =>
      /^[1-9]\d*$/.test(pr) && typeof run === "string" && /^[a-f\d-]{36}$/.test(run)), "operator disposition");
  trustedPath(c.stateDir, true);
  need(!c.stateDir.includes(","), "stateDir must be a Docker mount path");
  need(!(lstatSync(c.stateDir).mode & 0o077), "stateDir must be private");
  need(c.immutableSources === undefined || typeof c.immutableSources === "boolean", "immutableSources");
  need(c.mode !== "enabled" || c.immutableSources === true, "immutableSources must be true for enabled publication");
  if (c.mergeGate !== undefined) {
    const argv = Array.isArray(c.mergeGate) ? c.mergeGate : [c.mergeGate];
    need(argv.length > 0 && argv.every(a => typeof a === "string" && a.length > 0), "mergeGate argv");
    trustedPath(realpathSync(argv[0]));
    need(isAbsolute(argv[0]), "absolute mergeGate executable");
    gateLockPath(c);
  }
  if (c.ruleEvidence !== undefined) trustedPath(c.ruleEvidence);
  if (c.deployment !== undefined) trustedPath(c.deployment);
  if (c.schedule !== undefined) need(Array.isArray(c.schedule.hoursUtc) && c.schedule.hoursUtc.length > 0 &&
    c.schedule.hoursUtc.every(h => Number.isInteger(h) && h >= 0 && h <= 23) && positive(c.schedule.graceMinutes) &&
    c.schedule.graceMinutes <= 60, "UTC schedule and graceMinutes");
  if (c.metrics !== undefined) {
    trustedPath(c.metrics.profile);
    need(typeof c.metrics.source === "string" && typeof c.metrics.task === "string", "metrics source and task");
  }
  return c;
}
