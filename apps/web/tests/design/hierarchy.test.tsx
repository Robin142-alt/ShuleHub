import { screen, within } from "@testing-library/react";

import { renderDashboardScreen } from "./test-utils";

describe("STEP 2: Hierarchy tests", () => {
  it("keeps the empty alert section and KPI strip ordered at the top of the dashboard", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getByTestId("alerts-section")).toBeInTheDocument();
    expect(screen.queryByTestId("alerts-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-strip")).toBeVisible();
    expect(screen.getByTestId("quick-actions")).toBeVisible();
  });

  it("keeps dashboard tables limited to the most actionable finance views", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.queryAllByRole("table").length).toBeLessThanOrEqual(1);
  });

  it("preserves visual emphasis for KPIs and primary widgets", () => {
    renderDashboardScreen({ role: "admin" });

    const firstKpiValue = screen.getAllByTestId("kpi-value")[0];
    const mpesaHeading = within(screen.getByTestId("core-widgets")).getByRole(
      "heading",
      { name: /m-pesa feed/i },
    );
    const defaultersHeading = screen.getByRole("heading", {
      name: /students with balances/i,
    });

    expect(firstKpiValue.className).toContain("text-[1.875rem]");
    expect(screen.queryAllByTestId("alert-card")).toHaveLength(0);
    expect(mpesaHeading.className).toContain("text-lg");
    expect(defaultersHeading.className).toContain("text-lg");
  });

  it("keeps critical labels readable and accessible", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getByLabelText("Switch tenant")).toBeVisible();
    expect(screen.getByLabelText("Select term")).toBeVisible();
    expect(screen.getByLabelText("Select academic year")).toBeVisible();
    expect(screen.getByLabelText("Global search")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /current sync status/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /open notifications/i }),
    ).toBeVisible();
  });
});
