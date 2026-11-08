#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { exactVersion, inside } from "../runtime/gate.mjs";

export const versions = {
  oxfmt: "0.77.0",
  oxlint: "1.92.0",
  "react-doctor": "0.9.22",
  fallow: "3.41.0",
};
const repository = "DimitrisTheo-Dev/product-engineering-quality-gate";
const help = `Usage: node scripts/onboard.mjs --repo /path/to/repo [--dry-run | --apply]
  --ref <40-character SHA>  Immutable workflow revision; defaults to this checkout's HEAD.
  --working-directory <p>  Package to check; installation and dependencies stay at repository root.
  --typecheck-script <s>   Existing script, default typecheck.
  --build-script <s>       Existing script, default build.
  --test-script <s>        Default auto: test:ci, then test. Existing tests cannot be disabled.
  --product-script <s>     Optional consumer behavior tests (e.g. test:product).
  --react-doctor          Opt in, React packages only; review its separate license.
  --fallow                Opt in to Fallow; runs only with deep: true in the caller.
Dry run is the default. Apply changes only package.json, the package lockfile, and
.github/workflows/product-quality.yml. It never formats source, commits, or pushes.
Requires a Git repository and Node >=24; npm, pnpm, or Yarn with node_modules.
`;

function command(cmd, args, cwd, capture = true) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    timeout: 180_000,
    env: { ...process.env, CI: "true" },
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr?.trim() ?? `${cmd} failed`);
  return (result.stdout ?? "").trim();
}

