import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

export type WorkflowAuthority = {id: number; path: string; blob: string; publicRead?: boolean; event?: "push" | "workflow_dispatch"};
export type Gate = { name: string; appId: number; workflow?: WorkflowAuthority };
export type Admission = {repository:string; branch:string; reviewerId:number; required:(Gate & {id:string; minimum?:number})[];
  baseline?: {commit:string; manifest:string}};
export type Config = {
  repository: string; branch: string; writerAppId: number; stateDir: string; mode: "dry" | "enabled";
  admissionPolicy?: string; admission?: Admission; checks: Gate[]; migrationChecks: Gate[]; queueLabel: string; suiteImage: string; postgresImage?: string; serviceImage?: string;
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
      (w.event === undefined || ["push","workflow_dispatch"].includes(w.event)) &&
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
export function readAdmission(path: string, reviewRequired = true): Admission {
  trustedPath(path);
  const a = JSON.parse(readFileSync(path,"utf8")) as Admission;
  need(typeof a.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(a.repository) &&
    typeof a.branch === "string" && /^[\w][\w./-]*$/.test(a.branch) && (!reviewRequired || positive(a.reviewerId)), "admission repository, branch and independent reviewer ID");
  need(gates(a.required,true) && a.required.every(g => typeof g.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(g.id) &&
      (g.minimum === undefined || (Number.isFinite(g.minimum) && g.minimum >= 0))) &&
    new Set(a.required.map(g=>g.id)).size === a.required.length, "required check authorities and unique result IDs");
  if (a.baseline) need(/^[a-f0-9]{40}$/.test(a.baseline.commit) && typeof a.baseline.manifest === "string" && a.baseline.manifest.length, "baseline commit and manifest");
  return a;
}
export function readConfig(path: string): Config {
  trustedPath(path);
  const c = { maxMigrations: 1, fullBudget: 2, migrationPaths: [], docsPaths: [],
    dependencies: {}, migrationChecks: [], ...JSON.parse(readFileSync(path, "utf8")) } as Config;
  need(typeof c.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(c.repository), "repository");
  need(typeof c.branch === "string" && /^[a-zA-Z0-9][\w./-]*$/.test(c.branch) && !c.branch.includes(".."), "branch");
  need(["dry", "enabled"].includes(c.mode) && positive(c.writerAppId), "mode and writerAppId");
  need(c.admission === undefined, "supply admissionPolicy as a trusted path");
  if (c.admissionPolicy) {
    const a = readAdmission(c.admissionPolicy);
    need(a.repository === c.repository && a.branch === c.branch, "admission policy target");
    c.admission = a;
  }
  need(gates(c.checks, true) && gates(c.migrationChecks, false), "dedicated trusted check publishers");
  if (c.admission) need(c.checks.some(g => g.workflow?.event === "workflow_dispatch") &&
    c.admission.required.every(r=>!c.checks.some(g=>g.name===r.name && g.appId===r.appId && g.workflow?.event==="workflow_dispatch")),
    "require the distinct pinned admission workflow");
  for (const k of ["timeoutSeconds", "maxPrs", "maxMigrations", "flakeDays"] as const) need(positive(c[k]), k);
  need(c.fullBudget === 1 || c.fullBudget === 2, "fullBudget must be 1 or 2");
  need(typeof c.suiteImage === "string" && /^(?:[\w./:-]+@)?sha256:[a-f0-9]{64}$/.test(c.suiteImage), "immutable suiteImage");
  for (const image of [c.postgresImage,c.serviceImage]) need(image === undefined ||
    (typeof image === "string" && /^(?:[\w./:-]+@)?sha256:[a-f0-9]{64}$/.test(image)), "immutable sidecar image");
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
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(pr) && typeof run === "string" && /^[a-f\d-]{36}$/.test(run)), "operator disposition");
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
