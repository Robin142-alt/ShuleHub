import { expect, test } from "@playwright/test";

import { productionPilotConfig } from "./production-pilot.config";

test("superadmin login page loads without exposing credentials", async ({ page }) => {
  await page.goto("/superadmin/login");

  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByText(/password=|demo|seeded|test account/i)).toHaveCount(0);
});

test("school login page loads as a secure tenant-aware entry", async ({ page }) => {
  await page.goto("/school/login");

  await expect(page.getByRole("heading", { name: /secure admin access/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByText(/demo|example user|seed/i)).toHaveCount(0);
});

test("support status page renders public status content", async ({ page }) => {
  await page.goto("/support/status");

  await expect(page.getByRole("heading", { name: /platform status/i })).toBeVisible();
  await expect(page.getByText(/incidents/i)).toBeVisible();
  await expect(page.getByText(/email updates/i)).toBeVisible();
});

test("support ticket creation route requires an authenticated school session", async ({ page }) => {
  await page.goto("/school/admin/support-new-ticket");

  await expect(page).toHaveURL(/\/school\/login/);
});

test("forgot password request returns a user-safe success state when explicitly enabled", async ({ request }) => {
  test.skip(
    !productionPilotConfig.enableRecoveryRequest || !productionPilotConfig.recoveryEmail,
    "Set E2E_ENABLE_RECOVERY_REQUEST=true and E2E_RECOVERY_EMAIL to exercise the live recovery request.",
  );

  const csrf = await request.get("/api/auth/csrf");
  const csrfPayload = (await csrf.json()) as { csrfToken?: string };
  const response = await request.post("/api/auth/password-recovery/request", {
    headers: {
      "x-csrf-token": csrfPayload.csrfToken ?? "",
    },
    data: {
      audience: "school",
      identifier: productionPilotConfig.recoveryEmail,
      tenantSlug: productionPilotConfig.pilotTenantId || null,
    },
  });
  const payload = (await response.json()) as { message?: string; success?: boolean };

  expect(response.status()).toBeLessThan(500);
  expect(JSON.stringify(payload)).not.toContain(productionPilotConfig.recoveryEmail);
  expect(payload.message ?? "").toMatch(/instructions|temporarily unavailable|eligible/i);
});
