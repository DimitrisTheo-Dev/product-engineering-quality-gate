import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.ok(Object.keys(gate.on.workflow_call.inputs).length <= 8);
  assert.deepEqual(Object.keys(gate.on.workflow_call.outputs).sort(), ["passed", "report"]);
  const source = readFileSync(new URL(".github/workflows/quality-gate.yml", root), "utf8");
  for (const line of source.split("\n").filter((line) => /^\s+uses:/.test(line)))
    assert.match(line, /@[a-f0-9]{40} # v\d/);
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
  assert.match(run, /<<'QUALITY_GATE_RUNTIME'/);
  const steps = workflow("quality-gate").jobs.quality.steps;
  const verify = steps.find((step) => step.id === "verdict");
  const verifier = readFileSync(new URL("runtime/assert-report.mjs", root), "utf8");
  assert.ok(verify.run.includes(verifier));
  assert.equal(steps.find((step) => step.id === "report").with["if-no-files-found"], "error");
});

test("generated run bodies use the environment for workflow expressions", () => {
  for (const name of ["quality-gate", "ai-assist", "benchmark"]) {
    for (const job of Object.values(workflow(name).jobs)) {
      for (const step of job.steps ?? []) {
        if (step.run) assert.ok(!step.run.includes("${{"), `${name}: ${step.name}`);
      }
    }
  }
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

test("generator refuses a delimiter that occurs on its own embedded line", (t) => {
  const path = mkdtempSync(join(tmpdir(), "qg-heredoc-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  for (const name of ["scripts", "runtime", "package.json"])
    cpSync(new URL(name, root), join(path, name), { recursive: true });
  mkdirSync(join(path, ".github/workflows"), { recursive: true });
  symlinkSync(fileURLToPath(new URL("node_modules", root)), join(path, "node_modules"));
  appendFileSync(join(path, "runtime/gate.mjs"), "\n/*\nQUALITY_GATE_RUNTIME\n*/\n");
  const run = spawnSync(process.execPath, ["scripts/build-workflow.mjs"], {
    cwd: path,
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Embedded source contains the heredoc delimiter QUALITY_GATE_RUNTIME/);
});
