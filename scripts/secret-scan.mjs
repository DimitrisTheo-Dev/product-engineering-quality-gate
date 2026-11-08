import { spawnSync } from "node:child_process";
import { withTool } from "./tooling.mjs";

withTool("gitleaks", (binary) => {
  // Scan all local Git refs, including release and demonstration history. Redact any finding.
  const result = spawnSync(binary, ["git", "--log-opts=--all", "--redact", "--no-banner", "."], {
    stdio: "inherit",
    timeout: 120_000,
  });
  if (result.status !== 0) process.exitCode = 1;
});
