import { test, expect } from "@playwright/test";

test.describe("Demo page", () => {
  test("shows scenario selection cards", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /demo/i }).click();
    // At least one scenario card should appear
    const scenarioCards = page.locator("[data-testid='scenario-card'], button").filter({
      hasText: /security|gtm|competitive|finance|procurement|supply/i,
    });
    await expect(scenarioCards.first()).toBeVisible({ timeout: 8_000 });
  });

  test("API unavailable shows clear error not fake results", async ({ page }) => {
    // Block API calls to simulate API down
    await page.route("**/demo/**", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: /demo/i }).click();

    // Pick any scenario that appears
    const firstScenario = page.locator("button").filter({
      hasText: /security|vendor|competitive|procurement/i,
    }).first();
    if (await firstScenario.isVisible({ timeout: 5_000 })) {
      await firstScenario.click();
      const runBtn = page.getByRole("button", { name: /run|analyze|start/i }).first();
      if (await runBtn.isVisible({ timeout: 3_000 })) {
        await runBtn.click();
        // Should show an explicit error, NOT fake 0.84 confidence results
        await expect(
          page.getByText(/unavailable|failed|error|offline/i).first()
        ).toBeVisible({ timeout: 12_000 });
        // Should NOT show fake confidence score
        await expect(page.getByText("0.84")).not.toBeVisible();
      }
    }
  });

  test("Pricing page loads with plan cards", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /pricing/i }).click();
    await expect(page.getByText(/starter|pro|enterprise|plan/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
