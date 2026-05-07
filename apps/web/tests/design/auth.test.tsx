import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PublicSchoolLoginView } from "@/components/auth/public-school-login-view";
import { PortalLoginView } from "@/components/auth/portal-login-view";
import { SchoolLoginView } from "@/components/auth/school-login-view";
import { SuperadminLoginView } from "@/components/auth/superadmin-login-view";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

import { routerPushMock } from "./router-mock";
import { renderWithProviders } from "./test-utils";

jest.setTimeout(15_000);

describe("auth review credentials", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test("shows super admin review credentials and signs in with the documented password", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/superadmin",
        session: {
          audience: "superadmin",
          homePath: "/superadmin",
          userLabel: "Platform owner",
        },
      }),
    });

    renderWithProviders(<SuperadminLoginView />);

    expect(screen.getByText(/review access/i)).toBeVisible();
    expect(screen.getByText(/owner@shulehub\.com/i)).toBeVisible();
    expect(screen.getByText(/Platform#2026/i)).toBeVisible();
    expect(screen.getByText(/246810/i)).toBeVisible();

    await user.type(screen.getByLabelText(/^email$/i), "owner@shulehub.com");
    await user.type(
      screen.getByLabelText(/^password$/i),
      "Platform#2026",
    );
    await user.click(
      screen.getByRole("button", { name: /continue securely/i }),
    );

    await screen.findByText(/credentials confirmed/i);

    await user.type(
      screen.getByLabelText(/6-digit verification code/i),
      "246810",
    );
    await user.click(
      screen.getByRole("button", { name: /verify and continue/i }),
    );

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/superadmin"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("shows school staff review credentials and routes bursar access from the documented password", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/school/bursar",
        session: {
          audience: "school",
          homePath: "/school/bursar",
          role: "bursar",
          tenantSlug: "barakaacademy",
          userLabel: "bursar@barakaacademy.sch.ke",
        },
      }),
    });

    renderWithProviders(
      <SchoolLoginView
        resolution={resolveSchoolBranding("barakaacademy.app.com")}
      />,
    );

    expect(screen.getByText(/review staff access/i)).toBeVisible();
    expect(screen.getByText(/bursar@barakaacademy\.sch\.ke/i)).toBeVisible();
    expect(screen.getAllByText(/School#2026/i).length).toBeGreaterThan(0);

    await user.type(
      screen.getByLabelText(/email or phone number/i),
      "bursar@barakaacademy.sch.ke",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "School#2026",
    );
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/school/bursar"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("shows parent and student review credentials and signs a student in with the documented password", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/portal/student",
        session: {
          audience: "portal",
          homePath: "/portal/student",
          viewer: "student",
          userLabel: "SH-24011",
        },
      }),
    });

    renderWithProviders(<PortalLoginView />);

    expect(screen.getByText(/review portal access/i)).toBeVisible();
    expect(screen.getByText(/SH-24011/i)).toBeVisible();
    expect(screen.getAllByText(/Portal#2026/i).length).toBeGreaterThan(0);

    await user.type(
      screen.getByLabelText(/admission number or phone/i),
      "SH-24011",
    );
    await user.type(
      screen.getByLabelText(/password or pin/i),
      "Portal#2026",
    );
    await user.click(screen.getByRole("button", { name: /open portal/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/portal/student"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("lets the public entry experience route a school user without exposing chooser cards", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/school/bursar",
        session: {
          audience: "school",
          homePath: "/school/bursar",
          role: "bursar",
          tenantSlug: "baraka-academy",
          userLabel: "bursar@barakaacademy.sch.ke",
        },
      }),
    });

    renderWithProviders(<PublicSchoolLoginView />);

    expect(
      screen.getByRole("heading", {
        name: /sign in to your school operations workspace/i,
      }),
    ).toBeVisible();
    expect(screen.queryByText(/one premium platform/i)).toBeNull();
    expect(screen.queryByText(/enter workspace/i)).toBeNull();

    await user.type(
      screen.getByLabelText(/school web address or code/i),
      "barakaacademy",
    );
    await user.type(
      screen.getByLabelText(/work email or phone number/i),
      "bursar@barakaacademy.sch.ke",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "School#2026",
    );
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/school/bursar"),
    );
  });
});
