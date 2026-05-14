import { screen } from "@testing-library/react";
import { createElement } from "react";

import { PortalPages } from "@/components/portal/portal-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { SuperadminPages } from "@/components/platform/superadmin-pages";

import { renderWithProviders } from "./test-utils";

describe("experience shells", () => {
  it("keeps platform, school, and portal navigation visibly separated", () => {
    const platformRender = renderWithProviders(createElement(SuperadminPages));
    expect(screen.getByText(/platform owner workspace/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /^schools \/ tenants$/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /^students$/i })).toBeNull();

    platformRender.unmount();

    const schoolRender = renderWithProviders(
      createElement(SchoolPages, { role: "bursar" }),
    );
    expect(screen.getByText(/school workspace school erp/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /^students$/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /^support$/i })).toBeNull();

    schoolRender.unmount();

    renderWithProviders(createElement(PortalPages, { viewer: "parent" }));
    expect(
      screen.getByRole("heading", { name: /family dashboard/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /^fees$/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /^inventory$/i })).toBeNull();
  });
});
