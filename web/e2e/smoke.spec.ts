import { test } from "@playwright/test";

import { expect, needsKeys } from "./helpers";

needsKeys();

test("signed-out root redirects to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/sign-in/);
});

test("sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Sign in with the same account as the mobile app.")).toBeVisible();
});

test("unknown route shows not-found", async ({ page }) => {
  await page.goto("/sign-in");
  await page.goto("/no-such-route-xyz");
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();
});
