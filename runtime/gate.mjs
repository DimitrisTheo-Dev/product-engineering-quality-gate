import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  openSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { availableParallelism, homedir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  matchesGlob,
  relative,
  resolve,
  sep,
} from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const defaults = {
  "working-directory": ".",
  config: "quality-gate.config.json",
  deep: false,
  "check-timeout-seconds": 300,
};

export const exactVersion = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/;
export const scriptName = /^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/;
export const requiredKinds = ["typecheck", "test", "build"];
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const startupMs = performance.now();
const elapsed = (start) => Math.round((performance.now() - start) * 1000) / 1000;
const seconds = (ms) => Math.round(ms / 100) / 10;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = (dir) => readJson(join(dir, "package.json"));
const message = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Put the pinned package manager on PATH for package scripts, so a script that calls it again (`pnpm -r build`) runs
 * the same version instead of whatever the runner has installed. Returns the directory holding the shim.
 */
export function writeManagerShim(dir, name, entry, node = process.execPath) {
  if (!/^[a-z]+$/.test(name) || [entry, node].some((path) => /["$`\n]/.test(path)))
    throw new Error(`Refusing to write a ${name} shim for an unexpected path.`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `#!/bin/sh\nexec "${node}" "${entry}" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(dir, `${name}.cmd`), `@"${node}" "${entry}" %*\r\n`);
  return dir;
}

/** Why a command could not start, with the fix when it is a known setup gap. */
export function spawnFailure(command, error) {
  if (
    command === "corepack" &&
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  )
    return "Corepack is not installed. Node 25 and later no longer include it: run `npm install --global corepack`, or use Node 24.";
  return `${message(error)}. Check executable installation.`;
}
const locks = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};

export function inside(root, target) {
  const path = relative(root, target);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export function detectManager(root, pkg = manifest(root), { allowMissing = false } = {}) {
  const found = Object.keys(locks).filter((file) => existsSync(join(root, file)));
  if (found.length > 1 || (!allowMissing && !found.length))
    throw new Error(
      "Keep exactly one supported lockfile at the install root; remove conflicting lockfiles.",
    );
  const declared =
    typeof pkg.packageManager === "string" &&
    pkg.packageManager.match(
      /^(npm|pnpm|yarn|bun)@(\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?)(?:\+(sha(?:224|256|384|512)\.[a-f\d]+))?$/,
    );
  if (pkg.packageManager !== undefined && !declared)
    throw new Error("Pin packageManager to name@x.y.z, optionally with a Corepack integrity hash.");
  const name = locks[found[0]] ?? (declared ? declared[1] : "npm");
  if (declared && declared[1] !== name) throw new Error("packageManager must match the lockfile.");
  if (name === "bun" && found[0] === "bun.lockb")
    throw new Error(
      "Convert bun.lockb with bun install --save-text-lockfile --frozen-lockfile --lockfile-only --ignore-scripts, then remove bun.lockb and commit bun.lock.",
    );
  if (name !== "npm" && !declared) throw new Error(`Pin packageManager: ${name}@x.y.z.`);
  const version = declared ? declared[2] : undefined;
  const hash = declared ? declared[3] : undefined;
  if (hash && hash.split(".")[1].length !== Number(hash.split(".")[0].slice(3)) / 4)
    throw new Error("packageManager integrity hash has the wrong length.");
  if (name === "bun") {
    if (!version || hash || !/^\d+\.\d+\.\d+$/.test(version))
      throw new Error("Pin Bun to packageManager: bun@x.y.z.");
  }
  if (name === "yarn" && version && !version.startsWith("1.") && !hash && version !== "4.18.1")
    throw new Error("Add a +sha224 or +sha512 integrity suffix to the Yarn packageManager pin.");
  if (
    name === "yarn" &&
    (existsSync(join(root, ".pnp.cjs")) ||
      (!version?.startsWith("1.") &&
        (!existsSync(join(root, ".yarnrc.yml")) ||
          !/^\s*nodeLinker:\s*node-modules\s*(?:#.*)?$/m.test(
            readFileSync(join(root, ".yarnrc.yml"), "utf8"),
          ))))
  )
    throw new Error("Yarn PnP is unsupported. Set nodeLinker: node-modules in .yarnrc.yml.");
  const lockfile = found[0] ?? Object.keys(locks).find((file) => locks[file] === name);
  if (!lockfile) throw new Error("Cannot select a lockfile.");
  return { name, version, hash, lockfile };
}

function keys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unknown option ${path}.${key}.`);
}

function list(value, valid, path) {
  if (!Array.isArray(value) || !value.every(valid) || new Set(value).size !== value.length)
    throw new Error(`${path} must be an array of unique, valid values.`);
  return value;
}

export function validateConfig(config) {
  keys(config, ["setup", "tools", "checks", "policy"], "config");
  const setup = list(
    config.setup === undefined ? [] : config.setup,
    (s) => typeof s === "string" && scriptName.test(s),
    "config.setup (package script names)",
  );
  const tools = list(
    config.tools === undefined ? [] : config.tools,
    (s) => typeof s === "string" && packageName.test(s),
    "config.tools (package names)",
  );
  if (!Array.isArray(config.checks)) throw new Error("config.checks must be an array.");
  const names = new Set();
  for (const [index, check] of config.checks.entries()) {
    const path = `config.checks[${index}]`;
    keys(check, ["name", "kind", "script", "concurrent", "tier", "paths", "runner"], path);
    if (typeof check.name !== "string" || !check.name.trim() || oneLine(check.name) !== check.name)
      throw new Error(`${path}.name must be a nonempty single-line label.`);
    if (names.has(check.name)) throw new Error(`Duplicate check name ${check.name}.`);
    names.add(check.name);
    if (typeof check.kind !== "string" || !/^[a-z][a-z0-9-]*$/.test(check.kind))
      throw new Error(`${path}.kind must be a lowercase identifier.`);
    if (typeof check.script !== "string" || !scriptName.test(check.script))
      throw new Error(`${path}.script must be a package script name.`);
    if (check.concurrent !== undefined && typeof check.concurrent !== "boolean")
      throw new Error(`${path}.concurrent must be a boolean.`);
    if (check.tier !== undefined && check.tier !== "deep")
      throw new Error(`${path}.tier must be deep when specified.`);
    if (check.runner !== undefined && check.runner !== "node")
      throw new Error(`${path}.runner must be node when specified.`);
    if (check.paths !== undefined)
      list(
        check.paths,
        (p) =>
          typeof p === "string" &&
          /^[\w.*/?{}[\],+@ -]+$/.test(p) &&
          !p.startsWith("/") &&
          !p.split("/").includes(".."),
        `${path}.paths (repository-relative globs)`,
      );
  }
  const policy = config.policy === undefined ? {} : config.policy;
  keys(policy, ["waive"], "config.policy");
  const waive = list(
    policy.waive === undefined ? [] : policy.waive,
    (kind) => requiredKinds.includes(kind),
    "config.policy.waive (typecheck, test or build)",
  );
  for (const kind of requiredKinds) {
    const configured = config.checks.some((check) => check.kind === kind && check.tier !== "deep");
    if (configured === waive.includes(kind))
      throw new Error(
        configured
          ? `Remove redundant waiver for ${kind}.`
          : `Add a fast ${kind} check or waive ${kind} explicitly.`,
      );
  }
  return { setup, tools, checks: config.checks, waive };
}

function packagePath(parent, value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value))
    throw new Error(`${label} must be a relative path.`);
  const path = resolve(parent, value);
  if (!inside(parent, path)) throw new Error(`${label} must stay inside its directory.`);
  const real = realpathSync(path);
  if (!inside(parent, real)) throw new Error(`${label} symlink leaves its directory.`);
  return real;
}

function pinnedTools(root, cwd, names) {
  const tools = {};
  for (const name of names) {
    let installed;
    let declared;
    for (let dir = cwd; inside(root, dir); dir = dirname(dir)) {
      const path = join(dir, "node_modules", name, "package.json");
      if (installed === undefined && existsSync(path)) {
        if (!inside(root, realpathSync(path)))
          throw new Error(`Installed ${name} leaves the checkout.`);
        installed = readJson(path).version;
      }
      if (declared === undefined && existsSync(join(dir, "package.json"))) {
        const pkg = manifest(dir);
        declared = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
      }
      if (dir === root) break;
    }
    if (typeof declared !== "string" || !exactVersion.test(declared))
      throw new Error(
        `Pin ${name} to an exact dependency version (found ${declared ?? "no declaration"}).`,
      );
    if (declared !== installed)
      throw new Error(
        `Expected installed ${name} ${declared}, found ${installed ?? "nothing"}. Check the lockfile.`,
      );
    Object.defineProperty(tools, name, { value: installed, enumerable: true });
  }
  return tools;
}

export function changedFiles(root, event, base, head) {
  if (
    !["pull_request", "merge_group"].includes(event) ||
    !/^[a-f0-9]{40}$/.test(base ?? "") ||
    !/^[a-f0-9]{40}$/.test(head ?? "")
  )
    return null;
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return result.status === 0 ? result.stdout : null;
  };
  if (event === "pull_request") {
    const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"])?.trim().split(" ");
    if (parents?.length !== 3 || parents[1] !== base || parents[2] !== head) return null;
  } else if (
    git(["rev-parse", "HEAD"])?.trim() !== head ||
    git(["merge-base", "--is-ancestor", base, head]) === null
  ) {
    return null;
  }
  const names = git([
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    base,
    "HEAD",
    "--",
  ]);
  return names === null ? null : names.split("\0").filter(Boolean);
}

