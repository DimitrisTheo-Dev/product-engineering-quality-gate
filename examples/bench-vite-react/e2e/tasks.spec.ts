import { expect, test } from "@playwright/test";

test("filters the production build from the labelled input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("textbox", { name: "Search tasks" }).fill("release");
  await expect(page.getByRole("listitem")).toHaveText(["Publish release notes"]);
});
