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
import { gunzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
function workflow(name) {
  return YAML.parse(readFileSync(new URL(`.github/workflows/${name}.yml`, root), "utf8"));
}

test("the PR workflow keeps read-only permissions and pins actions", () => {
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
    if (step.run) assert.ok(step.run.length <= 21_000);
  }
  assert.equal(
    gate.jobs.quality.steps.find((step) => step.id === "checkout").with["persist-credentials"],
    false,
  );
});

test("checked-in workflow executes the exact tested runtime", () => {
  const run = workflow("quality-gate").jobs.quality.steps.find((step) => step.id === "checks").run;
  const runtime = readFileSync(new URL("runtime/gate.mjs", root), "utf8");
  const plan = workflow("quality-gate").jobs.quality.steps.find((step) => step.id === "plan");
  for (const script of [run, plan.run]) {
    const embedded = script.match(/const embedded = `([A-Za-z0-9+/=\n]+)`;/)[1];
    assert.equal(gunzipSync(Buffer.from(embedded, "base64")).toString("utf8"), runtime);
  }
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

test("cache restores exact download stores and saves only after a default-branch push miss", () => {
  const steps = workflow("quality-gate").jobs.quality.steps;
  const [plan, restore, checks, save] = ["plan", "restore", "checks", "save"].map((id) =>
    steps.find((step) => step.id === id),
  );
  assert.ok(steps.indexOf(plan) < steps.indexOf(restore));
  assert.ok(steps.indexOf(restore) < steps.indexOf(checks));
  assert.ok(steps.indexOf(checks) < steps.indexOf(save));
  assert.match(restore.uses, /^actions\/cache\/restore@/);
  assert.match(save.uses, /^actions\/cache\/save@/);
  assert.deepEqual(save.with, restore.with);
  assert.equal(
    save.if,
    "${{ success() && github.event_name == 'push' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch) && steps.plan.outputs.key != '' && steps.restore.outputs.cache-hit != 'true' }}",
  );
});

test("Bun provisioning is pinned, exact and conditional on the manager plan", () => {
  const steps = workflow("quality-gate").jobs.quality.steps;
  const bun = steps.find((step) => step.id === "bun");
  assert.match(bun.uses, /^oven-sh\/setup-bun@[a-f0-9]{40}$/);
  assert.equal(bun.if, "${{ steps.plan.outputs.manager == 'bun' }}");
  assert.deepEqual(bun.with, { "bun-version": "${{ steps.plan.outputs.version }}" });
  assert.ok(steps.indexOf(bun) < steps.findIndex((step) => step.id === "checks"));
});

test("embedded steps run in a standalone checkout and publish passing and failing verdicts", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "qg-embedded-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const checkout = join(sandbox, "consumer");
  cpSync(new URL("examples/canary/", root), checkout, { recursive: true });
  const platform = {
    GITHUB_WORKSPACE: checkout,
    GITHUB_STEP_SUMMARY: join(sandbox, "summary.md"),
    RUNNER_TEMP: sandbox,
  };
  const steps = workflow("quality-gate").jobs.quality.steps;
  const run = (id, extra = {}) =>
    spawnSync("bash", ["-e", "-c", steps.find((step) => step.id === id).run], {
      cwd: checkout,
      encoding: "utf8",
      timeout: 45_000,
      env: { ...process.env, ...platform, ...extra },
    });
  const plan = run("plan", { GITHUB_OUTPUT: join(sandbox, "plan.txt") });
  assert.equal(plan.status, 0, plan.stderr);
  const version = readFileSync(join(sandbox, "plan.txt"), "utf8").match(/^version=(.+)$/m)[1];
  for (const [config, code, outcome] of [
    ["quality-gate.config.json", 0, "success"],
    ["failure.config.json", 1, "failure"],
  ]) {
    const checks = run("checks", {
      GITHUB_ACTIONS: "true",
      QG_OPTIONS: JSON.stringify({ config }),
      QG_PLANNED_VERSION: version,
    });
    assert.equal(checks.status, code, checks.stderr + checks.stdout);
    const report = JSON.parse(readFileSync(join(checkout, ".quality-gate/report.json"), "utf8"));
    const release = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    assert.equal(report.version, release.version);
    if (code) assert.match(checks.stderr, /::error::Build.*Missing package script/);
    const artifact = join(sandbox, `result-${outcome}.txt`);
    const verifier = run("verdict", { QG_OUTCOME: outcome, GITHUB_OUTPUT: artifact });
    assert.equal(verifier.status, 0, verifier.stderr);
    assert.equal(readFileSync(artifact, "utf8"), `passed=${code === 0}\n`);
  }
  const link = run("report_link", { QG_REPORT_URL: "https://example.test/quality-report" });
  assert.equal(link.status, 0, link.stderr);
  assert.match(
    readFileSync(platform.GITHUB_STEP_SUMMARY, "utf8"),
    /Download the JSON and Markdown report/,
  );
  rmSync(join(checkout, ".quality-gate/report.json"));
  assert.equal(run("verdict", { QG_OUTCOME: "failure" }).status, 1);
});
