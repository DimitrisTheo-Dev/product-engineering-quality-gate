import assert from "node:assert/strict";
import test from "node:test";
import { greeting } from "./message.mjs";

test("the locked dependency produces the expected greeting", () => {
  assert.equal(greeting(), "Quality gate canary");
});
