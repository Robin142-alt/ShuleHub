import { screen } from "@testing-library/react";
import { createElement } from "react";

import { SchoolPages } from "@/components/school/school-pages";

import { renderDashboardScreen, renderWithProviders } from "./test-utils";

describe("STEP 4: Role tests", () => {
  it("shows finance and all core widgets for admin", () => {
    renderDashboardScreen({ role: "admin" });

    expect(screen.getByRole("link", { name: /fees collected today/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /m-pesa feed/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /add student/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /record payment/i })).toBeVisible();
  });

  it("keeps teacher dashboard free of inactive academics, communication, attendance, and finance controls", () => {
    renderDashboardScreen({ role: "teacher" });

    expect(screen.queryByRole("link", { name: /class planner/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send sms/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open academics/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /attendance today/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark attendance/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /record payment/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /m-pesa feed/i })).not.toBeInTheDocument();
  });

  it("keeps parent layout focused on child-facing information and blocks admin controls", () => {
    renderDashboardScreen({ role: "parent" });

    expect(screen.getByRole("link", { name: /current balance/i })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /view child summary/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /add student/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /record payment/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /m-pesa feed/i })).not.toBeInTheDocument();
  });

  it("shows inventory workflows for the storekeeper role", () => {
    renderDashboardScreen({ role: "storekeeper" });

    expect(screen.getByRole("link", { name: /inventory/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /adjust stock/i })).toBeVisible();
    expect(screen.getByText(/low stock alerts/i)).toBeVisible();
  });

  it("shows admissions workflows for the admissions role", () => {
    renderDashboardScreen({ role: "admissions" });

    expect(screen.getByRole("link", { name: /admissions/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /new registration/i })).toBeVisible();
    expect(screen.getByPlaceholderText(/search students, payments, or modules/i)).toBeVisible();
  });

  it("shows finance visibility for bursar without exposing superadmin modules", () => {
    renderWithProviders(createElement(SchoolPages, { role: "bursar" }));

    expect(screen.getByRole("heading", { name: /mpesa transactions/i })).toBeVisible();
    expect(screen.queryByText(/tenant control/i)).not.toBeInTheDocument();
  });

  it("opens a public storekeeper school workspace with inventory navigation", () => {
    renderWithProviders(createElement(SchoolPages, { role: "storekeeper" }));

    expect(screen.getAllByText(/Storekeeper/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Inventory/i })).toHaveAttribute(
      "href",
      "/inventory",
    );
  });

  it("opens a public admissions school workspace with admissions navigation", () => {
    renderWithProviders(createElement(SchoolPages, { role: "admissions" }));

    expect(screen.getByText(/Admissions officer/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Admissions/i })).toHaveAttribute(
      "href",
      "/admissions",
    );
  });

  it("opens a public librarian school workspace with library-only navigation", () => {
    renderWithProviders(createElement(SchoolPages, { role: "librarian" }));

    expect(screen.getByText(/Librarian/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Library/i })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.queryByRole("link", { name: /Finance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
  });
});
