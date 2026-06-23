import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login form renders with email and password fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /sign in|log in|get started/i }).first().click();
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test("shows error on bad credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /sign in|log in|get started/i }).first().click();
    await page.getByLabel(/email/i).first().fill("notreal@test.invalid");
    await page.getByLabel(/password/i).first().fill("badpassword");
    await page.getByRole("button", { name: /sign in|log in/i }).last().click();
    await expect(
      page.getByText(/invalid|incorrect|not found|error/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signup flow is closed (admin-invite-only)", async ({ page }) => {
    await page.goto("/");
    // If there's a signup link/tab, clicking it should show a closed message
    const signupBtn = page.getByRole("button", { name: /sign up|create account|register/i }).first();
    if (await signupBtn.isVisible()) {
      await signupBtn.click();
      await expect(
        page.getByText(/disabled|closed|contact|administrator|invite/i).first()
      ).toBeVisible({ timeout: 8_000 });
    }
  });
});
