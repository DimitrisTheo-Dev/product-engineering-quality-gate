import { defineConfig } from "@playwright/test";

const url = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: url },
  webServer: { command: "npm run preview", url, reuseExistingServer: false },
});
