import { test, expect } from "@playwright/test";

test("SYNTHETIC browser plumbing: Chromium renders a safe fixture", async ({ page }) => {
  await page.goto("data:text/plain,Synthetic%20quality%20gate%20fixture");
  await expect(page.locator("body")).toHaveText(
    process.env.QG_SMOKE_FORCE_FAILURE === "1"
      ? "Intentional mismatch for failure-artifact verification"
      : "Synthetic quality gate fixture",
  );
});
