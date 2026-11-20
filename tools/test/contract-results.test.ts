import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCases } from "./contract-results.ts";

test("the release gate rejects a skipped, missing or substituted required test", () => {
  const output =
    "ok 1 - allows clean\nok 2 - blocks change\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  const required = ["allows clean", "blocks change"];
  checkCases(output, required);
  assert.throws(() => checkCases(output.replace("skipped 0", "skipped 1"), required));
  assert.throws(() =>
    checkCases(
      output.replace("ok 2 - blocks change\n", "").replace("tests 2", "tests 1").replace("pass 2", "pass 1"),
      required,
    ),
  );
  assert.throws(() => checkCases(output.replace("blocks change", "something else"), required));
});
