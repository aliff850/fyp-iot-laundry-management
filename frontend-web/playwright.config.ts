import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testMatch: "**/auth.spec.ts", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile", testMatch: "**/auth.spec.ts", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium", channel: "chrome" } },
    { name: "unconfigured", testMatch: "**/unconfigured.spec.ts", use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://localhost:3101" } },
  ],
  webServer: [{
    command: "npm run dev -- --hostname localhost --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SPINSENSE_E2E_VARIANT: "configured",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:9",
    },
  }, {
    command: "npm run dev -- --hostname localhost --port 3101",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SPINSENSE_E2E_VARIANT: "unconfigured",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3101",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:9",
    },
  }],
});
