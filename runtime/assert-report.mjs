import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export function publishVerdict() {
  const passed = verifyReport(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    process.env.QG_OUTCOME,
  );
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `passed=${passed}\n`);
}
