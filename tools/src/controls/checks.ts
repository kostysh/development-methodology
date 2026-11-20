import { array, config, identifier, oid, onlyKeys, record, Rejection } from "./input.js";

function threshold(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

export function checkResults(input: Record<string, unknown>, receiptsPath: string) {
  onlyKeys(input, ["candidate", "required"]);
  const candidate = oid(input.candidate, "candidate commit ID");
  const required = array(input.required, "required checks");
  if (!required.length) throw new Error("Expected one or more required checks");
  const approval = new Map<string, { allowSkip: boolean; minimum?: number }>();
  for (const item of required) {
    const entry = record(item, "check policy");
    onlyKeys(entry, ["id", "allowSkip", "minimum"]);
    const id = identifier(entry.id, "check ID");
    if (approval.has(id) || (entry.allowSkip !== undefined && typeof entry.allowSkip !== "boolean")) {
      throw new Error(`Invalid or duplicate policy for ${id}`);
    }
    approval.set(id, {
      allowSkip: entry.allowSkip === true,
      minimum: entry.minimum === undefined ? undefined : threshold(entry.minimum, "required threshold"),
    });
  }
  const seen = new Set<string>();
  const { results } = config(receiptsPath);
  for (const item of array(results, "check results")) {
    const entry = record(item, "check result");
    const id = identifier(entry.id, "check ID");
    const policy = approval.get(id);
    if (!policy) continue;
    if (seen.has(id)) throw new Rejection(`Ambiguous results for required check ${id}`);
    seen.add(id);
    if (oid(entry.candidate, "result candidate") !== candidate) throw new Rejection(`Stale result for required check ${id}`);
    if (entry.status === "skipped" && policy.allowSkip && policy.minimum === undefined) continue;
    if (entry.status !== "completed" || entry.exitCode !== 0) {
      throw new Rejection(`Required check ${id} did not finish successfully`);
    }
    if (policy.minimum !== undefined) {
      const effective = threshold(entry.threshold, "effective threshold");
      const measured = threshold(entry.measured, "measured result");
      if (effective < policy.minimum) throw new Rejection(`Required check ${id} used a weakened threshold`);
      if (measured < effective) throw new Rejection(`Required check ${id} fell below its threshold`);
    }
  }
  const missing = [...approval.keys()].filter((id) => !seen.has(id));
  if (missing.length) throw new Rejection(`Missing required checks ${missing.join(", ")}`);
  return { candidate, checks: seen.size };
}
