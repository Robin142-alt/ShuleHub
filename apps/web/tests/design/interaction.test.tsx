import { screen, within } from "@testing-library/react";
import { createElement } from "react";
import userEvent from "@testing-library/user-event";

import { PortalPages } from "@/components/portal/portal-pages";

import { routerPushMock } from "./router-mock";
import { renderDashboardScreen, renderWithProviders } from "./test-utils";

describe("STEP 5: Interaction tests", () => {
  it("gives KPI cards direct one-click detail navigation", () => {
    renderDashboardScreen({ role: "admin" });

    expect(
      screen.getByRole("link", { name: /fees collected today/i }),
    ).toHaveAttribute("href", "/dashboard/admin/finance");
    expect(screen.getByRole("link", { name: /students with balance/i })).toHaveAttribute(
      "href",
      "/dashboard/admin/students",
    );
  });

  it("routes alerts into their resolution flows", () => {
    renderDashboardScreen({ role: "admin" });

    expect(
      screen.getByRole("link", { name: /outstanding fees need follow-up/i }),
    ).toHaveAttribute("href", "/dashboard/admin/finance");
  });

  it("executes quick actions in one click", async () => {
    const user = userEvent.setup();
    const { onAction } = renderDashboardScreen({ role: "admin" });

    await user.click(screen.getByRole("button", { name: /add student/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard/admin/students");
  });

  it("supports searchable navigation from the topbar", async () => {
    const user = userEvent.setup();
    renderDashboardScreen({ role: "admin" });

    await user.click(screen.getByLabelText("Global search"));
    await user.type(screen.getByLabelText("Global search"), "mpesa");
    const searchPanel = await screen.findByTestId("search-panel");
    const mpesaResult = await within(searchPanel).findByRole("button", {
      name: /m-pesa payments/i,
    });

    await user.click(mpesaResult);

    expect(routerPushMock).toHaveBeenCalledWith("/dashboard/admin/mpesa");
  });

  it("supports instant learner search for admissions by parent phone", async () => {
    const user = userEvent.setup();
    renderDashboardScreen({ role: "admissions" });

    await user.click(screen.getByLabelText("Global search"));
    await user.type(screen.getByLabelText("Global search"), "300401");
    const searchPanel = await screen.findByTestId("search-panel");
    const learnerResult = await within(searchPanel).findByRole("button", {
      name: /brenda atieno/i,
    });

    await user.click(learnerResult);

    expect(routerPushMock).toHaveBeenCalledWith(
      "/dashboard/admissions/admissions?view=student-directory&student=stu-001",
    );
  });

  it("keeps keyboard navigation working across primary controls", async () => {
    const user = userEvent.setup();
    renderDashboardScreen({ role: "admin" });

    const searchInput = screen.getByLabelText("Global search");
    const termSelector = screen.getByLabelText("Select term");
    const yearSelector = screen.getByLabelText("Select academic year");
    const tenantSelector = screen.getByLabelText("Switch tenant");
    const syncButton = screen.getByRole("button", {
      name: /current sync status/i,
    });
    const notificationsButton = screen.getByRole("button", {
      name: /open notifications/i,
    });

    await user.click(searchInput);
    expect(searchInput).toHaveFocus();

    await user.tab();
    expect(termSelector).toHaveFocus();

    await user.tab();
    expect(yearSelector).toHaveFocus();

    await user.tab();
    expect(tenantSelector).toHaveFocus();

    await user.tab();
    expect(syncButton).toHaveFocus();

    await user.tab();
    expect(notificationsButton).toHaveFocus();
  });

  it("keeps the portal focused on self-service sections without school admin actions", () => {
    renderWithProviders(createElement(PortalPages, { viewer: "parent" }));

    expect(screen.getByRole("heading", { name: /recent payments/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /^fees$/i })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /record payment/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/tenant control/i)).not.toBeInTheDocument();
  });
});