function canFilter(paths, configPath) {
  return (
    paths !== null &&
    !paths.some(
      (path) =>
        path === configPath ||
        [
          "package.json",
          defaults.config,
          "pnpm-workspace.yaml",
          ".npmrc",
          ".yarnrc",
          ".yarnrc.yml",
          "bunfig.toml",
        ].includes(basename(path)) ||
        Object.hasOwn(locks, basename(path)) ||
        path.startsWith(".github/workflows/"),
    )
  );
}

function scriptBody(scripts, script) {
  if (
    !scripts ||
    !Object.hasOwn(scripts, script) ||
    typeof scripts[script] !== "string" ||
    !scripts[script].trim()
  )
    throw new Error(`Missing package script '${script}'. Add it to package.json.`);
  return scripts[script];
}

function childEnvironment(overrides) {
  const env = { ...process.env, ...overrides, CI: "true", DO_NOT_TRACK: "1" };
  for (const key of [
    "GITHUB_ENV",
    "GITHUB_PATH",
    "GITHUB_OUTPUT",
    "GITHUB_STATE",
    "GITHUB_STEP_SUMMARY",
    "QG_OPTIONS",
  ])
    delete env[key];
  return env;
}

export function run(
  command,
  args,
  cwd,
  {
    timeout = 300,
    signal = /** @type {AbortSignal | undefined} */ (undefined),
    env = {},
    capture = false,
    grouped = false,
    label = "",
  } = {},
) {
  if (signal?.aborted) throw new Error("Gate terminated before the command started.");
  if (!capture && !grouped) console.log(`\n$ ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    env: childEnvironment(env),
    stdio: capture || grouped ? ["ignore", "pipe", "pipe"] : "inherit",
    detached: process.platform !== "win32",
  });
  let output = "";
  let stdout = "";
  let truncated = false;
  const collect = (chunk) => {
    if (output.length < 2_000_000) output += String(chunk);
    else truncated = true;
  };
  child.stdout?.on("data", (chunk) => {
    collect(chunk);
    if (capture && stdout.length < 2_000_000) stdout += String(chunk);
  });
  child.stderr?.on("data", collect);
  return new Promise((accept, reject) => {
    let stopping = "";
    /** @type {NodeJS.Timeout | undefined} */
    let grace;
    let stopped;
    const send = (sig) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
    };
    const stop = (reason) => {
      if (stopping) return;
      stopping = reason;
      send("SIGTERM");
      stopped = new Promise((done) => {
        grace = setTimeout(() => {
          send("SIGKILL");
          done(undefined);
        }, 1000);
      });
    };
    const abort = () => stop("Gate terminated; the process group was stopped.");
    const timer = setTimeout(
      () => stop(`Command timeout after ${timeout}s; the process group was stopped.`),
      timeout * 1000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error(spawnFailure(command, error)));
    });
    child.once("close", async (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (grace) await stopped;
      if (grouped) {
        console.log(`::group::${oneLine(label)}\n$ ${command} ${args.join(" ")}`);
        process.stdout.write(output + (truncated ? "\n[check log truncated]\n" : "\n"));
        console.log("::endgroup::");
      }
      if (stopping) reject(new Error(stopping));
      else if (code !== 0)
        reject(
          new Error(
            `Exit ${code ?? sig}. Fix the diagnostics and rerun.${capture ? "\n" + output.trim() : ""}`,
          ),
        );
      else accept(stdout.trim());
    });
  });
}

/** @typedef {ReturnType<typeof detectManager>} Manager */

export function installArgs(/** @type {Manager} */ manager, update = false) {
  if (manager.name === "npm")
    return [
      ...(update ? ["install", "--package-lock-only"] : ["ci"]),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ];
  if (manager.name === "bun")
    return [
      "install",
      "--ignore-scripts",
      ...(update ? ["--lockfile-only"] : ["--frozen-lockfile"]),
    ];
  if (manager.name === "pnpm")
    return [
      "install",
      "--ignore-scripts",
      ...(update
        ? ["--lockfile-only", "--no-frozen-lockfile", "--config.minimumReleaseAgeStrict=true"]
        : ["--frozen-lockfile"]),
      "--ignore-pnpmfile",
    ];
  if (manager.version?.startsWith("1."))
    return [
      "install",
      "--ignore-scripts",
      "--non-interactive",
      ...(update ? [] : ["--frozen-lockfile"]),
    ];
  return ["install", update ? "--no-immutable" : "--immutable", "--mode=skip-build"];
}

export async function resolveManager(
  /** @type {Manager} */ manager,
  signal = /** @type {AbortSignal | undefined} */ (undefined),
  npmVersion = /** @type {string | undefined} */ (undefined),
) {
  const trusted = dirname(process.execPath);
  if (manager.name === "bun") {
    let version;
    try {
      version = await run("bun", ["--version"], trusted, { capture: true, signal });
    } catch (error) {
      throw new Error(`Provision Bun ${manager.version} before running the gate or onboarding.`, {
        cause: error,
      });
    }
    if (version !== manager.version)
      throw new Error(`Expected Bun ${manager.version}, found ${version}.`);
    return { command: "bun", prefix: [], version, env: {} };
  }
  const env =
    manager.name === "yarn"
      ? { YARN_IGNORE_PATH: "1" }
      : manager.name === "pnpm"
        ? { npm_config_manage_package_manager_versions: "false" }
        : {};
  if (!manager.version) {
    const version =
      npmVersion ?? (await run("npm", ["--version"], trusted, { capture: true, signal }));
    if (!exactVersion.test(version)) throw new Error("Cannot determine the bundled npm version.");
    return { command: "npm", prefix: [], version, env };
  }
  const { name, version } = manager;
  const hash =
    manager.hash ??
    (name === "yarn" && version === "4.18.1"
      ? "sha512.b2e1e7524f654f2749d32b4ebcb4622473cb5bcbc485df2007e12a154e50162a4d795526768bc5f5b8f81717bfd79deb2472813d86fb5ae2eb551fa9c872b08f"
      : undefined);
  const home =
    process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_TEMP
      ? join(process.env.RUNNER_TEMP, "quality-gate-corepack")
      : (process.env.COREPACK_HOME ??
        join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "node/corepack"));
  await run(
    "corepack",
    ["install", "--global", `${name}@${version}${hash ? "+" + hash : ""}`],
    trusted,
    {
      capture: true,
      signal,
      timeout: 120,
      env: {
        COREPACK_HOME: home,
        COREPACK_ENV_FILE: "0",
        COREPACK_DEFAULT_TO_LATEST: "0",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        COREPACK_ON_UNVERIFIED_DOWNLOAD: "error",
      },
    },
  );
  const dir = realpathSync(join(home, "v1", name, version));
  const metadata = readJson(join(dir, ".corepack"));
  if (hash && metadata.hash !== hash)
    throw new Error(
      `Cached ${name}@${version} does not match its integrity pin. Clear the Corepack cache for this version.`,
    );
  const bin = packagePath(
    dir,
    Array.isArray(metadata.bin) ? `${name}.js` : metadata.bin[name],
    "Package manager entrypoint",
  );
  const shims = writeManagerShim(join(home, "quality-gate-bin", `${name}@${version}`), name, bin);
  return {
    command: process.execPath,
    prefix: [bin],
    version,
    env: { ...env, PATH: `${shims}${delimiter}${process.env.PATH ?? ""}` },
  };
}

export function cacheConfiguration(manager, parent) {
  /** @type {{path: string, args: string[], env: Record<string, string>}} */
  const cache = { path: "", args: [], env: {} };
  if (!parent) return cache;
  const path = join(parent, "quality-gate-downloads", manager.name);
  switch (manager.name) {
    case "npm":
      return {
        ...cache,
        path: join(path, "_cacache"),
        env: { npm_config_cache: path, npm_config_prefer_offline: "true" },
      };
    case "pnpm":
      return { ...cache, path, args: ["--store-dir", path] };
    case "bun":
      return { ...cache, path, args: ["--cache-dir", path] };
    case "yarn":
      return {
        ...cache,
        path,
        env: {
          YARN_CACHE_FOLDER: path,
          ...(manager.version?.startsWith("1.") ? {} : { YARN_ENABLE_GLOBAL_CACHE: "false" }),
        },
      };
    default:
      return cache;
  }
}

export async function planDependencyCache(root, parent) {
  const selected = detectManager(root);
  const path = realpathSync(join(root, selected.lockfile));
  if (!inside(realpathSync(root), path))
    throw new Error("The lockfile symlink leaves the checkout.");
  const version = selected.version ?? (await resolveManager(selected)).version;
  const store = cacheConfiguration(selected, parent);
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  const nodeMajor = process.versions.node.split(".")[0];
  const key = store.path
    ? `qg-v2-${process.platform}-${process.arch}-${selected.name}-${version}-node${nodeMajor}-${digest}`
    : "";
  return { key, path: store.path, version, manager: selected.name };
}

export async function publishCachePlan() {
  try {
    const root = realpathSync(process.env.GITHUB_WORKSPACE ?? process.cwd());
    const plan = await planDependencyCache(root, process.env.RUNNER_TEMP);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(plan)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(""),
      );
  } catch {
    // The checks step reports configuration errors with the normal evidence.
    console.log("Dependency cache plan unavailable. The gate will validate configuration.");
  }
}

export const failed = (rows) => rows.some((row) => row.status === "FAIL");

function oneLine(value) {
  return Array.from(String(value), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  }).join("");
}
function codeCell(value) {
  const text = oneLine(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|");
  const length = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1;
  const fence = "`".repeat(length);
  return `${fence} ${text || " "} ${fence}`;
}

export function markdown(results) {
  return [
    "## Product engineering quality gate",
    "",
    "| Check | Status | Evidence |",
    "| --- | --- | --- |",
    ...results.map(
      (row) =>
        `| ${codeCell(row.name)} | **${row.status}** | ${codeCell(row.detail)}${row.seconds === undefined ? "" : ` (${row.seconds}s)`} |`,
    ),
    "",
  ].join("\n");
}

function annotate(row) {
  if (process.env.GITHUB_ACTIONS !== "true" || row.status !== "FAIL") return;
  const text = `${row.name}. ${row.detail}`
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.error(`::error::${text}`);
}

function writeReport(path, contents) {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    writeFileSync(fd, contents);
  } finally {
    closeSync(fd);
  }
}

