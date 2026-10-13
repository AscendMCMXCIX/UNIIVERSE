import { defineConfig } from "@playwright/test";

/*
  Responsive smoke tests against a production build of the app running on an in-memory PGlite
  database with the demo roster (no external services, no Riot key). Three viewports: phone,
  tablet and desktop. Run with `pnpm test:e2e` after `pnpm build`.
*/
const port = Number(process.env.E2E_PORT ?? 3199);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "phone", use: { browserName: "chromium", viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      UNIIVERSE_DB_MODE: "memory",
      UNIIVERSE_SEED_DEMO: "true",
      UNIIVERSE_REQUIRE_AUTH: "false",
      UNIIVERSE_JOB_LOGS: "silent",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: "",
      RIOT_API_KEY: "",
    },
  },
});
