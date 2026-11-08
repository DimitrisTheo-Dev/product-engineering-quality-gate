import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 15_000,
  retries: 0,
  workers: 1,
  outputDir: "../../test-results",
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: { browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
});
