import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runtime = fileURLToPath(new URL("../runtime/gate.mjs", import.meta.url));
const checks = [
  { name: "Types", kind: "typecheck", script: "types" },
  { name: "Tests", kind: "test", script: "test" },
  { name: "Build", kind: "build", script: "build" },
];

function fixture(t, config = {}, scripts = {}, dependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), "qg-v2-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const noop = 'node -e ""';
  const write = (path, value) =>
    writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n");
  write("package.json", {
    scripts: { types: noop, test: noop, build: noop, ...scripts },
    devDependencies: dependencies,
  });
  write("package-lock.json", {});
  write("quality-gate.config.json", { checks, ...config });
  return root;
}

function gate(root, options = {}, env = {}) {
  const result = spawnSync(process.execPath, [runtime, "--no-install"], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      GITHUB_STEP_SUMMARY: "",
      QG_OPTIONS: JSON.stringify(options),
      ...env,
    },
  });
  assert.ifError(result.error);
  return {
    ...result,
    report: JSON.parse(readFileSync(join(root, ".quality-gate/report.json"), "utf8")),
    summary: readFileSync(join(root, ".quality-gate/summary.md"), "utf8"),
  };
}

test("setup executes before test and product checks and a failure prevents checks", (t) => {
  const root = fixture(
    t,
    { setup: ["prepare:fixture"] },
    {
      "prepare:fixture": "node -e \"require('node:fs').writeFileSync('prepared', 'yes')\"",
      test: "node -e \"require('node:fs').accessSync('prepared')\"",
    },
  );
  assert.equal(gate(root).status, 0);
  rmSync(join(root, "prepared"));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  pkg.scripts["prepare:fixture"] = 'node -e "process.exit(5)"';
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  const { report, status } = gate(root);
  assert.equal(status, 1);
  assert.equal(report.checks.find((row) => row.name === "Tests").reason, "prerequisite-failed");
});

test("auto is a literal script name and missing named scripts are FAIL", (t) => {
  const root = fixture(
    t,
    { checks: [{ ...checks[0], script: "auto" }, ...checks.slice(1)] },
    {
      auto: 'node -e "process.exit(3)"',
    },
  );
  const { report, status } = gate(root);
  assert.equal(status, 1);
  assert.equal(report.checks.find((row) => row.name === "Types").body, 'node -e "process.exit(3)"');
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  delete pkg.scripts.auto;
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  const missing = gate(root);
  assert.equal(missing.report.checks.find((row) => row.name === "Types").status, "FAIL");
  assert.match(missing.report.checks.find((row) => row.name === "Types").detail, /Missing.*auto/);
});

