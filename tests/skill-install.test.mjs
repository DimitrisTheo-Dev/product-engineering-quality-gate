import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("skill installer dry-run, apply, repeat, and conflict preserve user content", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "quality-gate-skill-test-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const destination = join(sandbox, "product-engineering-quality-gate");
  const script = fileURLToPath(new URL("../scripts/install-codex-skill.mjs", import.meta.url));
  const run = (...args) =>
    spawnSync(process.execPath, [script, "--destination", destination, ...args], {
      encoding: "utf8",
    });
  assert.equal(run("--dry-run").status, 0);
  assert.equal(existsSync(destination), false);
  const result = run("--apply");
  assert.equal(result.status, 0, result.stderr);
  const installed = readFileSync(join(destination, "SKILL.md"), "utf8");
  assert.match(installed, /name: product-engineering-quality-gate/);
  assert.equal(run("--apply").status, 0);
  writeFileSync(join(destination, "SKILL.md"), "# My customized skill\n");
  assert.equal(run("--apply").status, 1);
  assert.equal(readFileSync(join(destination, "SKILL.md"), "utf8"), "# My customized skill\n");
});
