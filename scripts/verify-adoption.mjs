import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adoptionPlan, applyPlan } from "./onboard.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ref = process.env.QG_REF ?? "a".repeat(40);
const sandbox = mkdtempSync(join(tmpdir(), "quality-gate-adoption-"));
const ignored = new Set([".git", "node_modules", "dist", ".quality-gate", ".yarn"]);
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

function command(cmd, args, cwd, env = {}, expected = 0) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 240_000,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    expected,
    `${cmd} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

function snapshot(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && !entry.parentPath.split(/[\\/]/).some((part) => ignored.has(part)),
    )
    .map(
      (entry) =>
        /** @type {[string, Buffer]} */ ([
          join(entry.parentPath, entry.name),
          readFileSync(join(entry.parentPath, entry.name)),
        ]),
    );
}

function check(dir, options, expected = 0) {
  const output = command(
    process.execPath,
    [join(root, "runtime/gate.mjs")],
    dir,
    {
      GITHUB_WORKSPACE: dir,
      GITHUB_STEP_SUMMARY: "",
      QG_LOCAL_CACHE_PARENT: join(sandbox, "runner-cache"),
      QG_OPTIONS: JSON.stringify(options),
    },
    expected,
  );
  const report = JSON.parse(readFileSync(join(dir, ".quality-gate/report.json"), "utf8"));
  assert.equal(report.passed, expected === 0);
  assert.equal(
    report.checks.some((row) => row.status === "FAIL"),
    expected !== 0,
  );
  return { output, report };
}

try {
  /** @type {{stack: string, manager?: string, workspace: boolean, preset: string}[]} */
  const cases = [
    { stack: "node-ts", manager: undefined, workspace: false, preset: "oxc" },
    { stack: "react-ts", manager: undefined, workspace: false, preset: "oxc" },
    { stack: "node-ts", manager: undefined, workspace: false, preset: "biome" },
  ];
  if (process.argv.includes("--managers")) {
    for (const manager of [undefined, "pnpm@12.18.0", "yarn@1.22.22", "yarn@4.18.1", "bun@1.4.4"])
      cases.push({ stack: "node-ts", manager, workspace: true, preset: "oxc" });
  }
  for (const { stack, manager, workspace, preset } of cases) {
    const dir = join(
      sandbox,
      `${stack}-${manager ?? "npm"}-${preset}${workspace ? "-workspace" : ""}`,
    );
    const selected = workspace ? "packages/app" : ".";
    const target = join(dir, selected);
    mkdirSync(target, { recursive: true });
    cpSync(join(root, "examples", stack), target, {
      recursive: true,
      filter: (path) =>
        !ignored.has(basename(path)) && (!workspace || basename(path) !== "package-lock.json"),
    });
    if (workspace) {
      const pkgPath = join(target, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      writeJson(pkgPath, { ...pkg, version: "1.0.0" });
      writeJson(join(dir, "package.json"), {
        name: "quality-gate-workspace",
        private: true,
        ...(manager ? { packageManager: manager } : {}),
        ...(!manager?.startsWith("pnpm") ? { workspaces: ["packages/*"] } : {}),
      });
      if (manager?.startsWith("pnpm"))
        writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
      if (manager?.startsWith("yarn@4"))
        writeFileSync(join(dir, ".yarnrc.yml"), "nodeLinker: node-modules\n");
    }
    if (preset === "biome")
      writeFileSync(
        join(target, "biome.json"),
        '{\n  "files": { "includes": ["src/**"] },\n  "formatter": { "indentStyle": "space" }\n}\n',
      );
    command("git", ["init", "-b", "main"], dir);
    const existingWorkflow = join(dir, ".github/workflows/existing.yml");
    mkdirSync(dirname(existingWorkflow), { recursive: true });
    writeFileSync(existingWorkflow, "# Existing CI must survive byte-for-byte.\n");
    const advanced = process.argv.includes("--advanced") && preset === "oxc";
    const options = {
      repo: dir,
      ref,
      preset,
      "working-directory": selected,
      ...(advanced ? { fallow: true, "react-doctor": stack === "react-ts" } : {}),
    };
    const before = snapshot(dir);
    const plan = adoptionPlan(options);
    assert.deepEqual(snapshot(dir), before, "dry run changed files");
    await applyPlan(plan);
    const changed = new Set(plan.changes.map((path) => join(dir, path)));
    for (const [path, content] of before)
      if (!changed.has(path))
        assert.deepEqual(readFileSync(path), content, `changed unrelated file: ${path}`);
    const applied = snapshot(dir);
    const again = adoptionPlan(options);
    assert.deepEqual(again.changes, []);
    await applyPlan(again);
    assert.deepEqual(snapshot(dir), applied, "apply was not byte-idempotent");
    if (workspace) {
      assert.equal(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts, undefined);
      assert.ok(
        JSON.parse(readFileSync(join(target, "package.json"), "utf8")).scripts["quality:lint"],
      );
    }
    const gateOptions = { "working-directory": selected, deep: advanced };
    if (manager?.startsWith("bun")) {
      const manifest = join(target, "package.json");
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      pkg.scripts.prepare = 'node -e "process.exit(19)"';
      pkg.scripts.test =
        'node -e "if (process.versions.bun) process.exit(18)" && ' + pkg.scripts.test;
      writeJson(manifest, pkg);
    }
    const { report } = check(dir, gateOptions);
    assert.equal(report.checks.find((row) => row.name === "Tests").status, "PASS");
    if (manager?.startsWith("bun")) {
      assert.equal(report.manager.version, "1.4.4");
      assert.equal(report.manager.lockfile, "bun.lock");
      const manifest = join(target, "package.json");
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      pkg.scripts.test = 'node -e "process.exit(7)"';
      writeJson(manifest, pkg);
      const { report: broken } = check(dir, gateOptions, 1);
      assert.equal(broken.checks.find(({ name }) => name === "Tests").status, "FAIL");
    }
    if (preset === "biome") {
      assert.ok(report.tools["@biomejs/biome"]);
      const probe = join(target, "src/probe.ts");
      /** @type {[string, RegExp][]} */
      const probes = [
        ["export const probe={one:1};\n", /format/i],
        ["debugger;\n", /noDebugger/],
      ];
      for (const [body, diagnostic] of probes) {
        writeFileSync(probe, body);
        const { output, report: result } = check(dir, gateOptions, 1);
        assert.equal(result.checks.find((row) => row.name === "Biome").status, "FAIL");
        assert.match(output.stdout + output.stderr, /::error/);
        assert.match(output.stdout + output.stderr, diagnostic);
      }
    }
    console.log(
      `${stack} (${manager ?? "npm"}, ${preset}${workspace ? ", workspace" : ""}): PASS dry run, install, checks, preservation, and idempotency.`,
    );
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