test("strict policy requires explicit waivers and deep skips carry a reason", (t) => {
  const root = fixture(t, {
    checks: [...checks.slice(1), { name: "Browser", kind: "e2e", script: "test", tier: "deep" }],
  });
  assert.match(gate(root).stderr, /typecheck/);
  const path = join(root, "quality-gate.config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.policy = { waive: ["typecheck"] };
  writeFileSync(path, JSON.stringify(config));
  const { status, report } = gate(root);
  assert.equal(status, 0);
  assert.deepEqual(
    report.checks.filter((row) => row.status === "SKIPPED").map((row) => row.reason),
    ["waived", "deep-tier"],
  );
  config.checks[0].typo = true;
  writeFileSync(path, JSON.stringify(config));
  assert.match(gate(root).stderr, /typo/);
});

test("child environment hides workflow file commands and gate options", (t) => {
  const names = [
    "GITHUB_ENV",
    "GITHUB_PATH",
    "GITHUB_OUTPUT",
    "GITHUB_STATE",
    "GITHUB_STEP_SUMMARY",
    "QG_OPTIONS",
  ];
  const root = fixture(
    t,
    {},
    {
      test: `node -e "process.exit(Number(${JSON.stringify(names).replaceAll('"', "'")}.some(k => k in process.env)))"`,
    },
  );
  const env = Object.fromEntries(names.slice(0, -1).map((key) => [key, join(root, key)]));
  assert.equal(gate(root, {}, env).status, 0);
});

test("summary displays untrusted text as code and omits fixture commentary", (t) => {
  const root = fixture(t, {
    checks: [{ ...checks[0], name: "![remote](https://example.test) | `x`" }, ...checks.slice(1)],
  });
  const { status, summary } = gate(root);
  assert.equal(status, 0);
  assert.match(summary, /`{2,} .*example\.test.*`{2,}/);
  assert.doesNotMatch(summary, /Synthetic fixtures|live AI/);
});

test("timeout allows a consumer to flush on SIGTERM and still fails", (t) => {
  const root = fixture(t, {}, { test: "node flush.cjs" });
  writeFileSync(
    join(root, "flush.cjs"),
    `
    process.on("SIGTERM", () => {
      require("node:fs").writeFileSync("trace", "flushed");
      process.exit(0);
    });
    setInterval(() => {}, 100);
  `,
  );
  const { status, report } = gate(root, { "check-timeout-seconds": 1 });
  assert.equal(status, 1);
  assert.match(report.checks.find((row) => row.name === "Tests").detail, /timeout/i);
  assert.equal(readFileSync(join(root, "trace"), "utf8"), "flushed");
});

test("selected tools require an exact declaration and the installed version", (t) => {
  const root = fixture(t, { tools: ["@example/tool"] }, {}, { "@example/tool": "1.2.3" });
  const dir = join(root, "node_modules/@example/tool");
  mkdirSync(dir, { recursive: true });
  const manifest = join(dir, "package.json");
  writeFileSync(manifest, JSON.stringify({ version: "1.2.2" }));
  assert.match(gate(root).stderr, /1\.2\.3.*1\.2\.2/);
  writeFileSync(manifest, JSON.stringify({ version: "1.2.3" }));
  assert.deepEqual(gate(root).report.tools, { "@example/tool": "1.2.3" });
});

test("paths skip docs-only changes and run when a control file changes or diff is unknown", (t) => {
  const root = fixture(
    t,
    {
      checks: [
        ...checks,
        {
          name: "Heavy browser check",
          kind: "e2e",
          script: "browser",
          paths: ["src/**", "e2e/**"],
        },
      ],
    },
    { browser: 'node -e "console.log(process.env.QG_BASE_SHA, process.env.QG_HEAD_SHA)"' },
  );
  const git = (...args) => {
    const result = spawnSync(
      "git",
      ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "Base");
  const base = git("rev-parse", "HEAD");
  git("checkout", "-b", "feature");
  writeFileSync(join(root, "README.md"), "Docs only.");
  git("add", "README.md");
  git("commit", "-m", "Docs");
  const docs = git("rev-parse", "HEAD");
  git("checkout", "main");
  git("merge", "--no-ff", "feature", "-m", "GitHub-style PR merge");
  const getRow = (event, head) => {
    const { report, stdout } = gate(
      root,
      {},
      {
        QG_CHANGE_EVENT: event,
        QG_CHANGE_BASE: base,
        QG_CHANGE_HEAD: head,
      },
    );
    return { row: report.checks.find(({ name }) => name === "Heavy browser check"), stdout };
  };
  assert.equal(getRow("pull_request", docs).row.reason, "no-matching-changes");
  assert.equal(getRow("merge_group", git("rev-parse", "HEAD")).row.reason, "no-matching-changes");
  assert.equal(getRow("push", docs).row.status, "PASS");
  assert.equal(getRow("pull_request", "a".repeat(40)).row.status, "PASS");
  const packagePath = join(root, "package.json");
  writeFileSync(packagePath, readFileSync(packagePath, "utf8") + "\n");
  git("add", "package.json");
  git("commit", "-m", "Control file");
  const head = git("rev-parse", "HEAD");
  const { row, stdout } = getRow("merge_group", head);
  assert.equal(row.status, "PASS");
  assert.ok(stdout.includes(`${base} ${head}`));
});

test("consecutive concurrent checks overlap and preserve report order", (t) => {
  if (availableParallelism() < 2) {
    t.skip("Requires at least two available CPUs.");
    return;
  }
  const root = fixture(
    t,
    { checks: [{ ...checks[0], concurrent: true }, { ...checks[1], concurrent: true }, checks[2]] },
    {
      types: "node wait.cjs",
      test: "node -e \"require('node:fs').writeFileSync('started', 'yes')\"",
      build: "node -e \"require('node:fs').accessSync('done')\"",
    },
  );
  writeFileSync(
    join(root, "wait.cjs"),
    `
    const fs = require("node:fs");
    const watch = setInterval(() => {
      if (!fs.existsSync("started")) return;
      fs.writeFileSync("done", "yes");
      clearInterval(watch);
    }, 20);
  `,
  );
  const { report, status, stdout } = gate(root, { "check-timeout-seconds": 3 });
  assert.equal(status, 0);
  assert.match(stdout, /::group::Tests/);
  assert.deepEqual(
    report.checks.map((row) => row.name),
    checks.map((check) => check.name),
  );
  assert.deepEqual(
    report.timings.checks.map((row) => row.name),
    checks.map((check) => check.name),
  );
});

test("opt-in Node launch preserves command output and falls back for npm hooks and defaults", (t) => {
  const root = fixture(
    t,
    { checks: [{ ...checks[0], runner: "node" }, { ...checks[1], runner: "node" }, checks[2]] },
    {
      types: "node -e \"console.log('same result')\"",
      pretest: "node -e \"require('node:fs').writeFileSync('pre', 'yes')\"",
      test: "node -e \"require('node:fs').accessSync('pre')\"",
      posttest: "node -e \"require('node:fs').writeFileSync('post', 'yes')\"",
      build: "node -e \"if (process.env.npm_lifecycle_event !== 'build') process.exit(1)\"",
    },
  );
  const { report, status, stdout } = gate(root);
  assert.equal(status, 0);
  assert.match(stdout, /same result/);
  assert.deepEqual(
    report.checks.map((row) => row.runner),
    ["node", "npm", "npm"],
  );
  assert.equal(readFileSync(join(root, "post"), "utf8"), "yes");
  const path = join(root, "quality-gate.config.json");
  writeFileSync(path, JSON.stringify({ checks }));
  const regular = gate(root);
  assert.equal(regular.status, 0);
  assert.match(regular.stdout, /same result/);
});

test("cache keys change with the lock and point only at the gate-controlled download store", async (t) => {
  const root = fixture(t);
  const { planDependencyCache } = await import("../runtime/gate.mjs");
  const parent = join(root, "temp");
  const first = await planDependencyCache(root, parent);
  assert.match(first.key, /^qg-v2-\w+-\w+-npm-\d+\.\d+\.\d+-node\d+-[a-f0-9]{64}$/);
  assert.equal(first.path, join(parent, "quality-gate-downloads/npm/_cacache"));
  writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion":3}');
  assert.notEqual((await planDependencyCache(root, parent)).key, first.key);
});
