import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows the WebDataOS wordmark", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/WebDataOS/i);
    await expect(page.getByText("WebDataOS")).toBeVisible();
  });

  test("hero headline is visible", async ({ page }) => {
    await page.goto("/");
    // The hero h1 should be present and non-empty
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    const text = await h1.innerText();
    expect(text.trim().length).toBeGreaterThan(5);
  });

  test("nav shows Home, Demo, Pricing for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /home/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /demo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /pricing/i })).toBeVisible();
  });

  test("nav does not show internal pages without auth", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^feed$/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^monitor$/i })).not.toBeVisible();
  });

  test("clicking Demo nav goes to demo page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /demo/i }).click();
    await expect(page.getByText(/scenario|intelligence|choose|select/i).first()).toBeVisible();
  });

  test("FAQ section is present and interactive", async ({ page }) => {
    await page.goto("/");
    const faqQuestion = page.getByText(/how is this different/i).first();
    await faqQuestion.scrollIntoViewIfNeeded();
    await expect(faqQuestion).toBeVisible();
    await faqQuestion.click();
    // After click the answer should appear
    await expect(page.getByText(/Alerts tell you/i)).toBeVisible();
  });
});
