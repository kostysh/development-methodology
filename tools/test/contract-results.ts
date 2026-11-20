import assert from "node:assert/strict";

/** Match Node's top-level TAP summary and exact names. A passing subset is insufficient. */
export function checkCases(output: string, required: string[]) {
  const counts = new Map(
    [...output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gmu)].map((match) => [
      match[1],
      Number(match[2]),
    ]),
  );
  const names = [...output.matchAll(/^ok \d+ - (.+)$/gmu)].map((match) => match[1]).sort();
  for (const key of ["fail", "cancelled", "skipped", "todo"]) assert.equal(counts.get(key), 0, key);
  assert.ok(required.length, "Empty acceptance inventory");
  assert.equal(counts.get("tests"), required.length, "Total required cases");
  assert.equal(counts.get("pass"), required.length, "Passing required cases");
  assert.deepEqual(names, [...required].sort(), "Named required cases");
}
