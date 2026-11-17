import { spawnSync } from "node:child_process";
import { withTool } from "./tooling.mjs";

withTool("actionlint", (binary) => {
  for (const files of [[], ["examples/canary/.github/workflows/product-quality.yml"]]) {
    const result = spawnSync(binary, ["-color", ...files], { stdio: "inherit", timeout: 60_000 });
    if (result.status !== 0) {
      process.exitCode = 1;
      break;
    }
  }
});
