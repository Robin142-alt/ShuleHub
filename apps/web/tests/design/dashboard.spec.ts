import { expect, test, type Page } from "@playwright/test";

import {
  PORTAL_SESSION_COOKIE,
  SCHOOL_SESSION_COOKIE,
  serializeExperienceSession,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";

async function seedExperienceSession(
  page: Page,
  cookie: {
    name: string;
    value: string;
    url: string;
  },
) {
  await page.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      url: cookie.url,
    },
  ]);
}

test.describe("experience dashboard quality", () => {
  test("legacy dashboard routes redirect into the retired-route recovery page", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:3005/dashboard/admin");

    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(
      page.getByRole("heading", { name: /this route is no longer available/i }),
    ).toBeVisible();
  });

  test("school dashboard keeps KPIs and actions above operational tables", async ({
    page,
  }) => {
    await seedExperienceSession(page, {
      name: SCHOOL_SESSION_COOKIE,
      value: serializeExperienceSession({
        experience: "school",
        homePath: "/dashboard",
        role: "bursar",
        tenantSlug: "barakaacademy",
        userLabel: "Bursar",
      }),
      url: "http://barakaacademy.localhost:3005",
    });

    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto("http://barakaacademy.localhost:3005/dashboard");

    const kpiLabel = page.getByText(/today's collections/i).first();
    const recordPaymentAction = page.getByRole("link", {
      name: /record payment/i,
    }).first();
    const mpesaHeading = page.getByRole("heading", {
      name: /mpesa transactions/i,
    });
    const activityHeading = page.getByText(/recent activity/i).first();

    await expect(kpiLabel).toBeVisible();
    await expect(recordPaymentAction).toBeVisible();
    await expect(mpesaHeading).toBeVisible();
    await expect(activityHeading).toBeVisible();

    const kpiBox = await kpiLabel.boundingBox();
    const actionBox = await recordPaymentAction.boundingBox();
    const mpesaBox = await mpesaHeading.boundingBox();
    const activityBox = await activityHeading.boundingBox();

    expect(kpiBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(mpesaBox).not.toBeNull();
    expect(activityBox).not.toBeNull();

    expect(kpiBox!.y).toBeLessThan(actionBox!.y);
    expect(actionBox!.y).toBeLessThan(mpesaBox!.y);
    expect(mpesaBox!.y).toBeLessThan(activityBox!.y);
    expect(kpiBox!.y + kpiBox!.height).toBeLessThanOrEqual(1400);

    await recordPaymentAction.click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(
      page.getByRole("heading", { name: /collections workspace/i }),
    ).toBeVisible();
  });

  test("superadmin and portal dashboards stay operationally separated", async ({
    page,
  }) => {
    await seedExperienceSession(page, {
      name: SUPERADMIN_SESSION_COOKIE,
      value: serializeExperienceSession({
        experience: "superadmin",
        homePath: "/dashboard",
        userLabel: "Platform owner",
      }),
      url: "http://superadmin.localhost:3005",
    });

    await page.goto("http://superadmin.localhost:3005/dashboard");
    await expect(
      page.getByRole("heading", { name: /platform owner dashboard/i }),
    ).toBeVisible();
    await expect(page.getByText(/tenant watchlist/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /record payment/i }),
    ).toHaveCount(0);

    await seedExperienceSession(page, {
      name: PORTAL_SESSION_COOKIE,
      value: serializeExperienceSession({
        experience: "portal",
        homePath: "/dashboard",
        viewer: "parent",
        userLabel: "Parent",
      }),
      url: "http://portal.localhost:3005",
    });

    await page.goto("http://portal.localhost:3005/dashboard");
    await expect(
      page.getByRole("heading", { name: /family dashboard/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /recent payments/i }),
    ).toBeVisible();
    await expect(page.getByText(/platform owner workspace/i)).toHaveCount(0);
    await expect(page.getByText(/tenant watchlist/i)).toHaveCount(0);
  });
});
