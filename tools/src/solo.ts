#!/usr/bin/env node
import { createHash } from "node:crypto";
import { accessSync, closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import packageInfo from "../package.json" with { type: "json" };
import { mapIdentity, parseUtc, recordObject } from "./metrics/events.js";
import { mark } from "./metrics/operations.js";
import { readProfile as readMetrics } from "./metrics/profile.js";
import { authorityLock, AuthorityBusy } from "./train/state.js";

const usage =
  "Usage: methodology-solo propose|answer|summary|install-batch PROFILE\n" +
  "       methodology-solo bind PROFILE TASK PR HEAD\n" +
  "       methodology-solo gate PROFILE REPOSITORY BRANCH PR HEAD\n";
const classes = ["established_ui", "generic_error"];
const alias = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const sha = /^[0-9a-f]{40}$/u;
function requireValue(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}
function string(value: unknown, field: string) {
  requireValue(typeof value === "string" && value.trim() && value.length <= 2048, "invalid " + field);
  return value;
}
function id(value: unknown) {
  requireValue(typeof value === "string" && alias.test(value), "invalid decision or task ID");
  return value;
}
function jsonFile(path: string) {
  const stat = lstatSync(path);
  requireValue(
    isAbsolute(path) && realpathSync(path) === path && stat.isFile() && !(stat.mode & 0o022),
    "trusted regular file required",
  );
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
function loadPolicy(path: string) {
  const p = recordObject(jsonFile(resolve(path)));
  requireValue(
    p &&
      typeof p.repository === "string" &&
      /^[\w.-]+\/[\w.-]+$/u.test(p.repository) &&
      typeof p.branch === "string" &&
      p.branch.trim() &&
      Number.isSafeInteger(p.pending_limit) &&
      Number(p.pending_limit) >= 0,
    "invalid solo policy",
  );
  const permissions = new Map<string, boolean>();
  const selected = Array.isArray(p.classes)
    ? Object.fromEntries(p.classes.map(name => [id(name), { allow_merge: false }]))
    : recordObject(p.classes);
  requireValue(selected, "invalid classes");
  for (const [name, settings] of Object.entries(selected)) {
    const allowed = recordObject(settings)?.allow_merge;
    requireValue(classes.includes(name) && typeof allowed === "boolean", "invalid class policy");
    permissions.set(name, allowed);
  }
  const ledger = string(p.ledger, "ledger");
  requireValue(
    isAbsolute(ledger) &&
      realpathSync(dirname(ledger)) === dirname(ledger) &&
      !(lstatSync(dirname(ledger)).mode & 0o077),
    "private ledger directory required",
  );
  const prior = lstatSync(ledger, { throwIfNoEntry: false });
  requireValue(!prior || (prior.isFile() && prior.nlink === 1 && !(prior.mode & 0o077)), "unsafe ledger");
  return {
    repository: p.repository,
    branch: p.branch,
    limit: Number(p.pending_limit),
    permissions,
    ledger,
    approvals: p.approvals === undefined ? undefined : string(p.approvals, "approvals"),
    approvalsOwner: p.approvals_owner_uid,
    profilePath: resolve(path),
    metrics: p.metrics,
  };
}
function proposal(raw: unknown) {
  const p = recordObject(raw);
  requireValue(
    p &&
      Array.isArray(p.exclusions) &&
      p.exclusions.every((x) => typeof x === "string" && x.trim()) &&
      (p.scope === "certain" || p.scope === "ambiguous") &&
      (p.next_action === "implement" || p.next_action === "investigate"),
    "invalid proposal scope or next_action",
  );
  return {
    id: id(p.id),
    task: id(p.task),
    decision_class: string(p.decision_class, "decision_class"),
    scope: p.scope,
    exclusions: [...new Set<string>(p.exclusions)].sort(),
    choice: string(p.choice, "choice"),
    basis: string(p.basis, "basis"),
    alternatives: string(p.alternatives, "alternatives"),
    reversal_cost: string(p.reversal_cost, "reversal_cost"),
    dependent_work: string(p.dependent_work, "dependent_work"),
    impact: string(p.impact, "impact"),
    next_action: p.next_action,
  };
}
type Proposal = ReturnType<typeof proposal>;
type Entry = Proposal & { digest: string; applied_at: string | null; reason: string | null };
type Receipt = {
  id: string;
  digest: string;
  status: "confirmed" | "changed";
  at: string;
  owner_source: string;
  document: string;
  choice?: string;
  rework?: string;
  superseded_head?: string;
  verified_head?: string;
};
// A numeric setting selects an existing independent owner. The kernel must
// establish control of both the publisher's configured policy and its inbox.
function independentFile(path: string, owner: number) {
  const file = lstatSync(path);
  const parent = lstatSync(dirname(path));
  requireValue(isAbsolute(path) && realpathSync(path) === path && file.isFile() && file.nlink === 1 &&
    file.uid === owner && !(file.mode & 0o022) && parent.isDirectory() && parent.uid === owner &&
    !(parent.mode & 0o022), "independent owner file and directory required");
  for (const target of [path, dirname(path)]) {
    let writable = true;
    try { accessSync(target, constants.W_OK); } catch { writable = false; }
    requireValue(!writable, "coordinator can write owner source");
  }
}

function ownerSource(policy: ReturnType<typeof loadPolicy>) {
  const uid = policy.approvalsOwner;
  requireValue(typeof uid === "number" && Number.isSafeInteger(uid) && uid >= 0 &&
    process.geteuid?.() !== undefined && uid !== process.geteuid() && policy.approvals,
    "independent owner source required");
  independentFile(policy.profilePath, uid);
  independentFile(policy.approvals, uid);
  return policy.approvals;
}

function readOwnerBatch(path: string, expectedUid: number) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireValue(stat.isFile() && stat.nlink === 1 && stat.uid === expectedUid && !(stat.mode & 0o022),
      "independent owner file required");
    return JSON.parse(readFileSync(fd,"utf8")) as unknown;
  } finally { closeSync(fd); }
}

