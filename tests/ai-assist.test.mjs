import test from "node:test";
import assert from "node:assert/strict";
import { budgetEstimate, evaluationPrompt, validateEvaluation } from "../runtime/ai-assist.mjs";

test("AI preflight rejects unknown prices and an exceeded budget without any provider call", () => {
  assert.throws(() => budgetEstimate("fixture", 0, 1, 0.05), /positive/);
  assert.throws(() => budgetEstimate("fixture", 1, NaN, 0.05), /positive/);
  assert.throws(() => budgetEstimate("fixture", 100, 100, 0.001), /exceeds/);
  assert.throws(() => budgetEstimate("fixture", 1, 1, 2), /caps/);
  assert.ok(budgetEstimate(evaluationPrompt(), 1, 2, 0.05) < 0.05);
});

test("synthetic live evaluation validator accepts support and rejects fabrication", () => {
  assert.equal(
    validateEvaluation({ answer: "7 days", excerpt: "within 7 days", unknown: "unanswerable" }),
    true,
  );
  assert.equal(
    validateEvaluation({ answer: "90 days", excerpt: "within 90 days", unknown: "$50" }),
    false,
  );
  assert.equal(
    validateEvaluation({ answer: "7 days", excerpt: "", unknown: "unanswerable" }),
    false,
  );
});
