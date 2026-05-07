import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/design",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "npm run build && npm run start -- --hostname 127.0.0.1 --port 3005",
    url: "http://127.0.0.1:3005",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
