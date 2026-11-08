import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = new URL("../", import.meta.url);
function workflow(name) {
  return YAML.parse(readFileSync(new URL(`.github/workflows/${name}.yml`, root), "utf8"));
}

test("the PR workflow requires no secrets, persisted credentials, or caches", () => {
  const gate = workflow("quality-gate");
  assert.deepEqual(gate.permissions, { contents: "read" });
  assert.equal(gate.on.workflow_call.secrets, undefined);
  assert.equal(gate.on.pull_request_target, undefined);
  assert.equal(gate.jobs.quality["runs-on"], "ubuntu-24.04");
  assert.ok(gate.jobs.quality["timeout-minutes"] <= 30);
  for (const step of gate.jobs.quality.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert.notEqual(step["continue-on-error"], true);
    assert.ok(!step.uses?.startsWith("actions/cache"));
  }
  assert.equal(
    gate.jobs.quality.steps.find((step) => step.id === "checkout").with["persist-credentials"],
    false,
  );
});

test("checked-in workflow executes the exact tested runtime", () => {
  const run = workflow("quality-gate").jobs.quality.steps.find((step) => step.id === "checks").run;
  const runtime = readFileSync(new URL("runtime/gate.mjs", root), "utf8");
  assert.ok(run.includes(runtime));
  assert.match(run, /if \(!result.passed\) process.exitCode = 1/);
});

test("AI workflow has a manual trusted-default-branch allowlist and never installs consumer code", () => {
  const ai = workflow("ai-assist");
  assert.deepEqual(Object.keys(ai.on).sort(), ["workflow_call", "workflow_dispatch"]);
  const job = ai.jobs.provider;
  assert.match(job.if, /github.event_name == 'workflow_dispatch'/);
  assert.match(job.if, /github.ref_name == github.event.repository.default_branch/);
  assert.match(job.if, /inputs.confirm/);
  assert.match(job.if, /vars.ENABLE_AI_ASSIST == 'true'/);
  assert.equal(job.environment, "ai-assist");
  assert.equal(job.steps[0].with.ref, "${{ github.event.repository.default_branch }}");
  assert.equal(job.steps.filter((step) => step.env?.OPENAI_API_KEY).length, 1);
  const runtime = readFileSync(fileURLToPath(new URL("runtime/ai-assist.mjs", root)), "utf8");
  assert.ok(job.steps.at(-1).run.includes(runtime));
  assert.ok(!runtime.includes("npm install"));
});
