import { screen } from "@testing-library/react";

import { renderDashboardScreen } from "./test-utils";

describe("STEP 3: Density tests", () => {
  it("caps KPI cards, widgets, charts, and activity feed density", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getAllByTestId("kpi-card").length).toBeLessThanOrEqual(5);
    expect(screen.getAllByTestId("core-widget").length).toBeLessThanOrEqual(3);
    expect(screen.getAllByRole("table").length).toBeLessThanOrEqual(1);
    expect(screen.getAllByTestId("quick-action").length).toBeLessThanOrEqual(4);
    expect(screen.queryAllByTestId("context-chart").length).toBe(0);
    expect(screen.getAllByTestId("activity-item").length).toBeLessThanOrEqual(10);
  });

  it("keeps alert density focused on the first action layer", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getAllByTestId("alert-card").length).toBeLessThanOrEqual(4);
  });
});
