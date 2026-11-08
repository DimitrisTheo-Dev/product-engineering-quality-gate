import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{name: string, status: string, required: boolean, detail: string, seconds?: number}} Result */
/** @typedef {{[key: string]: string | boolean | number | undefined}} Options */

export const defaults = {
  "working-directory": ".",
  "typecheck-script": "typecheck",
  "build-script": "build",
  "test-script": "auto",
  "product-script": "",
  "extra-script": "",
  "smoke-script": "",
  "e2e-script": "",
  "security-script": "",
  "react-doctor": false,
  fallow: false,
  playwright: false,
  deep: false,
  "check-timeout-seconds": 300,
};

export const exactVersion = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/;

export function inside(root, target) {
  const path = relative(root, target);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export function detectManager(root, pkg) {
  const locks = [
    ["npm", "package-lock.json"],
    ["npm", "npm-shrinkwrap.json"],
    ["pnpm", "pnpm-lock.yaml"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lock"],
    ["bun", "bun.lockb"],
  ].filter(([, file]) => existsSync(join(root, file)));
  if (locks.length !== 1)
    throw new Error("Keep exactly one supported lockfile at the install root.");
  const manager = locks[0][0];
  if (manager === "bun")
    throw new Error("Bun is detected but not supported in v1; see docs/onboarding.md.");
  const declared = pkg.packageManager;
  if (
    declared &&
    !new RegExp(`^${manager}@\\d+\\.\\d+\\.\\d+(?:[-+][\\da-zA-Z.-]+)?$`).test(declared)
  ) {
    throw new Error(`packageManager must pin ${manager}@x.y.z and match the lockfile.`);
  }
  if (manager !== "npm" && !declared) throw new Error(`Pin packageManager: ${manager}@x.y.z.`);
  if (existsSync(join(root, ".pnp.cjs")))
    throw new Error("Yarn PnP is not supported; use nodeLinker: node-modules.");
  return { name: manager, lockfile: locks[0][1], version: declared?.split("@")[1] };
}

export function planChecks(pkg, options = {}) {
  const o = { ...defaults, ...options };
  const scripts = pkg.scripts ?? {};
  const script = (name, key, required = false, deep = false) => {
    let value = String(o[key] ?? "");
    if (value === "auto") value = scripts["test:ci"] ? "test:ci" : scripts.test ? "test" : "";
    return {
      name,
      script: value,
      required: required || value !== "",
      enabled: !deep || o.deep === true,
    };
  };
  return [
    { name: "Oxfmt", tool: "oxfmt", args: ["--check"], required: true, enabled: true },
    {
      name: "Oxlint",
      tool: "oxlint",
      args: ["--deny-warnings", "--ignore-pattern", "**/node_modules/**"],
      required: true,
      enabled: true,
    },
    script("Existing quality checks", "extra-script"),
    script("Typecheck", "typecheck-script", true),
    script("Tests", "test-script"),
    script("Build", "build-script", true),
    script("Product behavior", "product-script"),
    {
      name: "React Doctor",
      tool: "react-doctor",
      args: [".", "--yes", "--no-score", "--no-supply-chain", "--blocking", "error"],
      required: o["react-doctor"] === true,
      enabled: o["react-doctor"] === true,
    },
    ...[
      ["Fallow dead code", ["dead-code", "--fail-on-issues", "--fail-on-parse-error"]],
      ["Fallow duplication", ["dupes", "--fail-on-issues"]],
      ["Fallow complexity", ["health", "--fail-on-issues", "--fail-on-parse-error"]],
      ["Fallow architecture", ["architecture", "--fail-on-issues", "--fail-on-parse-error"]],
    ].map(([name, args]) => ({
      name: String(name),
      tool: "fallow",
      args: /** @type {string[]} */ (args),
      required: o.fallow === true,
      enabled: o.fallow === true && o.deep === true,
    })),
    {
      name: "Playwright browsers",
      tool: "@playwright/test",
      bin: "playwright",
      args: ["install", "--with-deps", "chromium"],
      required: o.playwright === true,
      enabled:
        o.playwright === true &&
        (Boolean(o["smoke-script"]) || (o.deep === true && Boolean(o["e2e-script"]))),
    },
    script("Smoke", "smoke-script"),
    script("E2E", "e2e-script", false, true),
    script("Dependency/security", "security-script", false, true),
  ];
}

export function findTool(root, cwd, name) {
  let current = cwd;
  while (inside(root, current)) {
    const manifest = join(current, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      const version = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
      if (version !== undefined) {
        if (!exactVersion.test(version))
          throw new Error(`Pin ${name} to an exact version (found ${version}).`);
        // pnpm keeps packages behind links; require.resolve is not needed for executable lookup.
        let binaryRoot = current;
        while (inside(root, binaryRoot)) {
          const binary = join(
            binaryRoot,
            "node_modules",
            ".bin",
            name === "@playwright/test" ? "playwright" : name,
          );
          if (existsSync(binary)) return binary;
          if (binaryRoot === root) break;
          binaryRoot = dirname(binaryRoot);
        }
        throw new Error(`Install the locked local ${name} dependency before running the gate.`);
      }
    }
    if (current === root) break;
    current = dirname(current);
  }
  throw new Error(`Add ${name} as an exact-version project devDependency.`);
}

export async function run(command, args, cwd, seconds = 300) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      CI: "true",
      DO_NOT_TRACK: "1",
      FALLOW_TELEMETRY_DISABLED: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    },
  });
  await new Promise((accept, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, seconds * 1000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${error.message}. Check tool installation.`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new Error(`Check timeout after ${seconds}s; the process group was stopped.`));
      else if (code !== 0)
        reject(
          new Error(`Exit ${code ?? signal}; fix the diagnostics above and rerun this check.`),
        );
      else accept(undefined);
    });
  });
}

export function managerCommand(manager) {
  return manager.name === "npm" && !manager.version
    ? { command: "npm", prefix: [] }
    : {
        command: "npm",
        prefix: ["exec", "--yes", "--package=corepack@0.36.0", "--", "corepack", manager.name],
      };
}

export async function install(root, manager, seconds) {
  const { command, prefix } = managerCommand(manager);
  const args =
    manager.name === "npm"
      ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
      : manager.name === "pnpm"
        ? ["install", "--frozen-lockfile", "--ignore-scripts"]
        : manager.version?.startsWith("1.")
          ? ["install", "--frozen-lockfile", "--ignore-scripts"]
          : ["install", "--immutable", "--mode=skip-builds"];
  await run(command, [...prefix, ...args], root, seconds);
}

export function failed(results) {
  return results.some((r) => r.status === "FAIL" || (r.required && r.status === "NOT CONFIGURED"));
}

const escapeCell = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("<", "&lt;");

export function markdown(results) {
  return [
    "## Product engineering quality gate",
    "",
    "| Check | Status | Required this run | Evidence / action |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${escapeCell(r.name)} | **${r.status}** | ${r.required ? "yes" : "no"} | ${escapeCell(r.detail)}${r.seconds === undefined ? "" : ` (${r.seconds}s)`} |`,
    ),
    "",
    "Evidence is command exit status; detailed test counts and diagnostics are in the step log. A PASS does not establish product correctness beyond the tests executed.",
    "",
    "Synthetic fixtures are illustrative contracts, not evidence of live provider behavior. Optional checks and live AI review are never implied by a green job.",
    "",
  ].join("\n");
}

