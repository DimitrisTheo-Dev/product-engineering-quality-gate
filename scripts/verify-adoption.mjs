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
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adoptionPlan, applyPlan } from "./onboard.mjs";
import { managerCommand } from "../runtime/gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ref = process.env.QG_REF ?? "a".repeat(40);
const sandbox = mkdtempSync(join(tmpdir(), "quality-gate-adoption-"));
function run(cmd, args, cwd, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 180_000,
  });
  if (result.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.parentPath
          .split(/[\\/]/)
          .some((segment) => [".git", "node_modules", "dist", ".quality-gate"].includes(segment)),
    )
    .map((entry) => [
      join(entry.parentPath, entry.name),
      readFileSync(join(entry.parentPath, entry.name), "utf8"),
    ]);
}
try {
  const cases = [
    { stack: "node-ts", manager: "npm" },
    { stack: "react-ts", manager: "npm" },
  ];
  if (process.argv.includes("--managers"))
    cases.push(
      { stack: "node-ts", manager: "pnpm@12.18.0" },
      { stack: "node-ts", manager: "yarn@1.22.22" },
      { stack: "node-ts", manager: "yarn@4.18.1" },
    );
  for (const { stack, manager } of cases) {
    const dir = join(sandbox, `${stack}-${manager.replace("@", "-")}`);
    cpSync(join(root, "examples", stack), dir, { recursive: true });
    if (manager.includes("@")) {
      const path = join(dir, "package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      pkg.packageManager = manager;
      writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
      if (manager.startsWith("yarn@4"))
        writeFileSync(join(dir, ".yarnrc.yml"), "nodeLinker: node-modules\n");
    }
    run("git", ["init", "-b", "main"], dir);
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github/workflows/existing.yml"),
      "# Existing CI must survive byte-for-byte.\n",
    );
    const before = files(dir);
    const advanced = process.argv.includes("--advanced");
    const options = {
      repo: dir,
      ref,
      ...(advanced ? { fallow: true, "react-doctor": stack === "react-ts" } : {}),
    };
    const plan = adoptionPlan(options);
    assert.deepEqual(files(dir), before, "dry run changed files");
    applyPlan(plan);
    for (const [path, contents] of before)
      if (!path.endsWith("package.json"))
        assert.equal(readFileSync(path, "utf8"), contents, `changed unrelated file: ${path}`);
    const applied = files(dir);
    const again = adoptionPlan(options);
    assert.deepEqual(again.changes, []);
    applyPlan(again);
    assert.deepEqual(files(dir), applied, "apply was not idempotent");
    const { command, prefix } = managerCommand(plan.manager);
    const installArgs =
      plan.manager.name === "npm"
        ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
        : plan.manager.name === "pnpm"
          ? ["install", "--frozen-lockfile", "--ignore-scripts"]
          : plan.manager.version.startsWith("1.")
            ? ["install", "--frozen-lockfile", "--ignore-scripts"]
            : ["install", "--immutable", "--mode=skip-build"];
    run(command, [...prefix, ...installArgs], dir);
    const output = run(process.execPath, [join(root, "runtime/gate.mjs"), "--no-install"], dir, {
      GITHUB_WORKSPACE: dir,
      GITHUB_STEP_SUMMARY: "",
      QG_OPTIONS: JSON.stringify(
        advanced ? { fallow: true, deep: true, "react-doctor": stack === "react-ts" } : {},
      ),
    });
    const report = JSON.parse(readFileSync(join(dir, ".quality-gate/report.json"), "utf8"));
    assert.equal(report.passed, true, output);
    console.log(
      `${stack} (${manager}): PASS dry run, apply, preservation, idempotency, locked install, Oxfmt, Oxlint, typecheck, tests, build${advanced ? ", Fallow" + (stack === "react-ts" ? ", React Doctor" : "") : ""}.`,
    );
  }
} finally {
  // Only remove the unique sandbox created by this process.
  rmSync(sandbox, { recursive: true, force: true });
}
