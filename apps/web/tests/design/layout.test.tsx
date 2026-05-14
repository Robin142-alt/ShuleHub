import { screen } from "@testing-library/react";
import { createElement } from "react";

import { PortalPages } from "@/components/portal/portal-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { SuperadminPages } from "@/components/platform/superadmin-pages";

import { renderDashboardScreen, renderWithProviders } from "./test-utils";

describe("STEP 1: Layout tests", () => {
  it("keeps the dashboard information hierarchy in the correct DOM order", () => {
    renderDashboardScreen({ role: "admin" });

    const alertsSection = screen.getByTestId("alerts-section");
    const kpiSection = screen.getByTestId("kpi-section");
    const quickActionsSection = screen.getByTestId("quick-actions-section");
    const coreWidgets = screen.getByTestId("core-widgets");

    expect(
      alertsSection.compareDocumentPosition(kpiSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      kpiSection.compareDocumentPosition(quickActionsSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      quickActionsSection.compareDocumentPosition(coreWidgets) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps quick actions visible in the dashboard shell", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getByTestId("quick-actions")).toBeVisible();
    expect(screen.getAllByTestId("quick-action").length).toBeGreaterThan(0);
  });

  it("matches the dashboard regression snapshots", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getByTestId("dashboard-view")).toMatchSnapshot();
    expect(screen.queryByTestId("alerts-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-strip")).toMatchSnapshot();
  });

  it("does not reuse the same shell across platform, school, and portal experiences", () => {
    const firstRender = renderWithProviders(createElement(SuperadminPages));
    expect(screen.getByText(/platform owner workspace/i)).toBeVisible();

    firstRender.unmount();
    const secondRender = renderWithProviders(
      createElement(SchoolPages, { role: "bursar" }),
    );
    expect(screen.getByText(/school workspace school erp/i)).toBeVisible();

    secondRender.unmount();
    renderWithProviders(createElement(PortalPages, { viewer: "parent" }));
    expect(screen.getByText(/shulehub portal/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: /family dashboard/i })).toBeVisible();
  });
});