type ChatAnswer = { id: string; status: "confirmed" | "changed"; choice: string; owner_source: string; at: string };
function chatAnswer(raw: unknown, rows: Entry[], history: ChatAnswer[]): ChatAnswer {
  const input = recordObject(raw);
  const row = rows.find(row => row.id === input?.id);
  requireValue(row && input && (input.status === "confirmed" || input.status === "changed"),
    "existing decision and answer status required");
  const owner_source = string(input.owner_source, "chat message reference");
  const prior = history.find(note => note.id === row.id && note.owner_source === owner_source);
  const last = history.findLast(note => note.id === row.id);
  const choice = input.status === "changed" ? string(input.choice, "owner choice") : prior?.choice ?? last?.choice ?? row.choice;
  requireValue(input.choice === undefined || input.choice === choice, "answer does not confirm the stated choice");
  if (prior) {
    requireValue(prior.choice === choice && prior.status === input.status, "message already records a different answer");
    return prior;
  }
  return { id: row.id, status: input.status, choice, owner_source, at: new Date().toISOString() };
}

function receipts(raw: unknown, rows: Entry[]) {
  requireValue(Array.isArray(raw), "owner approvals must be an array");
  const approved = new Map<string, Receipt>();
  for (const item of raw) {
    const r = recordObject(item);
    requireValue(
      r && (r.status === "confirmed" || r.status === "changed") && typeof r.at === "string" && parseUtc(r.at),
      "invalid owner receipt",
    );
    const key = id(r.id),
      row = rows.find((x) => x.id === key);
    requireValue(
      row && row.digest === r.digest && !approved.has(key),
      "unknown, changed or repeated owner receipt",
    );
    const receipt: Receipt = {
      id: key,
      digest: row.digest,
      status: r.status,
      at: r.at,
      owner_source: string(r.owner_source, "owner_source"),
      document: string(r.document, "document"),
    };
    if (r.status === "changed") {
      receipt.choice = string(r.choice, "owner choice");
      receipt.rework = string(r.rework, "rework");
      requireValue(
        typeof r.superseded_head === "string" && sha.test(r.superseded_head),
        "identify the superseded head",
      );
      receipt.superseded_head = r.superseded_head;
      if (r.verified_head !== undefined) {
        requireValue(
          typeof r.verified_head === "string" &&
            sha.test(r.verified_head) &&
            r.verified_head !== r.superseded_head,
          "invalid verified rework head",
        );
        receipt.verified_head = r.verified_head;
      }
    }
    approved.set(key, receipt);
  }
  return approved;
}
function loadEntries(db: DatabaseSync): Entry[] {
  return db
    .prepare("SELECT proposal,digest,applied_at,reason FROM decisions ORDER BY rowid")
    .all()
    .map((row) => ({
      ...JSON.parse(String(row.proposal)),
      digest: row.digest,
      applied_at: row.applied_at,
      reason: row.reason,
    }));
}
function pushMetrics(settings: unknown, rows: Entry[], approved: Map<string, Receipt>) {
  if (settings === undefined) return;
  const config = recordObject(settings),
    sources = recordObject(config?.sources);
  requireValue(config && sources, "invalid solo metrics configuration");
  const metrics = readMetrics(string(config.profile, "metrics profile"));
  for (const row of rows) {
    if (!row.applied_at) continue;
    const source = string(sources[row.task], "metrics source for task");
    requireValue(metrics.sources[source]?.task_id === row.task, "metrics source task mismatch");
    const data = {
      decision_id: mapIdentity(metrics, "solo.decision", row.id),
      decision_class: row.decision_class,
    };
    mark(metrics, source, "solo.decided", row.id, data, "agent", row.applied_at);
    const receipt = approved.get(row.id);
    if (receipt) mark(metrics, source, "solo." + receipt.status, row.id, data, "operator", receipt.at);
  }
}
function execute(cmd: string, profile: string, args: string[]) {
  const readOnly = cmd === "gate" || cmd === "summary";
  const release = authorityLock(resolve(profile),readOnly);
  try { return underLock(cmd,profile,args,readOnly); }
  finally { release(); }
}
function underLock(cmd: string, profile: string, args: string[], readOnly: boolean) {
  const p = loadPolicy(profile);
  process.umask(0o077);
  const emptyReader = readOnly && !existsSync(p.ledger);
  const db = new DatabaseSync(emptyReader ? ":memory:" : p.ledger, {readOnly:readOnly && !emptyReader});
  try {
    db.exec("PRAGMA busy_timeout=5000");
    if (!readOnly || emptyReader) db.exec(`CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, proposal TEXT NOT NULL, digest TEXT NOT NULL, applied_at TEXT, reason TEXT);
      CREATE TABLE IF NOT EXISTS bindings (pr INTEGER, task TEXT, head TEXT NOT NULL, PRIMARY KEY(pr,task));
      CREATE TABLE IF NOT EXISTS verified_receipts (id TEXT PRIMARY KEY, receipt TEXT NOT NULL, verified_head TEXT);
      CREATE TABLE IF NOT EXISTS chat_answers (answer TEXT NOT NULL);`);
    db.exec(readOnly ? "BEGIN" : "BEGIN IMMEDIATE");
    const ledgerVersion = db.prepare("PRAGMA user_version").get()?.user_version;
    requireValue(ledgerVersion === 0 || ledgerVersion === 1 || ledgerVersion === 2, "unsupported decision ledger version");
    const rows = loadEntries(db);
    const previous = ledgerVersion === 2 ? db.prepare("SELECT * FROM verified_receipts").all() : [];
    const installed = previous.map(row => ({...JSON.parse(String(row.receipt)),
      ...(row.verified_head ? {verified_head:row.verified_head} : {})}));
    let approved = receipts(installed,rows);
    if (cmd === "install-batch" && !args.length) {
      const file = ownerSource(p);
      approved = receipts(readOwnerBatch(file, Number(p.approvalsOwner)), rows);
      for (const prior of previous) {
        const current = approved.get(String(prior.id));
        requireValue(current, "owner receipt removed");
        const {verified_head,...stable} = current;
        requireValue(JSON.stringify(stable) === prior.receipt && (!prior.verified_head || verified_head),
          "owner receipt changed or verification removed");
      }
      for (const receipt of approved.values()) {
        const {verified_head,...stable} = receipt;
        db.prepare("INSERT INTO verified_receipts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET verified_head=excluded.verified_head")
          .run(receipt.id,JSON.stringify(stable),verified_head ?? null);
      }
      db.exec("PRAGMA user_version=2");
    }
    const hasChat = db.prepare("SELECT 1 FROM sqlite_schema WHERE name='chat_answers'").get();
    const history: ChatAnswer[] = hasChat ? db.prepare("SELECT answer FROM chat_answers ORDER BY rowid").all()
      .map(row => JSON.parse(String(row.answer))) : [];
    const notes = new Map(history.map(note => [note.id, note]));
    const machineRegister = ledgerVersion === 2 || p.approvalsOwner !== undefined;
    const resolutionFor = (id: string) => machineRegister ? approved.get(id) : notes.get(id);
    const pending = rows.filter(row => row.applied_at && !resolutionFor(row.id));
    let status = 0,
      result: unknown;
    if (cmd === "propose" && !args.length) {
      const req = proposal(JSON.parse(readFileSync(0, "utf8"))),
        serialized = JSON.stringify(req);
      const digest = createHash("sha256").update(serialized).digest("hex");
      const existing = rows.find((row) => row.id === req.id);
      requireValue(!existing || existing.digest === digest, "decision ID already has different content");
      const reason = !p.permissions.has(req.decision_class)
        ? "unselected_class"
        : req.exclusions.length
          ? "excluded"
          : req.scope !== "certain"
            ? "ambiguous"
            : pending.length >= p.limit
              ? "pending_cap"
              : null;
      if (!existing?.applied_at && !resolutionFor(req.id)) {
        db.prepare(
          "INSERT INTO decisions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET applied_at=excluded.applied_at,reason=excluded.reason",
        ).run(req.id, serialized, digest, reason ? null : new Date().toISOString(), reason);
      }
      const current = loadEntries(db).find((row) => row.id === req.id)!;
      const resolution = resolutionFor(req.id);
      result = resolution ? { ...current, resolution } : current;
      status = resolution ? (resolution.status === "confirmed" ? 0 : 1) : current.applied_at ? 0 : 1;
    } else if (cmd === "answer" && !args.length) {
      const note = chatAnswer(JSON.parse(readFileSync(0, "utf8")), rows, history);
      if (!history.includes(note)) db.prepare("INSERT INTO chat_answers VALUES(?)").run(JSON.stringify(note));
      result = note;
    } else if (cmd === "bind" && args.length === 3) {
      const [task, pr, head] = args;
      requireValue(id(task) && /^[1-9]\d*$/u.test(pr) && sha.test(head), "invalid task, PR or head");
      db.prepare(
        "INSERT INTO bindings VALUES(?,?,?) ON CONFLICT(pr,task) DO UPDATE SET head=excluded.head",
      ).run(pr, task, head);
      result = { task, pr: Number(pr), head };
    } else if (cmd === "gate" && args.length === 4) {
      const [repo, branch, pr, head] = args;
      const bindings = db.prepare("SELECT task,head FROM bindings WHERE pr=?").all(pr);
      const holds: string[] = [];
      try {
        const owner = receipts(readOwnerBatch(ownerSource(p), Number(p.approvalsOwner)), rows);
        for (const [id, receipt] of approved) {
          const actual = owner.get(id);
          if (!actual || JSON.stringify(actual) !== JSON.stringify(receipt)) holds.push(id);
        }
      } catch { holds.push("independent_owner_source_required"); }
      if (ledgerVersion !== 2) holds.push("owner_batch_not_installed");
      if (
        repo !== p.repository ||
        branch !== p.branch ||
        !/^[1-9]\d*$/u.test(pr) ||
        !sha.test(head) ||
        !bindings.length ||
        bindings.some((x) => x.head !== head)
      )
        holds.push("unbound_revision");
      for (const row of rows.filter((x) => bindings.some((b) => b.task === x.task))) {
        const receipt = approved.get(row.id);
        if (receipt?.status === "confirmed") continue;
        if (
          receipt?.status === "changed"
            ? receipt.verified_head !== head
            : !row.applied_at || !p.permissions.get(row.decision_class)
        )
          holds.push(row.id);
      }
      result = { allowed: !holds.length, holds };
      status = holds.length ? 1 : 0;
    } else if (cmd === "install-batch" && !args.length) {
      result = {installed: approved.size};
    } else if (cmd === "summary" && !args.length) {
      const group = (status: Receipt["status"]) =>
        rows
          .filter(row => resolutionFor(row.id)?.status === status)
          .map(row => ({ ...row, resolution: resolutionFor(row.id) }));
      result = {
        pending,
        held: rows.filter(row => !row.applied_at && !resolutionFor(row.id)),
        chat_history: history,
        ...(ledgerVersion === 1 ? { legacy_receipts: "independent_reinstallation_required" } : {}),
        confirmed: group("confirmed"),
        changed: group("changed"),
      };
    } else throw new Error(usage.trim());
    db.exec("COMMIT");
    if (cmd !== "gate") {
      try { pushMetrics(p.metrics, loadEntries(db), approved); }
      catch (error) {
        // A telemetry failure after COMMIT cannot undo or deny the owner's acknowledged decision.
        if (cmd !== "install-batch" && cmd !== "answer") throw error;
        result = { ...recordObject(result), metrics_sync:"pending" };
      }
    }
    process.stdout.write(JSON.stringify(result) + "\n");
    return status;
  } finally {
    db.close();
  }
}
try {
  const [cmd, profile, ...args] = process.argv.slice(2);
  if (cmd === "--help") process.stdout.write(usage);
  else if (cmd === "--version") console.log(packageInfo.version);
  else if (!profile) throw new Error(usage.trim());
  else process.exitCode = execute(cmd, profile, args);
} catch (error) {
  console.error("methodology-solo: " + (error instanceof Error ? error.message : "invalid input"));
  process.exitCode = error instanceof AuthorityBusy ? 75 : 2;
}
