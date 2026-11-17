import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { adoptionPlan } from "../scripts/onboard.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = "a".repeat(40);

function fixture(t, stack = "node-ts") {
  const dir = mkdtempSync(join(tmpdir(), "quality-gate-onboard-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "examples", stack), dir, { recursive: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/existing.yml"), "name: untouched\n");
  return dir;
}

function snapshot(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.parentPath.split(/[\\/]/).includes(".git"))
    .map((entry) => [
      join(entry.parentPath, entry.name).slice(dir.length),
      readFileSync(join(entry.parentPath, entry.name), "utf8"),
    ]);
}

for (const stack of ["node-ts", "react-ts"])
  test(`${stack} dry-run detects stack and changes no target files`, (t) => {
    const dir = fixture(t, stack);
    const before = snapshot(dir);
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/onboard.mjs"), "--repo", dir, "--ref", sha, "--dry-run"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(dir), before);
    const plan = JSON.parse(result.stdout);
    assert.match(plan.stack, stack === "react-ts" ? /React/ : /Node/);
    assert.equal(plan.manager.name, "npm");
    assert.ok(plan.changes.includes("package.json"));
  });

test("React checks require explicit opt-in and cannot be enabled on a Node package", (t) => {
  const dir = fixture(t);
  const normal = adoptionPlan({ repo: dir, ref: sha });
  assert.equal(JSON.parse(normal.packageText).devDependencies["react-doctor"], undefined);
  assert.ok(adoptionPlan({ repo: dir, ref: sha, "react-doctor": true }).conflicts.length);
});

test("a symlinked CLI checkout still produces the immutable adoption plan", (t) => {
  const dir = fixture(t);
  const linked = join(dir, "linked-central-checkout");
  symlinkSync(root, linked);
  const before = snapshot(dir);
  const result = spawnSync(
    process.execPath,
    [join(linked, "scripts/onboard.mjs"), "--repo", dir, "--ref", sha, "--dry-run"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.immutableRef, sha);
  assert.ok(plan.changes.includes("package.json"));
  assert.deepEqual(snapshot(dir), before);
});

test("script/workflow conflicts preserve user work", (t) => {
  const dir = fixture(t);
  const path = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.scripts["quality:lint"] = "eslint .";
  writeFileSync(path, JSON.stringify(pkg));
  writeFileSync(join(dir, ".github/workflows/product-quality.yml"), "# user workflow\n");
  const before = snapshot(dir);
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts/onboard.mjs"), "--repo", dir, "--ref", sha, "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(snapshot(dir), before);
});

test("onboarding refuses workflow directory symlinks", (t) => {
  const dir = fixture(t);
  rmSync(join(dir, ".github"), { recursive: true });
  symlinkSync(tmpdir(), join(dir, ".github"));
  assert.throws(() => adoptionPlan({ repo: dir, ref: sha }), /symlink/);
});

test("multiple lockfiles and nonimmutable workflow refs are rejected", (t) => {
  const dir = fixture(t);
  assert.throws(() => adoptionPlan({ repo: dir, ref: "v1" }), /immutable/);
  writeFileSync(join(dir, "package-lock.json"), "{}");
  writeFileSync(join(dir, "pnpm-lock.yaml"), "");
  assert.throws(() => adoptionPlan({ repo: dir, ref: sha }), /conflicting lockfiles/i);
});

test("nested presets update the selected package and detect its existing tools", (t) => {
  const dir = fixture(t);
  const target = join(dir, "apps/web");
  mkdirSync(target, { recursive: true });
  cpSync(join(dir, "package.json"), join(target, "package.json"));
  const source = readFileSync(join(target, "package.json"), "utf8");
  const pkg = JSON.parse(source);
  pkg.devDependencies.eslint = "1.0.0";
  writeFileSync(join(target, "package.json"), JSON.stringify(pkg));
  const plan = adoptionPlan({ repo: dir, ref: sha, "working-directory": "apps/web" });
  assert.deepEqual(plan.conflicts, []);
  assert.ok(plan.warnings.some((warning) => /formatter\/linter/.test(warning)));
  assert.ok(plan.changes.includes("apps/web/package.json"));
  assert.ok(plan.changes.includes("apps/web/quality-gate.config.json"));
  assert.ok(!plan.changes.includes("package.json"));
});

test("generated caller pins v2, includes merge queues and keeps default-branch runs", (t) => {
  const dir = fixture(t);
  const plan = adoptionPlan({ repo: dir, ref: sha });
  const workflow = [...plan.edits.values()].find(({ after }) =>
    after?.includes("name: Product quality"),
  ).after;
  assert.match(workflow, new RegExp(`@${sha} # v2\\.0\\.0`));
  assert.match(workflow, /merge_group:/);
  assert.match(
    workflow,
    /cancel-in-progress: .*github.ref_name != github.event.repository.default_branch/,
  );
});

test("migration records an explicit test script and upgrade only rewrites the pin", async (t) => {
  const dir = fixture(t);
  const path = join(dir, ".github/workflows/product-quality.yml");
  const initial = [
    "# Managed by product-engineering-quality-gate; review and commit locally.",
    "name: Product quality",
    "on:",
    "  pull_request:",
    "  push:",
    '    branches: ["main"]',
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "concurrency:",
    "  group: product-quality-${{ github.workflow }}-${{ github.ref }}",
    "  cancel-in-progress: true",
    "jobs:",
    "  quality:",
    `    uses: DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml@${"b".repeat(40)}`,
    "",
  ].join("\n");
  writeFileSync(path, initial);
  const { applyPlan } = await import("../scripts/onboard.mjs");
  const migration = adoptionPlan({ repo: dir, ref: sha, migrate: true });
  assert.deepEqual(migration.conflicts, []);
  assert.equal(readFileSync(path, "utf8"), initial);
  await applyPlan(migration);
  assert.deepEqual(adoptionPlan({ repo: dir, ref: sha, migrate: true }).changes, []);
  const config = JSON.parse(readFileSync(join(dir, "quality-gate.config.json"), "utf8"));
  assert.equal(config.checks.find(({ kind }) => kind === "test").script, "test");
  const migrated = readFileSync(path, "utf8");
  const pin = "c".repeat(40);
  const upgrade = adoptionPlan({ repo: dir, ref: pin, upgrade: true });
  assert.deepEqual(upgrade.changes, [".github/workflows/product-quality.yml"]);
  await applyPlan(upgrade);
  assert.equal(readFileSync(path, "utf8"), migrated.replace(sha, pin));
  assert.deepEqual(adoptionPlan({ repo: dir, ref: pin, upgrade: true }).changes, []);
});
