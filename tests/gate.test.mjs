import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { detectManager, failed } from "../runtime/gate.mjs";
import { verifyReport } from "../runtime/assert-report.mjs";

const runtime = fileURLToPath(new URL("../runtime/gate.mjs", import.meta.url));
const checks = ["typecheck", "test", "build"].map((name) => ({ name, kind: name, script: name }));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "quality-gate-runner-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "quality-gate.config.json"), JSON.stringify({ checks }));
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ name: "test-fixture", lockfileVersion: 3, packages: {} }),
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-fixture",
      scripts: {
        prepare: "node -e 'process.exit(17)'",
        ...Object.fromEntries(checks.map(({ script }) => [script, 'node -e ""'])),
      },
    }),
  );
  return dir;
}

function gate(dir, options = {}, executable = runtime, install = false) {
  rmSync(join(dir, ".quality-gate"), { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    install ? [executable] : [executable, "--no-install"],
    {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_WORKSPACE: dir,
        GITHUB_STEP_SUMMARY: "",
        QG_OPTIONS: JSON.stringify(options),
      },
      timeout: 30_000,
    },
  );
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(join(dir, ".quality-gate/report.json"), "utf8"));
  return { ...result, report };
}

test("report and process verdicts mirror every combination of command outcomes", (t) => {
  const dir = fixture(t);
  for (let mask = 0; mask < 8; mask++) {
    const scripts = Object.fromEntries(
      checks.map(({ script }, index) => [
        script,
        `node -e "require('node:fs').appendFileSync('executed', '${script}\\n'); process.exit(${Number(Boolean(mask & (1 << index)))})"`,
      ]),
    );
    writeFileSync(join(dir, "executed"), "");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
    const { status, report } = gate(dir);
    assert.equal(status, Number(mask !== 0));
    assert.equal(report.passed, !failed(report.checks));
    assert.equal(report.passed, mask === 0);
    assert.equal(verifyReport(dir, status === 0 ? "success" : "failure"), report.passed);
    const executed = readFileSync(join(dir, "executed"), "utf8").trim().split("\n");
    for (const [index, row] of report.checks.entries()) {
      assert.equal(row.status, mask & (1 << index) ? "FAIL" : "PASS");
      assert.equal(row.body, scripts[row.script]);
      assert.ok(executed.includes(row.script));
    }
  }
});

test("a symlinked entrypoint executes checks and writes evidence", (t) => {
  const dir = fixture(t);
  const linked = join(dir, "runner.mjs");
  symlinkSync(runtime, linked);
  assert.equal(gate(dir, {}, linked).status, 0);
});

test("locked install skips lifecycle hooks and records durations on success and failure", (t) => {
  const dir = fixture(t);
  const { report, status } = gate(dir, {}, runtime, true);
  assert.equal(status, 0);
  const install = report.checks.find((row) => row.name === "Locked dependency installation");
  assert.equal(install.status, "PASS");
  assert.ok(Number.isFinite(install.seconds));
  for (const key of [
    "startupMs",
    "configurationMs",
    "managerResolutionMs",
    "installMs",
    "reportingMs",
  ])
    assert.ok(Number.isFinite(report.timings[key]), key);
  writeFileSync(join(dir, "package-lock.json"), "not JSON");
  const rejected = gate(dir, {}, runtime, true);
  assert.equal(rejected.status, 1);
  assert.ok(Number.isFinite(rejected.report.timings.installMs));
  assert.ok(rejected.report.checks.slice(1).every((row) => row.reason === "prerequisite-failed"));
  rmSync(join(dir, "package-lock.json"));
  const unavailable = gate(dir);
  assert.equal(unavailable.report.timings.installMs, null);
  assert.equal(unavailable.report.checks[0].name, "Configuration");
});

test("package and config paths cannot escape the checkout", (t) => {
  const dir = fixture(t);
  assert.match(
    gate(dir, { "working-directory": resolve(dir, "..") }).stderr,
    /relative path|inside/,
  );
  symlinkSync(tmpdir(), join(dir, "outside"));
  assert.match(gate(dir, { "working-directory": "outside" }).stderr, /symlink leaves/);
  assert.match(gate(dir, { config: ".." }).stderr, /inside/);
});

test("conflicting lockfiles and manager declarations are rejected", (t) => {
  const dir = fixture(t);
  assert.throws(() => detectManager(dir, { packageManager: "pnpm@12.18.0" }), /match the lockfile/);
  writeFileSync(join(dir, "yarn.lock"), "");
  assert.throws(() => detectManager(dir, {}), /exactly one/);
});

test("report assertion rejects missing, contradictory and substituted reports", (t) => {
  const dir = fixture(t);
  assert.throws(() => verifyReport(dir, "failure"), /could not be verified/);
  gate(dir);
  assert.throws(() => verifyReport(dir, "failure"), /could not be verified/);
  const report = join(dir, ".quality-gate/report.json");
  rmSync(report);
  symlinkSync(join(dir, "package.json"), report);
  assert.throws(() => verifyReport(dir, "success"), /could not be verified/);
});

test("Bun requires a pinned version and the committed text lockfile", (t) => {
  const dir = fixture(t);
  rmSync(join(dir, "package-lock.json"));
  const binary = join(dir, "bun.lockb");
  writeFileSync(binary, "");
  assert.throws(
    () => detectManager(dir, {}),
    /--save-text-lockfile --frozen-lockfile --lockfile-only/,
  );
  rmSync(binary);
  writeFileSync(join(dir, "bun.lock"), "{}");
  assert.throws(() => detectManager(dir, {}), /bun@x.y.z/);
  assert.throws(() => detectManager(dir, { packageManager: "bun@1.4.4-beta.1" }), /bun@x.y.z/);
  assert.equal(detectManager(dir, { packageManager: "bun@1.4.4" }).lockfile, "bun.lock");
  writeFileSync(join(dir, "package-lock.json"), "{}");
  assert.throws(() => detectManager(dir, { packageManager: "bun@1.4.4" }), /exactly one/);
});

test("browser evidence stays in the checkout and rejects symlinks", async (t) => {
  const dir = fixture(t);
  const browser = join(dir, "test-results");
  mkdirSync(browser);
  writeFileSync(join(browser, "trace.txt"), "test trace");
  const { browserEvidence } = await import("../runtime/assert-report.mjs");
  assert.deepEqual(browserEvidence(dir, "."), { browserResults: "test-results/" });
  assert.deepEqual(browserEvidence(dir, ".."), {});
  symlinkSync(join(dir, "package.json"), join(browser, "link.txt"));
  assert.deepEqual(browserEvidence(dir, "."), {});
});
