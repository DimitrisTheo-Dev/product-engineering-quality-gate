import { appendFileSync, lstatSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function verifyReport(root, outcome) {
  try {
    const dir = join(root, ".quality-gate");
    const path = join(dir, "report.json");
    if (lstatSync(dir).isSymbolicLink() || !lstatSync(path).isFile())
      throw new Error("Expected a regular report file.");
    const report = JSON.parse(readFileSync(path, "utf8"));
    if (
      report.schemaVersion !== 2 ||
      typeof report.passed !== "boolean" ||
      !Array.isArray(report.checks) ||
      report.checks.some((row) => !["PASS", "FAIL", "SKIPPED"].includes(row.status)) ||
      report.passed !== !report.checks.some((row) => row.status === "FAIL") ||
      !["success", "failure"].includes(outcome) ||
      report.passed !== (outcome === "success")
    )
      throw new Error("The report verdict and the checks step outcome must agree.");
    return report.passed;
  } catch (error) {
    throw new Error(
      "Quality gate evidence could not be verified. Review checkout, setup, and check logs.",
      { cause: error },
    );
  }
}

export function browserEvidence(root, requested) {
  const outputs = {};
  if (!requested || isAbsolute(requested)) return outputs;
  try {
    const checkout = realpathSync(root);
    const cwd = realpathSync(resolve(checkout, requested));
    const path = relative(checkout, cwd);
    if (
      isAbsolute(path) ||
      path === ".." ||
      path.startsWith(`..${sep}`) ||
      !/^[\w./ -]*$/.test(path)
    )
      return outputs;
    for (const [key, folder] of [
      ["browserResults", "test-results"],
      ["browserReport", "playwright-report"],
    ]) {
      const dir = join(cwd, folder);
      if (
        lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() &&
        !readdirSync(dir, { recursive: true, withFileTypes: true }).some((entry) =>
          entry.isSymbolicLink(),
        )
      )
        outputs[key] = join(path || ".", folder) + "/";
    }
  } catch {
    // An unavailable evidence directory leaves the original verdict intact.
  }
  return outputs;
}

export function publishVerdict() {
  const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const passed = verifyReport(root, process.env.QG_OUTCOME);
  const outputs = { passed };
  if (!passed && process.env.QG_BROWSER_EVIDENCE === "true")
    Object.assign(outputs, browserEvidence(root, process.env.QG_WORKING_DIRECTORY));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
}