export async function main(options = {}, settings = {}) {
  const started = performance.now();
  const o = { ...defaults, ...options };
  const root = realpathSync(settings.root ?? process.env.GITHUB_WORKSPACE ?? process.cwd());
  const timings = {
    startupMs: Math.round(startupMs * 1000) / 1000,
    configurationMs: 0,
    changeDetectionMs: /** @type {number | null} */ (null),
    managerResolutionMs: /** @type {number | null} */ (null),
    installMs: /** @type {number | null} */ (null),
    checks: /** @type {{name: string, ms: number}[]} */ ([]),
    toolsVerificationMs: /** @type {number | null} */ (null),
    reportingMs: 0,
  };
  /** @type {{name: string, status: string, detail: string, seconds?: number, script?: string, body?: string, reason?: string, runner?: string}[]} */
  const results = [];
  const controller = new AbortController();
  const terminate = () => controller.abort();
  process.on("SIGTERM", terminate);
  process.on("SIGINT", terminate);
  let config;
  let tools = {};
  let managerEvidence;
  let phase = "Configuration";
  try {
    const timeout = Number(o["check-timeout-seconds"]);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1200)
      throw new Error("check-timeout-seconds must be 1..1200.");
    const cwd = packagePath(root, o["working-directory"], "working-directory");
    const configPath = packagePath(cwd, o.config, "config");
    config = validateConfig(readJson(configPath));
    for (const kind of config.waive)
      results.push({
        name: `Policy waiver (${kind})`,
        status: "SKIPPED",
        reason: "waived",
        detail: `${kind} was explicitly waived.`,
      });
    const selected = detectManager(root);
    if (!inside(root, realpathSync(join(root, selected.lockfile))))
      throw new Error("The lockfile symlink leaves the checkout.");
    timings.configurationMs = elapsed(started);
    phase = "Package manager";
    const resolveStarted = performance.now();
    let manager;
    try {
      manager = await resolveManager(selected, controller.signal, settings.npmVersion || undefined);
    } finally {
      timings.managerResolutionMs = elapsed(resolveStarted);
    }
    const cache = cacheConfiguration(selected, settings.cacheParent);
    const managerEnv = { ...manager.env, ...cache.env };
    const event = process.env.QG_CHANGE_EVENT;
    const base = process.env.QG_CHANGE_BASE;
    const head = process.env.QG_CHANGE_HEAD;
    const changeStarted = performance.now();
    const changes = config.checks.some((check) => check.paths?.length)
      ? changedFiles(root, event, base, head)
      : null;
    timings.changeDetectionMs = elapsed(changeStarted);
    const filter = canFilter(changes, relative(root, configPath));
    const scriptEnv = {
      ...managerEnv,
      QG_BASE_SHA: /^[a-f0-9]{40}$/.test(base ?? "") ? base : "",
      QG_HEAD_SHA: /^[a-f0-9]{40}$/.test(head ?? "") ? head : "",
    };
    managerEvidence = {
      name: selected.name,
      version: manager.version,
      lockfile: selected.lockfile,
    };
    if (settings.install !== false) {
      phase = "Locked dependency installation";
      const installStarted = performance.now();
      try {
        await run(
          manager.command,
          [...manager.prefix, ...installArgs(selected), ...cache.args],
          root,
          {
            timeout: 600,
            signal: controller.signal,
            env: managerEnv,
          },
        );
        results.push({
          name: phase,
          status: "PASS",
          detail: `${selected.lockfile}; lifecycle scripts disabled`,
          seconds: seconds(elapsed(installStarted)),
        });
      } finally {
        timings.installMs = elapsed(installStarted);
      }
    }
    phase = "Installed tools";
    const toolsStarted = performance.now();
    try {
      tools = pinnedTools(root, cwd, config.tools);
    } finally {
      timings.toolsVerificationMs = elapsed(toolsStarted);
    }
    const execute = async (name, script, grouped = false, preferNode = false) => {
      const start = performance.now();
      const row = {
        name,
        script,
        status: "FAIL",
        detail: "",
        body: /** @type {string | undefined} */ (undefined),
        runner: /** @type {string | undefined} */ (undefined),
        seconds: 0,
      };
      try {
        const scripts = manifest(cwd).scripts;
        row.body = scriptBody(scripts, script);
        const useNode =
          preferNode &&
          selected.name === "npm" &&
          !Object.hasOwn(scripts, `pre${script}`) &&
          !Object.hasOwn(scripts, `post${script}`);
        const command = useNode ? process.execPath : manager.command;
        const args = useNode ? ["--run", script] : [...manager.prefix, "run", script];
        row.runner = useNode ? "node" : selected.name;
        await run(command, args, cwd, {
          timeout,
          signal: controller.signal,
          env: scriptEnv,
          grouped,
          label: name,
        });
        row.status = "PASS";
        row.detail = `Package script ${script} completed.`;
      } catch (error) {
        row.detail = message(error);
        console.error(`${oneLine(name)}: ${row.detail}`);
      }
      const ms = elapsed(start);
      row.seconds = seconds(ms);
      return { row, ms };
    };
    const add = ({ row, ms = /** @type {number | undefined} */ (undefined) }) => {
      results.push(row);
      if (ms !== undefined) timings.checks.push({ name: row.name, ms });
    };
    for (const script of config.setup) {
      const result = await execute(`Setup ${script}`, script);
      add(result);
      if (result.row.status === "FAIL") break;
    }
    const prerequisiteFailed = failed(results);
    const evaluate = async (check, grouped = false) => {
      let reason = "";
      let detail = "";
      if (prerequisiteFailed || controller.signal.aborted) {
        reason = "prerequisite-failed";
        detail = "Setup failed or the gate was stopped.";
      } else if (check.tier === "deep" && o.deep !== true) {
        reason = "deep-tier";
        detail = "Enable deep to run this check.";
      } else if (
        filter &&
        changes &&
        check.paths?.length &&
        !changes.some((path) => check.paths.some((glob) => matchesGlob(path, glob)))
      ) {
        reason = "no-matching-changes";
        detail = "Changed files did not match the configured paths.";
      }
      if (!reason) return execute(check.name, check.script, grouped, check.runner === "node");
      if (reason !== "prerequisite-failed") {
        try {
          scriptBody(manifest(cwd).scripts, check.script);
        } catch (error) {
          return {
            row: { name: check.name, script: check.script, status: "FAIL", detail: message(error) },
          };
        }
      }
      return { row: { name: check.name, script: check.script, status: "SKIPPED", reason, detail } };
    };
    const cap = availableParallelism();
    for (let index = 0; index < config.checks.length;) {
      const check = config.checks[index];
      if (check.concurrent !== true) {
        add(await evaluate(check));
        index++;
      } else {
        const batch = [check];
        while (batch.length < cap && config.checks[index + batch.length]?.concurrent === true)
          batch.push(config.checks[index + batch.length]);
        for (const result of await Promise.all(batch.map((entry) => evaluate(entry, true))))
          add(result);
        index += batch.length;
      }
    }
    if (controller.signal.aborted && !failed(results))
      results.push({
        name: "Termination",
        status: "FAIL",
        detail: "The gate received a termination signal.",
      });
  } catch (error) {
    if (phase === "Configuration") timings.configurationMs = elapsed(started);
    const detail = message(error);
    console.error(detail);
    const ms =
      phase === "Locked dependency installation"
        ? timings.installMs
        : phase === "Package manager"
          ? timings.managerResolutionMs
          : phase === "Installed tools"
            ? timings.toolsVerificationMs
            : timings.configurationMs;
    results.push({
      name: phase,
      status: "FAIL",
      detail,
      seconds: ms === null ? undefined : seconds(ms),
    });
    for (const check of config?.checks ?? [])
      results.push({
        name: check.name,
        status: "SKIPPED",
        reason: "prerequisite-failed",
        detail: `${phase} failed.`,
      });
  } finally {
    process.removeListener("SIGTERM", terminate);
    process.removeListener("SIGINT", terminate);
  }
  const reportingStarted = performance.now();
  const result = {
    schemaVersion: 2,
    version: settings.version,
    passed: !failed(results),
    manager: managerEvidence,
    tools,
    checks: results,
    timings,
  };
  const output = join(root, ".quality-gate");
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink())
    throw new Error("Refusing to write reports through a symlink.");
  try {
    const summary = markdown(results);
    writeReport(join(output, "summary.md"), summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    for (const row of results) annotate(row);
    console.log(summary);
  } finally {
    timings.reportingMs = elapsed(reportingStarted);
    writeReport(join(output, "report.json"), JSON.stringify(result, null, 2) + "\n");
  }
  return result;
}

if (
  process.argv[1] &&
  process.argv[1] !== "-" &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { version } = readJson(new URL("../package.json", import.meta.url));
  const report = await main(JSON.parse(process.env.QG_OPTIONS ?? "{}"), {
    install: !process.argv.includes("--no-install"),
    version,
    cacheParent: process.env.QG_LOCAL_CACHE_PARENT,
  });
  if (!report.passed) process.exitCode = 1;
}
