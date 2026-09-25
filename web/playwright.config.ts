import { defineConfig, devices } from "@playwright/test";

/**
 * Web E2E. Unauthenticated specs need Clerk publishable + Supabase anon keys
 * (public-safe, commit nothing — pass via env). Authenticated specs additionally
 * need E2E_TEST_EMAIL + E2E_TEST_PASSWORD (a throwaway Clerk user) and skip
 * otherwise, so CI without secrets still runs the public suite.
 */
const PORT = Number(process.env.E2E_PORT ?? 3110);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
