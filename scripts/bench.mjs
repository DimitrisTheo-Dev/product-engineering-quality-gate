import assert from "node:assert/strict";
import { presets } from "./presets.mjs";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { samples: { type: "string", default: "5" }, fixture: { type: "string" } },
});
const samples = Number(values.samples);
if (!Number.isInteger(samples) || samples < 5) throw new Error("--samples must be at least 5.");

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = join(root, "runtime/gate.mjs");
const fixtures = [
  { name: "node-ts", browser: false },
  { name: "bench-vite-react", browser: true },
].filter(({ name }) => !values.fixture || name === values.fixture);
if (!fixtures.length) throw new Error("--fixture must be node-ts or bench-vite-react.");
const ignored = new Set([
  "node_modules",
  "dist",
  ".quality-gate",
  "test-results",
  "playwright-report",
]);

/** @typedef {{startupMs: number, configurationMs: number, managerResolutionMs: number, installMs: number | null, checks: {name: string, ms: number}[], reportingMs: number}} Timings */
/** @typedef {Map<string, number[]>} Samples */

function run(command, args, cwd, env = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: "true", ...env },
    encoding: "utf8",
    timeout: 360_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const ms = performance.now() - started;
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.error?.message ?? result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  return { ms, stdout: result.stdout.trim() };
}

function runGate(dir, cache, options, install = true, context = {}) {
  rmSync(join(dir, ".quality-gate"), { recursive: true, force: true });
  const { ms } = run(process.execPath, install ? [runtime] : [runtime, "--no-install"], dir, {
    GITHUB_WORKSPACE: dir,
    GITHUB_STEP_SUMMARY: "",
    QG_LOCAL_CACHE_PARENT: cache,
    QG_OPTIONS: JSON.stringify(options),
    ...context,
  });
  const report = JSON.parse(readFileSync(join(dir, ".quality-gate/report.json"), "utf8"));
  assert.equal(report.passed, true);
  return { wallMs: ms, timings: /** @type {Timings} */ (report.timings), report };
}

function record(/** @type {Samples} */ metrics, name, ms) {
  assert.ok(Number.isFinite(ms), `${name} did not produce a timing`);
  if (!metrics.has(name)) metrics.set(name, []);
  metrics.get(name)?.push(ms);
}

function runRealChecks(dir, cache, metrics) {
  const { wallMs, timings } = runGate(dir, cache, {});
  record(metrics, "Gate wall time", wallMs);
  record(metrics, "Runtime start", timings.startupMs);
  record(metrics, "Configuration (includes manager detection)", timings.configurationMs);
  record(metrics, "Package-manager resolution", timings.managerResolutionMs);
  record(metrics, "Locked install", timings.installMs);
  for (const check of timings.checks) record(metrics, check.name, check.ms);
  record(metrics, "Reporting", timings.reportingMs);
}

