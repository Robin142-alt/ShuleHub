import { defineConfig, devices } from "@playwright/test";

export const productionPilotConfig = {
  webBaseUrl: readUrl("E2E_WEB_BASE_URL", "http://127.0.0.1:3005"),
  apiBaseUrl: readOptionalUrl("E2E_API_BASE_URL"),
  platformOwnerEmail: process.env.E2E_PLATFORM_OWNER_EMAIL ?? "",
  platformOwnerPassword: process.env.E2E_PLATFORM_OWNER_PASSWORD ?? "",
  pilotSchoolAdminEmail: process.env.E2E_PILOT_SCHOOL_ADMIN_EMAIL ?? "",
  pilotTenantId: process.env.E2E_PILOT_TENANT_ID ?? "",
  recoveryEmail: process.env.E2E_RECOVERY_EMAIL ?? "",
  enableRecoveryRequest: process.env.E2E_ENABLE_RECOVERY_REQUEST === "true",
};

export default defineConfig({
  testDir: ".",
  testMatch: /production-pilot\.spec\.ts/,
  timeout: 30_000,
  use: {
    baseURL: productionPilotConfig.webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

function readUrl(key: string, fallback: string): string {
  const value = process.env[key]?.trim() || fallback;
  const parsed = new URL(value);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must be an HTTP(S) URL.`);
  }

  return value.replace(/\/+$/, "");
}

function readOptionalUrl(key: string): string {
  const value = process.env[key]?.trim();

  if (!value) {
    return "";
  }

  return readUrl(key, value);
}
