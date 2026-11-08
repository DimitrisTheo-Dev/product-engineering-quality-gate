import { spawnSync } from "node:child_process";
import { withTool } from "./tooling.mjs";

withTool("actionlint", (binary) => {
  const result = spawnSync(binary, ["-color"], { stdio: "inherit", timeout: 60_000 });
  if (result.status !== 0) process.exitCode = 1;
});