function runLaunchChecks(dir, cache, metrics) {
  const script = "bench:noop";
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.scripts[script] = 'node -e ""';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  const bare = run(process.execPath, ["-e", ""], dir).ms;
  record(metrics, "Bare Node", bare);
  record(metrics, "npm run noop", run("npm", ["run", script], dir).ms);
  record(metrics, "node --run noop", run(process.execPath, ["--run", script], dir).ms);
  const path = join(dir, "quality-gate.config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  const expected = config.checks.filter(({ kind }) => !["lint", "format"].includes(kind));
  for (const check of expected) check.script = script;
  for (const [probe, runner] of [
    ["Gate noop", undefined],
    ["Opt-in Node noop", "node"],
  ]) {
    for (const check of expected) check.runner = runner;
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
    const { timings } = runGate(dir, cache, {}, false);
    const scriptTimings = timings.checks.filter(({ name }) =>
      expected.some((check) => check.name === name),
    );
    assert.equal(scriptTimings.length, expected.length);
    for (const { name, ms } of scriptTimings) {
      record(metrics, `${probe} (${name})`, ms);
      record(metrics, `${probe} minus bare Node (${name})`, ms - bare);
    }
  }
}

function configure(dir, browser) {
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  Object.assign(pkg.scripts, presets.oxc.scripts);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  const config = {
    tools: ["oxfmt", "oxlint", ...(browser ? ["@playwright/test"] : [])],
    checks: [
      ...presets.oxc.checks,
      { name: "Typecheck", kind: "typecheck", script: "typecheck", concurrent: true },
      { name: "Tests", kind: "test", script: "test" },
      { name: "Build", kind: "build", script: "build" },
      ...(browser
        ? [{ name: "Smoke", kind: "smoke", script: "test:browser", paths: ["src/**", "e2e/**"] }]
        : []),
    ],
  };
  writeFileSync(join(dir, "quality-gate.config.json"), JSON.stringify(config, null, 2) + "\n");
}

function measureDocsOnly(dir, cache) {
  const git = (...args) =>
    run(
      "git",
      ["-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.test", ...args],
      dir,
    ).stdout;
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "Baseline");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "README.md"), "# A documentation-only change\n");
  git("add", "README.md");
  git("commit", "-m", "Edit docs");
  const { report, wallMs } = runGate(dir, cache, {}, true, {
    QG_CHANGE_EVENT: "merge_group",
    QG_CHANGE_BASE: base,
    QG_CHANGE_HEAD: git("rev-parse", "HEAD"),
  });
  assert.equal(report.checks.find((row) => row.name === "Smoke").reason, "no-matching-changes");
  return wallMs;
}

function describe(/** @type {number[] | undefined} */ values) {
  assert.equal(values?.length, samples, "metric missing observations");
  assert.ok(values);
  const sorted = values.toSorted((a, b) => a - b);
  const median =
    (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  return `${median.toFixed(2)} (${sorted[0].toFixed(2)}–${sorted[sorted.length - 1].toFixed(2)})`;
}

console.log(
  `Node ${process.version}, npm ${run("npm", ["--version"], root).stdout}, ${process.platform}/${process.arch}, ${availableParallelism()} available CPUs, ${samples} pairs per fixture.`,
);
console.log(
  "Milliseconds shown as median (min–max). Cold and warm use fresh fixture directories and share only the npm download cache within each pair.",
);

const sandbox = mkdtempSync(join(tmpdir(), "quality-gate-bench-"));
try {
  for (const { name, browser } of fixtures) {
    /** @type {Samples} */
    const cold = new Map();
    /** @type {Samples} */
    const warm = new Map();
    /** @type {Samples} */
    const launches = new Map();
    let docsOnlyMs;
    for (let index = 1; index <= samples; index++) {
      console.error(`${name}: sample ${index}/${samples}`);
      const pair = join(sandbox, name, String(index));
      const cache = join(pair, "npm-cache");
      const coldDir = join(pair, "cold");
      const warmDir = join(pair, "warm");
      for (const dir of [coldDir, warmDir]) {
        cpSync(join(root, "examples", name), dir, {
          recursive: true,
          filter: (path) => !ignored.has(basename(path)),
        });
        configure(dir, browser);
      }
      runRealChecks(coldDir, cache, cold);
      runRealChecks(warmDir, cache, warm);
      if (browser && index === samples) docsOnlyMs = measureDocsOnly(warmDir, cache);
      runLaunchChecks(warmDir, cache, launches);
      rmSync(pair, { recursive: true, force: true });
    }
    console.log(`\n## ${name}\n\n| Phase | Cold | Warm |\n| --- | ---: | ---: |`);
    for (const [name, values] of cold)
      console.log(`| ${name} | ${describe(values)} | ${describe(warm.get(name))} |`);
    console.log("\n| Launch probe | Duration |\n| --- | ---: |");
    for (const [name, values] of launches) console.log(`| ${name} | ${describe(values)} |`);
    if (docsOnlyMs !== undefined)
      console.log(
        `\nDocs-only warm run: ${docsOnlyMs.toFixed(2)} ms; Smoke SKIPPED (no-matching-changes).`,
      );
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
