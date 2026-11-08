import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "../src/greet.ts";

test("SYNTHETIC Node fixture: a valid name is normalized", () => {
  assert.equal(greet(" Ada "), "Hello, Ada");
});
test("SYNTHETIC Node fixture: empty input is rejected", () => {
  assert.throws(() => greet(" "), /Name is required/);
});
