import { test as base, expect } from "@playwright/test";

/** Skip the whole file's tests when Clerk keys are absent (nothing can render). */
export function needsKeys() {
  base.beforeEach(async ({}, testInfo) => {
    testInfo.skip(
      !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      "needs Clerk publishable key",
    );
  });
}

export { expect };
