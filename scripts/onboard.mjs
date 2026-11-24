#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  defaults,
  detectManager,
  exactVersion,
  inside,
  installArgs,
  resolveManager,
  run,
  scriptName,
  validateConfig,
} from "../runtime/gate.mjs";
import { addOns, legacyScripts, presets } from "./presets.mjs";

const ownRoot = fileURLToPath(new URL("../", import.meta.url));
const releaseVersion = JSON.parse(readFileSync(join(ownRoot, "package.json"), "utf8")).version;
const reference =
  "DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml";
const managedHeader = "# Managed by product-engineering-quality-gate; review and commit locally.";
const caller = ".github/workflows/product-quality.yml";
const inputKinds = {
  "extra-script": ["Existing quality checks", "lint"],
  "typecheck-script": ["Typecheck", "typecheck"],
  "test-script": ["Tests", "test"],
  "build-script": ["Build", "build"],
  "product-script": ["Product behavior", "product"],
  "smoke-script": ["Smoke", "smoke"],
  "e2e-script": ["E2E", "e2e", "deep"],
  "security-script": ["Dependency security", "security", "deep"],
};
const callerInputs = [
  "working-directory",
  "node-version",
  "deep",
  "check-timeout-seconds",
  "report-name",
  "browser-evidence",
];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 20_000 });
  return result.status === 0 ? result.stdout.trim() : "";
}
function safePath(root, path) {
  if (!inside(root, path)) throw new Error("Target path leaves the repository.");
  for (let current = path; inside(root, current); current = dirname(current)) {
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Refusing to modify symlink: ${relative(root, current)}`);
    if (current === root) break;
  }
}
function existing(path) {
  return existsSync(path) ? readFileSync(path) : null;
}
function callerText(branch, pin, inputs, legacy = false) {
  const pairs = Object.entries(inputs).map(
    ([key, value]) => `      ${key}: ${JSON.stringify(value)}`,
  );
  return [
    managedHeader,
    "name: Product quality",
    "on:",
    "  pull_request:",
    ...(legacy ? [] : ["  merge_group:"]),
    "  push:",
    `    branches: [${JSON.stringify(branch)}]`,
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "concurrency:",
    "  group: product-quality-${{ github.workflow }}-${{ github.ref }}",
    legacy
      ? "  cancel-in-progress: true"
      : "  cancel-in-progress: ${{ github.ref_name != github.event.repository.default_branch }}",
    "jobs:",
    "  quality:",
    `    uses: ${reference}@${pin}`,
    ...(pairs.length ? ["    with:", ...pairs] : []),
    "",
  ].join("\n");
}

function v1Caller(source) {
  const pin = source.match(/@([a-f0-9]{40})(?: # v1\.[\d.]+)?$/m)?.[1];
  const branchLine = source.match(/^    branches: \[("(?:[^"\\]|\\.)*")\]$/m);
  if (!pin || !branchLine)
    throw new Error("Expected a v1 managed caller. Migrate custom YAML manually.");
  const branch = JSON.parse(branchLine[1]);
  const prefix = callerText(branch, pin, {}, true).trimEnd();
  const normalized = source.replace(/ # v1\.[\d.]+$/m, "");
  const tail = normalized.slice(prefix.length);
  if (!normalized.startsWith(prefix) || (tail !== "\n" && !tail.startsWith("\n    with:\n")))
    throw new Error("The v1 caller has custom YAML. Migrate it manually to preserve those edits.");
  const inputs = {};
  for (const line of tail.split("\n").slice(2, -1)) {
    const pair = line.match(/^      ([a-z-]+): (.+)$/);
    if (
      !pair ||
      Object.hasOwn(inputs, pair[1]) ||
      ![
        ...callerInputs,
        ...Object.keys(inputKinds),
        ...Object.keys(addOns),
        "upload-playwright-failures",
      ].includes(pair[1])
    )
      throw new Error("Unexpected v1 caller input. Migrate custom YAML manually.");
    try {
      inputs[pair[1]] = JSON.parse(pair[2]);
    } catch {
      if (!/^[A-Za-z0-9._:/@-]+$/.test(pair[2]))
        throw new Error(`Unsupported v1 scalar for ${pair[1]}.`);
      inputs[pair[1]] = pair[2];
    }
  }
  return { branch, inputs };
}

export function adoptionPlan(options) {
  if (options.migrate && options.upgrade) throw new Error("Choose --migrate or --upgrade.");
  const root = realpathSync(resolve(options.repo ?? process.cwd()));
  if (git(root, "rev-parse", "--show-toplevel") !== root)
    throw new Error("--repo must be the Git repository root.");
  const ref = options.ref ?? git(ownRoot, "rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(ref))
    throw new Error("--ref must be a full immutable 40-character commit SHA.");
  const pin = `${ref} # v${releaseVersion}`;
  const workflowPath = join(root, caller);
  safePath(root, workflowPath);
  const old = existing(workflowPath)?.toString("utf8") ?? "";
  /** @type {Map<string, {before: Buffer | null, after: string | null}>} */
  const edits = new Map();
  const change = (path, after) => {
    safePath(root, path);
    const before = existing(path);
    if (after === null || before?.toString("utf8") !== after) edits.set(path, { before, after });
  };
  const warnings = [];
  const conflicts = [];
  if (options.upgrade) {
    const lines = old.split(/(?<=\n)/);
    const matches = lines.filter((line) => line.trimStart().startsWith(`uses: ${reference}@`));
    const match = matches[0]?.match(
      /^(\s*uses: [^@]+@)[a-f0-9]{40} +# v([2-9]|[1-9]\d+)\.\d+\.\d+(?:-[\w.-]+)?(\r?\n)?$/,
    );
    if (matches.length !== 1 || !match)
      throw new Error("Expected a single v2 use with a version comment. Use --migrate for v1.");
    change(workflowPath, old.replace(matches[0], `${match[1]}${pin}${match[3] ?? ""}`));
    return {
      root,
      ref,
      edits,
      conflicts,
      warnings,
      changes: [...edits.keys()].map((path) => relative(root, path)),
    };
  }

  let migrated;
  if (options.migrate && !old) throw new Error("No v1 caller to migrate.");
  if (options.migrate) {
    if (old.startsWith(managedHeader) && /^    uses: .*@[a-f0-9]{40} # v2\./m.test(old))
      return { root, ref, edits, conflicts, warnings, changes: [] };
    migrated = v1Caller(old);
  }
  const selected = { ...migrated?.inputs, ...options };
  const cwd = resolve(root, selected["working-directory"] ?? ".");
  const pkgPath = join(cwd, "package.json");
  const installManifest = join(root, "package.json");
  const configPath = join(cwd, defaults.config);
  for (const path of [pkgPath, installManifest, configPath]) safePath(root, path);
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original);
  const rootPkg = JSON.parse(readFileSync(installManifest, "utf8"));
  const manager = detectManager(root, rootPkg, { allowMissing: true });
  const lockPath = join(root, manager.lockfile);
  safePath(root, lockPath);
  const workspace = join(root, "pnpm-workspace.yaml");
  if (manager.name === "pnpm") safePath(root, workspace);
  const workspaceBefore = manager.name === "pnpm" ? existing(workspace) : null;
  const next = structuredClone(pkg);
  const scripts = pkg.scripts ?? {};
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  const react = Boolean(dependencies.react);
  if (
    Object.keys(dependencies).some((name) =>
      ["prettier", "@biomejs/biome", "eslint"].includes(name),
    )
  )
    warnings.push(
      "Existing formatter/linter detected in the selected package. Its configuration is preserved.",
    );
  if (selected["react-doctor"] && !react)
    conflicts.push("React Doctor requires React in the selected package.");
  const preset = selected.preset ?? "oxc";
  if (!Object.hasOwn(presets, preset)) throw new Error("Choose --preset oxc, biome or existing.");
  const entries = [
    presets[preset],
    ...Object.entries(addOns)
      .filter(([name]) => selected[name] === true)
      .map(([, data]) => data),
  ];
  /** @type {{setup: string[], tools: string[], checks: {name: string, kind: string, script: string, tier?: string, concurrent?: boolean}[], policy: {waive: string[]}}} */
  const config = { setup: [], tools: [], checks: [], policy: { waive: selected.waive ?? [] } };
  for (const entry of entries) {
    for (const [name, body] of Object.entries(entry.scripts)) {
      next.scripts ??= {};
      if (
        Object.hasOwn(next.scripts, name) &&
        next.scripts[name] !== body &&
        !(migrated && next.scripts[name] === legacyScripts[name])
      )
        conflicts.push(`Script '${name}' already exists with a different command.`);
      else next.scripts[name] = body;
    }
    for (const [name, version] of Object.entries(entry.dependencies)) {
      const current = dependencies[name];
      if (current !== undefined && (typeof current !== "string" || !exactVersion.test(current)))
        conflicts.push(`Pin the existing ${name}@${current} to an exact version.`);
      if (current === undefined) {
        next.devDependencies ??= {};
        next.devDependencies[name] = version;
      }
      config.tools.push(name);
    }
    config.setup.push(...(entry.setup ?? []));
    config.checks.push(...(entry.checks ?? []));
  }
  if (preset === "existing") {
    /** @type {[string, string, string[]][]} */
    const checks = [
      ["format", "Existing format check", ["format:check", "check:format", "quality:format"]],
      ["lint", "Existing lint", ["lint", "lint:check", "quality:lint"]],
    ];
    for (const [kind, name, candidates] of checks) {
      const script = candidates.find((candidate) => scripts[candidate]);
      if (script) config.checks.push({ kind, name, script });
    }
  }
  const choices = {
    "typecheck-script": "typecheck",
    "test-script": scripts["test:ci"] ? "test:ci" : "test",
    "build-script": "build",
    ...(preset === "oxc" && scripts.lint ? { "extra-script": "lint" } : {}),
  };
  for (const [input, [name, kind, tier]] of Object.entries(inputKinds)) {
    const explicit = selected[input];
    const script =
      input === "test-script" && explicit === "auto" && migrated
        ? choices[input]
        : (explicit ?? choices[input]);
    if (
      config.policy.waive.includes(kind) &&
      (explicit === undefined || (migrated && options[input] === undefined))
    )
      continue;
    if (script === undefined) continue;
    if (
      typeof script !== "string" ||
      !scriptName.test(script) ||
      !Object.hasOwn(scripts, script) ||
      !String(scripts[script]).trim()
    )
      conflicts.push(
        `Add existing package script '${script}' for ${kind}${["typecheck", "test", "build"].includes(kind) ? ` or use --waive ${kind}` : ""}.`,
      );
    config.checks.push({ name, kind, script, ...(tier ? { tier } : {}) });
  }
  try {
    validateConfig(config);
  } catch (error) {
    conflicts.push(error instanceof Error ? error.message : String(error));
  }
  const configText = JSON.stringify(config, null, 2) + "\n";
  const originalConfig = existing(configPath)?.toString("utf8");
  if (originalConfig !== undefined) {
    try {
      if (!isDeepStrictEqual(JSON.parse(originalConfig), config))
        conflicts.push(`${relative(root, configPath)} already exists with different content.`);
    } catch {
      conflicts.push(`${relative(root, configPath)} contains invalid JSON.`);
    }
  }
  const branch =
    migrated?.branch ??
    git(root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD").replace(
      /^origin\//,
      "",
    );
  const current = git(root, "branch", "--show-current");
  const defaultBranch = branch || (current === "master" ? "master" : "main");
  if (!branch && !["main", "master"].includes(current))
    warnings.push("Default branch could not be detected. Review the caller's main push trigger.");
  if (selected["upload-playwright-failures"] === true) selected["browser-evidence"] = true;
  if (cwd === root) delete selected["working-directory"];
  const workflow = callerText(
    defaultBranch,
    pin,
    Object.fromEntries(
      callerInputs.filter((key) => selected[key] !== undefined).map((key) => [key, selected[key]]),
    ),
  );
  if (old && old !== workflow && !migrated)
    conflicts.push(`${caller} differs. Use --upgrade to change only a v2 pin.`);
  // Formatters such as Oxfmt sort package.json, so keep added dependencies in key order.
  if (
    next.devDependencies &&
    JSON.stringify(next.devDependencies) !== JSON.stringify(pkg.devDependencies)
  )
    next.devDependencies = Object.fromEntries(
      Object.entries(next.devDependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  const indent = original.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  if (JSON.stringify(next) !== JSON.stringify(pkg))
    change(pkgPath, JSON.stringify(next, null, indent) + "\n");
  const dependencyChanges =
    JSON.stringify(next.devDependencies) !== JSON.stringify(pkg.devDependencies);
  if (dependencyChanges || !existsSync(lockPath)) change(lockPath, null);
  if (originalConfig === undefined) change(configPath, configText);
  change(workflowPath, workflow);
  // Every run writes its report to .quality-gate/; keep it out of Git and out of format checks.
  const ignorePath = join(root, ".gitignore");
  const ignored = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
  if (!/^\/?\.quality-gate\/?\s*$/m.test(ignored))
    change(
      ignorePath,
      `${ignored}${ignored && !ignored.endsWith("\n") ? "\n" : ""}.quality-gate/\n`,
    );
  return {
    root,
    cwd,
    manager,
    ref,
    stack: react ? "React/TypeScript or JavaScript" : "Node/TypeScript or JavaScript",
    warnings,
    conflicts,
    edits,
    lockPath,
    workspace,
    workspaceBefore,
    packageText: JSON.stringify(next, null, indent) + "\n",
    changes: [...edits.keys()].map((path) => relative(root, path)),
  };
}

export async function applyPlan(plan) {
  if (plan.conflicts.length) throw new Error("Resolve the adoption conflicts before applying.");
  if (!plan.changes.length) return;
  const active = new Set();
  for (const [path, { before }] of plan.edits) {
    safePath(plan.root, path);
    const current = existing(path);
    if (before ? !current?.equals(before) : current !== null)
      throw new Error(`${relative(plan.root, path)} changed since planning. Rerun onboarding.`);
  }
  try {
    for (const [path, { after }] of plan.edits) {
      active.add(path);
      if (path === plan.lockPath) {
        const manager = await resolveManager(plan.manager);
        await run(
          manager.command,
          [...manager.prefix, ...installArgs(plan.manager, true)],
          plan.root,
          { timeout: 180, env: manager.env },
        );
        if (!existsSync(path))
          throw new Error("Package manager did not write the planned lockfile.");
        if (plan.manager.name === "pnpm") {
          const workspaceAfter = existing(plan.workspace);
          const before = plan.workspaceBefore;
          if (before ? !workspaceAfter?.equals(before) : workspaceAfter !== null)
            throw new Error(
              "pnpm changed workspace policy. Review release-age rules and choose eligible versions.",
            );
        }
      } else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, after);
      }
    }
  } catch (error) {
    for (const path of active) {
      const { before } = plan.edits.get(path);
      if (before === null) {
        if (existsSync(path)) unlinkSync(path);
      } else writeFileSync(path, before);
    }
    if (plan.manager?.name === "pnpm" && plan.lockPath && active.has(plan.lockPath)) {
      if (plan.workspaceBefore) writeFileSync(plan.workspace, plan.workspaceBefore);
      else if (existsSync(plan.workspace)) unlinkSync(plan.workspace);
    }
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    options: {
      ...Object.fromEntries(
        ["repo", "ref", "preset", "working-directory", ...Object.keys(inputKinds)].map((name) => [
          name,
          { type: "string" },
        ]),
      ),
      ...Object.fromEntries(
        ["dry-run", "apply", "migrate", "upgrade", "help", ...Object.keys(addOns)].map((name) => [
          name,
          { type: "boolean" },
        ]),
      ),
      waive: { type: "string", multiple: true },
    },
  });
  const values = /** @type {Record<string, string | boolean | string[] | undefined>} */ (
    parsed.values
  );
  if (values.help) {
    console.log(
      "Usage: node scripts/onboard.mjs --repo PATH [--preset oxc|biome|existing] [--apply]\n" +
        "Dry run is default. Use --migrate for a v1 managed caller, or --upgrade --ref SHA for a v2 pin.\n" +
        "Select --working-directory DIR, --typecheck-script NAME, --build-script NAME, --test-script NAME,\n" +
        "--product-script NAME, --react-doctor, --fallow, --playwright or --waive KIND as needed.",
    );
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
  if (plan.conflicts.length) process.exitCode = 1;
  else if (values.apply) await applyPlan(plan);
}

if (
  process.argv[1] &&
  process.argv[1] !== "-" &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
