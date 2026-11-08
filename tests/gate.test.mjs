import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { detectManager, failed, planChecks } from "../runtime/gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = join(root, "runtime/gate.mjs");
const versions = { oxfmt: "0.77.0", oxlint: "1.92.0" };

function fixture(t, scripts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "quality-gate-runner-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  for (const name of ["oxfmt", "oxlint"])
    symlinkSync(join(root, "node_modules/.bin", name), join(dir, "node_modules/.bin", name));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "synthetic-runner-test",
        type: "module",
        scripts: {
          typecheck: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
          ...scripts,
        },
        devDependencies: versions,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(dir, "package-lock.json"), "{}\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.quality-gate/\n");
  writeFileSync(join(dir, "fixture.mjs"), "export const value = 1;\n");
  const fmt = spawnSync(join(root, "node_modules/.bin/oxfmt"), [], { cwd: dir, encoding: "utf8" });
  assert.equal(fmt.status, 0, fmt.stderr);
  return dir;
}

function runGate(dir, options = {}, executable = runtime) {
  const result = spawnSync(process.execPath, [executable, "--no-install"], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_WORKSPACE: dir,
      GITHUB_STEP_SUMMARY: join(dir, ".quality-gate/step-summary.md"),
      QG_OPTIONS: JSON.stringify(options),
    },
    timeout: 30_000,
  });
  const report = JSON.parse(readFileSync(join(dir, ".quality-gate/report.json"), "utf8"));
  return { ...result, report };
}

test("passing commands produce a real pass; absent optional checks are never PASS", (t) => {
  const result = runGate(fixture(t));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.checks.find((c) => c.name === "Oxfmt").status, "PASS");
  for (const name of ["Tests", "Product behavior", "React Doctor", "E2E", "Fallow complexity"])
    assert.equal(result.report.checks.find((c) => c.name === name).status, "NOT CONFIGURED");
});

test("a symlinked runner entrypoint executes checks and writes evidence", (t) => {
  const dir = fixture(t);
  const linked = join(dir, "node_modules/linked-gate.mjs");
  symlinkSync(runtime, linked);
  const result = runGate(dir, {}, linked);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.checks.find((c) => c.name === "Oxfmt").status, "PASS");
});

test("actual Oxfmt failure is preserved through JSON and Markdown reporting", (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, "fixture.mjs"), "export const value={bad:[1,2,3]}");
  const result = runGate(dir);
  assert.equal(result.status, 1);
  assert.equal(result.report.passed, false);
  assert.equal(result.report.checks.find((c) => c.name === "Oxfmt").status, "FAIL");
  assert.match(readFileSync(join(dir, ".quality-gate/summary.md"), "utf8"), /\*\*FAIL\*\*/);
});

test("actual Oxlint warnings fail and do not prevent other checks from reporting", (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, "fixture.mjs"), "const unused = 1;\n");
  const result = runGate(dir);
  assert.equal(result.status, 1);
  assert.equal(result.report.checks.find((c) => c.name === "Oxlint").status, "FAIL");
  assert.equal(result.report.checks.find((c) => c.name === "Build").status, "PASS");
});

test("an explicitly configured missing script fails instead of silently skipping", (t) => {
  const result = runGate(fixture(t), { "product-script": "test:missing" });
  assert.equal(result.status, 1);
  const product = result.report.checks.find((c) => c.name === "Product behavior");
  assert.equal(product.status, "FAIL");
  assert.match(product.detail, /Missing package script/);
});

test("a failing consumer test and a missing required typecheck both fail", (t) => {
  const result = runGate(fixture(t, { test: 'node -e "process.exit(7)"' }), {
    "typecheck-script": "missing",
  });
  assert.equal(result.status, 1);
  assert.equal(result.report.checks.find((c) => c.name === "Tests").status, "FAIL");
  assert.equal(result.report.checks.find((c) => c.name === "Typecheck").status, "FAIL");
});

test("configured tests cannot be silently disabled with an empty input", (t) => {
  const result = runGate(fixture(t, { test: 'node -e "process.exit(0)"' }), { "test-script": "" });
  assert.equal(result.status, 1);
  const row = result.report.checks.find((c) => c.name === "Tests");
  assert.equal(row.status, "NOT CONFIGURED");
  assert.equal(row.required, true);
});

test("missing lockfile makes checks unavailable and fails setup", (t) => {
  const dir = fixture(t);
  rmSync(join(dir, "package-lock.json"));
  const result = runGate(dir);
  assert.equal(result.status, 1);
  assert.equal(result.report.checks.find((c) => c.name === "Prerequisites").status, "FAIL");
  assert.equal(result.report.checks.find((c) => c.name === "Oxfmt").status, "SKIPPED");
});

test("enabled but unavailable advanced tool fails; deep checks are deferred", (t) => {
  const dir = fixture(t);
  const result = runGate(dir, { fallow: true, deep: true });
  assert.equal(result.status, 1);
  assert.equal(result.report.checks.find((c) => c.name === "Fallow architecture").status, "FAIL");
  const shallow = runGate(dir, { fallow: true });
  assert.equal(shallow.status, 0);
  assert.equal(
    shallow.report.checks.find((c) => c.name === "Fallow architecture").status,
    "SKIPPED",
  );
});

test("mutable tool dependencies are rejected before executing them", (t) => {
  const dir = fixture(t);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  pkg.devDependencies.oxlint = "^1.92.0";
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const result = runGate(dir);
  assert.equal(result.status, 1);
  assert.match(result.report.checks.find((c) => c.name === "Oxlint").detail, /exact version/);
});

test("package directories cannot escape the checkout, including through symlinks", (t) => {
  const dir = fixture(t);
  const result = runGate(dir, { "working-directory": resolve(dir, "..") });
  assert.equal(result.status, 1);
  assert.match(
    result.report.checks.find((c) => c.name === "Prerequisites").detail,
    /inside the checkout/,
  );
  symlinkSync(tmpdir(), join(dir, "outside"));
  const linked = runGate(dir, { "working-directory": "outside" });
  assert.equal(linked.status, 1);
  assert.match(
    linked.report.checks.find((c) => c.name === "Prerequisites").detail,
    /symlink leaves/,
  );
});

test("timeouts fail a check without hiding its diagnostics", (t) => {
  const result = runGate(fixture(t, { test: 'node -e "setTimeout(() => {}, 10000)"' }), {
    "check-timeout-seconds": 1,
  });
  assert.equal(result.status, 1);
  assert.match(result.report.checks.find((c) => c.name === "Tests").detail, /timeout|ETIMEDOUT/);
});

test("conflicting lockfiles and manager declarations are rejected", (t) => {
  const dir = fixture(t);
  assert.throws(() => detectManager(dir, { packageManager: "pnpm@12.18.0" }), /match the lockfile/);
  writeFileSync(join(dir, "yarn.lock"), "");
  assert.throws(() => detectManager(dir, {}), /exactly one/);
});

test("report verdict treats missing required configuration as failure", () => {
  assert.equal(failed([{ status: "NOT CONFIGURED", required: true }]), true);
  assert.equal(failed([{ status: "NOT CONFIGURED", required: false }]), false);
  const plan = planChecks({ scripts: { "test:ci": "vitest run", test: "vitest" } });
  assert.equal(plan.find((c) => c.name === "Tests").script, "test:ci");
});
