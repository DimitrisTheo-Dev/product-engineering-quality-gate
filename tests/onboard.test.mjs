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
    .filter((entry) => entry.isFile() && !entry.parentPath.includes("/.git"))
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
  assert.throws(() => adoptionPlan({ repo: dir, ref: sha }), /Conflicting lockfiles/);
});