function safePath(root, path) {
  if (!inside(root, path)) throw new Error("Target path leaves the repository.");
  let current = path;
  while (inside(root, current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error(`Refusing to modify symlink: ${current}`);
    if (current === root) break;
    current = dirname(current);
  }
}

function detect(root, pkg) {
  const locks = [
    ["npm", "package-lock.json"],
    ["npm", "npm-shrinkwrap.json"],
    ["pnpm", "pnpm-lock.yaml"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lock"],
    ["bun", "bun.lockb"],
  ].filter(([, file]) => existsSync(join(root, file)));
  if (locks.length > 1)
    throw new Error("Conflicting lockfiles; choose one package manager manually.");
  const declared = pkg.packageManager?.match(
    /^(npm|pnpm|yarn|bun)@(\d+\.\d+\.\d+(?:[-+][\da-zA-Z.-]+)?)$/,
  );
  if (pkg.packageManager && !declared)
    throw new Error("Pin packageManager to name@x.y.z before adopting.");
  const name = locks[0]?.[0] ?? declared?.[1] ?? "npm";
  if (declared && declared[1] !== name)
    throw new Error("packageManager conflicts with the existing lockfile.");
  if (name === "bun")
    throw new Error("Bun detected; v1 does not modify Bun repositories. See docs/onboarding.md.");
  if (name !== "npm" && !declared)
    throw new Error(`Set an exact packageManager: ${name}@x.y.z first.`);
  if (
    existsSync(join(root, ".pnp.cjs")) ||
    (existsSync(join(root, ".yarnrc.yml")) &&
      !readFileSync(join(root, ".yarnrc.yml"), "utf8").includes("nodeLinker: node-modules") &&
      name === "yarn" &&
      !declared?.[2].startsWith("1."))
  )
    throw new Error("Yarn PnP detected or possible; set nodeLinker: node-modules before adoption.");
  return {
    name,
    version: declared?.[2],
    lockfile:
      locks[0]?.[1] ??
      (name === "npm" ? "package-lock.json" : name === "pnpm" ? "pnpm-lock.yaml" : "yarn.lock"),
  };
}

export function adoptionPlan(options) {
  const root = realpathSync(resolve(options.repo ?? process.cwd()));
  const gitRoot = realpathSync(command("git", ["rev-parse", "--show-toplevel"], root));
  if (root !== gitRoot) throw new Error("--repo must be the Git repository root.");
  const pkgPath = join(root, "package.json");
  safePath(root, pkgPath);
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original);
  const cwd = resolve(root, options["working-directory"] ?? ".");
  safePath(root, cwd);
  if (!inside(root, realpathSync(cwd))) throw new Error("Package directory leaves the repository.");
  const consumer = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const manager = detect(root, pkg);
  const ownRoot = fileURLToPath(new URL("../", import.meta.url));
  const ref = options.ref ?? command("git", ["rev-parse", "HEAD"], ownRoot);
  if (!/^[a-f0-9]{40}$/.test(ref))
    throw new Error("--ref must be a full immutable 40-character commit SHA.");
  const dependencies = { ...consumer.dependencies, ...consumer.devDependencies };
  const react = Boolean(dependencies.react);
  const warnings = [];
  const conflicts = [];
  const scripts = consumer.scripts ?? {};
  const typecheck = options["typecheck-script"] ?? "typecheck";
  const build = options["build-script"] ?? "build";
  for (const name of [typecheck, build])
    if (!scripts[name])
      warnings.push(`Missing required script '${name}'; the gate will fail until you add it.`);
  const tests = options["test-script"] ?? "auto";
  if (tests === "" && (scripts.test || scripts["test:ci"]))
    warnings.push(
      "Existing tests cannot be disabled with an empty input; select a real CI test script.",
    );
  if (tests === "auto" && !scripts["test:ci"] && !scripts.test)
    warnings.push("No test script detected: Tests will be NOT CONFIGURED.");
  for (const name of [tests === "auto" ? "" : tests, options["product-script"] ?? ""])
    if (name && !scripts[name])
      warnings.push(`Selected script '${name}' does not exist; CI will fail.`);
  if (options["react-doctor"] && !react)
    conflicts.push("React Doctor requested but this package does not declare React.");
  if (
    [...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.dependencies ?? {})].some(
      (name) => ["prettier", "@biomejs/biome", "eslint"].includes(name),
    )
  )
    warnings.push(
      "Existing formatter/linter detected. Its scripts and configurations will be preserved; review Oxfmt differences before making this check required.",
    );
  if (pkg.workspaces || existsSync(join(root, "pnpm-workspace.yaml")))
    warnings.push(
      "Monorepo detected: one lockfile/install root. Use root aggregate scripts or a caller matrix; see docs/examples.md.",
    );
  if (existsSync(join(root, ".npmrc")))
    warnings.push(
      "Existing .npmrc is preserved. Do not pass registry/provider secrets to untrusted PR jobs.",
    );
  const next = structuredClone(pkg);
  const addScript = (name, value) => {
    next.scripts ??= {};
    if (next.scripts[name] && next.scripts[name] !== value)
      conflicts.push(`Script '${name}' already exists with a different command; no overwrite.`);
    else next.scripts[name] = value;
  };
  addScript("quality:format", "oxfmt --check");
  addScript("quality:lint", "oxlint --deny-warnings --ignore-pattern '**/node_modules/**'");
  if (options["react-doctor"])
    addScript(
      "quality:react",
      "react-doctor . --yes --no-score --no-supply-chain --blocking error",
    );
  if (options.fallow)
    addScript(
      "quality:fallow",
      "fallow dead-code --fail-on-issues --fail-on-parse-error && fallow dupes --fail-on-issues && fallow health --fail-on-issues --fail-on-parse-error && fallow architecture --fail-on-issues --fail-on-parse-error",
    );
  const selected = [
    "oxfmt",
    "oxlint",
    ...(options["react-doctor"] ? ["react-doctor"] : []),
    ...(options.fallow ? ["fallow"] : []),
  ];
  for (const name of selected) {
    const version = next.dependencies?.[name] ?? next.devDependencies?.[name];
    if (version && !exactVersion.test(version))
      conflicts.push(
        `Existing ${name}@${version} is not exact; pin it manually without changing your chosen version.`,
      );
    else if (!version) {
      next.devDependencies ??= {};
      next.devDependencies[name] = versions[name];
    }
  }
  const pairs = {
    "working-directory": options["working-directory"] ?? ".",
    "typecheck-script": typecheck,
    "build-script": build,
    "test-script": tests,
    ...(scripts.lint ? { "extra-script": "lint" } : {}),
    ...(options["product-script"] ? { "product-script": options["product-script"] } : {}),
    ...(options["react-doctor"] ? { "react-doctor": true } : {}),
    ...(options.fallow ? { fallow: true } : {}),
  };
  for (const key of ["typecheck-script", "build-script", "test-script", "product-script"]) {
    const value = pairs[key];
    if (value && !/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(value))
      conflicts.push(`${key} must be a script name, not a command.`);
  }
  const withLines = Object.entries(pairs)
    .filter(
      ([key, value]) =>
        !(key === "working-directory" && value === ".") &&
        !(key === "typecheck-script" && value === "typecheck") &&
        !(key === "build-script" && value === "build") &&
        !(key === "test-script" && value === "auto"),
    )
    .map(
      ([key, value]) =>
        `      ${key}: ${typeof value === "boolean" ? value : JSON.stringify(value)}`,
    );
  const remoteHead = spawnSync(
    "git",
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    { cwd: root, encoding: "utf8" },
  ).stdout?.trim();
  const currentBranch = command("git", ["symbolic-ref", "--short", "HEAD"], root);
  const defaultBranch =
    remoteHead?.replace(/^origin\//, "") ||
    (["main", "master"].includes(currentBranch) ? currentBranch : "main");
  if (!remoteHead && !["main", "master"].includes(currentBranch))
    warnings.push(
      "Default branch could not be detected; caller push trigger assumes main. Review it before committing.",
    );
  const workflow = `# Managed by product-engineering-quality-gate; review and commit locally.\nname: Product quality\non:\n  pull_request:\n  push:\n    branches: [${JSON.stringify(defaultBranch)}]\n  workflow_dispatch:\npermissions:\n  contents: read\nconcurrency:\n  group: product-quality-\${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: true\njobs:\n  quality:\n    uses: ${repository}/.github/workflows/quality-gate.yml@${ref}\n${withLines.length ? "    with:\n" + withLines.join("\n") + "\n" : ""}`;
  const workflowPath = join(root, ".github/workflows/product-quality.yml");
  const lockPath = join(root, manager.lockfile);
  safePath(root, workflowPath);
  safePath(root, lockPath);
  if (existsSync(workflowPath) && readFileSync(workflowPath, "utf8") !== workflow)
    conflicts.push(
      ".github/workflows/product-quality.yml exists with different content; review/update it manually.",
    );
  const indent = original.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  const packageText = JSON.stringify(next, null, indent) + "\n";
  const packageChanged = JSON.stringify(pkg) !== JSON.stringify(next);
  const workflowChanged = !existsSync(workflowPath);
  return {
    root,
    cwd,
    manager,
    ref,
    stack: react ? "React/TypeScript or JavaScript" : "Node/TypeScript or JavaScript",
    warnings,
    conflicts,
    packageChanged,
    workflowChanged,
    changes: [
      ...(packageChanged
        ? ["package.json", manager.lockfile]
        : !existsSync(lockPath)
          ? [manager.lockfile]
          : []),
      ...(workflowChanged ? [".github/workflows/product-quality.yml"] : []),
    ],
    packageText,
    workflow,
    pkgPath,
    workflowPath,
    lockPath,
  };
}

export function applyPlan(plan) {
  if (plan.conflicts.length) throw new Error("Resolve the adoption conflicts before applying.");
  if (!plan.changes.length) return;
  const workspacePath = join(plan.root, "pnpm-workspace.yaml");
  if (plan.manager.name === "pnpm") safePath(plan.root, workspacePath);
  const backups = new Map(
    [
      plan.pkgPath,
      plan.lockPath,
      plan.workflowPath,
      ...(plan.manager.name === "pnpm" ? [workspacePath] : []),
    ].map((path) => [path, existsSync(path) ? readFileSync(path) : null]),
  );
  try {
    if (plan.packageChanged || !existsSync(plan.lockPath)) {
      writeFileSync(plan.pkgPath, plan.packageText);
      const { name, version } = plan.manager;
      const args =
        name === "npm"
          ? ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]
          : name === "pnpm"
            ? [
                "install",
                "--lockfile-only",
                "--ignore-scripts",
                "--no-frozen-lockfile",
                "--config.minimumReleaseAgeStrict=true",
              ]
            : version?.startsWith("1.")
              ? ["install", "--ignore-scripts"]
              : ["install", "--no-immutable", "--mode=skip-build"];
      // Explicit apply may fetch registry metadata, but dependency hooks never run.
      if (name === "npm" && !version) command("npm", args, plan.root, false);
      else
        command(
          "npm",
          ["exec", "--yes", "--package=corepack@0.36.0", "--", "corepack", name, ...args],
          plan.root,
          false,
        );
      if (name === "pnpm") {
        const before = backups.get(workspacePath);
        const after = existsSync(workspacePath) ? readFileSync(workspacePath) : null;
        if ((before === null) !== (after === null) || (before && after && !before.equals(after))) {
          throw new Error(
            "pnpm changed workspace policy during dependency resolution; adoption was rolled back. Review minimumReleaseAge and pin eligible versions manually.",
          );
        }
      }
    }
    if (plan.workflowChanged) {
      mkdirSync(dirname(plan.workflowPath), { recursive: true });
      writeFileSync(plan.workflowPath, plan.workflow);
    }
  } catch (error) {
    for (const [path, content] of backups) {
      if (content === null) {
        if (existsSync(path)) unlinkSync(path);
      } else writeFileSync(path, content);
    }
    throw error;
  }
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: "string" },
      ref: { type: "string" },
      "working-directory": { type: "string" },
      "typecheck-script": { type: "string" },
      "build-script": { type: "string" },
      "test-script": { type: "string" },
      "product-script": { type: "string" },
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      "react-doctor": { type: "boolean" },
      fallow: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.apply && values["dry-run"]) throw new Error("Choose --apply or --dry-run.");
  const plan = adoptionPlan(values);
  console.log(
    JSON.stringify(
      {
        mode: values.apply ? "apply" : "dry-run",
        repository: plan.root,
        stack: plan.stack,
        manager: plan.manager,
        immutableRef: plan.ref,
        changes: plan.changes,
        warnings: plan.warnings,
        conflicts: plan.conflicts,
      },
      null,
      2,
    ),
  );
  if (plan.conflicts.length) {
    process.exitCode = 1;
    return;
  }
  if (values.apply) {
    applyPlan(plan);
    console.log(
      plan.changes.length
        ? "Applied. Inspect git diff, install dependencies, and run the gate before committing."
        : "Already adopted; no files changed.",
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
