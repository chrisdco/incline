import { test, type Page } from "@playwright/test";

import { expect, needsKeys } from "./helpers";

needsKeys();

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(!EMAIL || !PASSWORD, "needs E2E_TEST_EMAIL + E2E_TEST_PASSWORD (throwaway Clerk user)");
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="identifier"]').fill(EMAIL!);
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.locator('input[name="password"]').fill(PASSWORD!);
  await page.getByRole("button", { name: /continue/i }).first().click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("dashboard greets and lists stats", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText(/Welcome back/)).toBeVisible();
  await expect(page.getByText("Workouts", { exact: true }).first()).toBeVisible();
});

test("workouts history loads", async ({ page }) => {
  await signIn(page);
  await page.goto("/workouts");
  await expect(page.getByRole("heading", { name: "Workouts" })).toBeVisible();
});

test("export page offers downloads", async ({ page }) => {
  await signIn(page);
  await page.goto("/export");
  await expect(page.getByRole("button", { name: /export json/i })).toBeVisible();
});
