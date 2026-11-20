import { mapIdentity, normalizeEvent, parseUtc } from "../metrics/events.js";
import { readProfile } from "../metrics/profile.js";
import { appendJournal } from "../metrics/journal.js";
import type { Config } from "./config.js";
import type { Receipt } from "./engine.js";
import { history } from "./state.js";

export function observe(c: Config, r: Receipt) {
  if (!c.metrics || !r.ended || r.result === "running") return;
  const m = c.metrics;
  const profile = readProfile(m.profile);
  if (profile.sources[m.source]?.kind !== "normalized" || profile.sources[m.source].task_id !== m.task)
    throw new Error("Unbound train observation source");
  const data: Record<string, number|string> = { train_mode: r.mode, train_result: r.result };
  if (r.result !== "skipped") {
    if (!r.interruptionTimeUnknown) data.duration_ms = Math.max(0, Date.parse(r.ended) - Date.parse(r.started));
    if (r.result === "completed" || r.selected.length) {
      data.queue_entries = r.selected.length;
      data.queue_wait_ms = r.queueWaitMs;
    }
    // A kill in the gap between recording intent and obtaining the runner result
    // leaves that attempt count unknown.
    const full = r.attempts.filter(a => a.kind === "full");
    if (full.every(a => a.result && (a.result.result !== "infra" || a.result.started !== undefined)))
      data.full_suite_runs = full.filter(a => !(a.result?.result === "infra" && a.result.started === false)).length;
    data.flaky_tests = new Set(r.flakes.map(f => f.test)).size;
    for (const cause of ["dependency","conflict","test","interaction","other","unknown"])
      data["excluded_" + cause] = r.excluded.filter(x => x.cause === cause).length;
  }
  const event = normalizeEvent({schema_version: 1, project_id: profile.project_id,
    event_id: mapIdentity(profile, "train", r.id), task_id: m.task, source_id: m.source, actor_role: "automation",
    event_type: "train.observed", occurred_at: r.ended, observed_at: r.ended, data}, profile);
  const result = appendJournal(profile, [event], []);
  if (result.gaps) throw new Error("Train observation attribution conflict");
}

export function morning(c: Config, from: string, through: string) {
  if (!parseUtc(from) || !parseUtc(through) || Date.parse(from) > Date.parse(through)) throw new Error("Invalid UTC report window");
  const selected = history(c).filter(r => Date.parse(r.started) >= Date.parse(from) && Date.parse(r.started) <= Date.parse(through));
  const missed: string[] = [];
  if (c.schedule) {
    const start = Math.ceil(Date.parse(from) / 3600000) * 3600000;
    for (let t = start; t + c.schedule.graceMinutes * 60000 <= Math.min(Date.now(), Date.parse(through)); t += 3600000) {
      const hour = new Date(t);
      if (c.schedule.hoursUtc.includes(hour.getUTCHours()) && !selected.some(r => r.slot === hour.toISOString())) missed.push(hour.toISOString());
    }
  }
  return { decisions: selected.flatMap(r => r.decisions.map(action => ({run: r.id, action}))),
    window: { from, through }, branch: c.branch, runs: selected, missedSlots: missed,
    remainingQueue: selected.filter(r => r.result === "completed").at(-1)?.queue ?? null };
}
