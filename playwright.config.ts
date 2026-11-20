import { defineConfig, devices } from "@playwright/test";

const PORT = 3211;
export const E2E_DB_PORT = 54331;
export const E2E_SECRET = "e2e-only-secret-e2e-only-secret-e2e-only-secret-000";

// End-to-end tests run a production build against their own throwaway
// Postgres (started in tests/e2e/global-setup.ts), on a phone-sized screen.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    ...devices["Pixel 5"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/ptm`,
      SESSION_SECRET: E2E_SECRET,
      SETUP_TOKEN: "e2e-setup",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