export async function main(options = {}, settings = {}) {
  const o = { ...defaults, ...options };
  const root = realpathSync(settings.root ?? process.env.GITHUB_WORKSPACE ?? process.cwd());
  /** @type {Result[]} */
  const results = [];
  let checks = planChecks({}, o);
  try {
    const seconds = Number(o["check-timeout-seconds"]);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1200)
      throw new Error("check-timeout-seconds must be 1..1200.");
    const requested = resolve(root, String(o["working-directory"]));
    if (!inside(root, requested))
      throw new Error("working-directory must stay inside the checkout.");
    const cwd = realpathSync(requested);
    if (!inside(root, cwd)) throw new Error("working-directory symlink leaves the checkout.");
    const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    const manager = detectManager(root, rootPkg);
    checks = planChecks(pkg, o);
    results.push({
      name: "Configuration",
      status: "PASS",
      required: true,
      detail: `${manager.name}; install root is checkout root; check directory ${relative(root, cwd) || "."}`,
    });
    if (settings.install !== false) {
      await install(root, manager, seconds);
      results.push({
        name: "Locked dependency installation",
        status: "PASS",
        required: true,
        detail: `${manager.lockfile}; dependency lifecycle hooks disabled`,
      });
    }
    for (const check of checks) {
      const started = Date.now();
      const row = {
        name: check.name,
        required: check.required && check.enabled,
        status: "SKIPPED",
        detail: "Disabled for this run.",
      };
      results.push(row);
      if (!check.enabled) {
        row.detail = check.required
          ? "Deferred to deep run; set deep: true."
          : "Opt-in check disabled.";
        if (!check.required) row.status = "NOT CONFIGURED";
        continue;
      }
      if ("script" in check && !check.script) {
        row.status = "NOT CONFIGURED";
        row.detail = check.required
          ? "Required script name is empty. Configure a real script."
          : "No script selected; no claim of verification.";
        continue;
      }
      try {
        if ("tool" in check && check.tool) {
          if (
            check.tool === "react-doctor" &&
            !pkg.dependencies?.react &&
            !pkg.devDependencies?.react
          )
            throw new Error("React Doctor enabled without a React dependency in this package.");
          const binary = findTool(root, cwd, check.tool);
          await run(binary, check.args ?? [], cwd, seconds);
          row.detail = `${check.tool} ${(check.args ?? []).join(" ")}`;
        } else if ("script" in check && check.script) {
          const name = check.script;
          if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(name))
            throw new Error("Pass a package script name, not a shell command.");
          if (!pkg.scripts?.[name])
            throw new Error(
              `Missing package script '${name}'. Add it or select an existing script.`,
            );
          const { command, prefix } = managerCommand(manager);
          await run(command, [...prefix, "run", name], cwd, seconds);
          row.detail = `package script: ${name}; inspect the log for test counts`;
        }
        row.status = "PASS";
      } catch (error) {
        row.status = "FAIL";
        row.detail = error instanceof Error ? error.message : String(error);
        console.error(`${check.name}: ${row.detail}`);
      }
      Object.assign(row, { seconds: Math.round((Date.now() - started) / 100) / 10 });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name: "Prerequisites", status: "FAIL", required: true, detail });
    console.error(detail);
    for (const check of checks)
      results.push({
        name: check.name,
        status: "SKIPPED",
        required: check.required,
        detail: "Unavailable because prerequisite setup failed; see Prerequisites.",
      });
  }
  const report = markdown(results);
  const output = join(root, ".quality-gate");
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify({ schemaVersion: 1, passed: !failed(results), checks: results }, null, 2) + "\n",
  );
  writeFileSync(join(output, "summary.md"), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  return { passed: !failed(results), checks: results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = JSON.parse(process.env.QG_OPTIONS ?? "{}");
  const report = await main(options, { install: !process.argv.includes("--no-install") });
  if (!report.passed) process.exitCode = 1;
}
