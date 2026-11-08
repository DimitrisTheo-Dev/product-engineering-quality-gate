import test from "node:test";
import assert from "node:assert/strict";
import { resultLabel } from "../src/label.ts";

test("SYNTHETIC React fixture: result labels include empty and singular states", () => {
  assert.equal(resultLabel(0), "0 results");
  assert.equal(resultLabel(1), "1 result");
  assert.equal(resultLabel(2), "2 results");
  assert.throws(() => resultLabel(-1), /nonnegative integer/);
});
