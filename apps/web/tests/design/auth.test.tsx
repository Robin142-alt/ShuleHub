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

describe("production authentication surfaces", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test("does not advertise super admin demo credentials and signs in with a valid platform account", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/superadmin/dashboard",
        session: {
          audience: "superadmin",
          homePath: "/superadmin/dashboard",
          userLabel: "Platform owner",
        },
      }),
    });

    renderWithProviders(<SuperadminLoginView />);

    expect(screen.queryByText(/review access/i)).toBeNull();
    expect(screen.queryByText(/Platform#2026/i)).toBeNull();
    expect(screen.queryByText(/246810/i)).toBeNull();

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
      expect(routerPushMock).toHaveBeenCalledWith("/superadmin/dashboard"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("does not advertise school review credentials and routes bursar access to finance", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/finance/dashboard",
        session: {
          audience: "school",
          homePath: "/finance/dashboard",
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

    expect(screen.queryByText(/review staff access/i)).toBeNull();
    expect(screen.queryByText(/School#2026/i)).toBeNull();

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
      expect(routerPushMock).toHaveBeenCalledWith("/finance/dashboard"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("keeps school role credentials off-screen while still routing authenticated storekeepers", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/inventory/dashboard",
        session: {
          audience: "school",
          homePath: "/inventory/dashboard",
          role: "storekeeper",
          tenantSlug: "amani-prep",
          userLabel: "storekeeper@amaniprep.ac.ke",
        },
      }),
    });

    renderWithProviders(
      <SchoolLoginView
        resolution={resolveSchoolBranding("barakaacademy.app.com")}
      />,
    );

    expect(screen.queryByText(/principal@amaniprep\.ac\.ke/i)).toBeNull();
    expect(screen.queryByText(/storekeeper@amaniprep\.ac\.ke/i)).toBeNull();
    expect(screen.queryByText(/School#2026/i)).toBeNull();

    await user.type(
      screen.getByLabelText(/email or phone number/i),
      "storekeeper@amaniprep.ac.ke",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "School#2026",
    );
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/inventory/dashboard"),
    );
  });

  test("does not advertise portal demo credentials and signs a student into the portal dashboard", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/portal/dashboard",
        session: {
          audience: "portal",
          homePath: "/portal/dashboard",
          viewer: "student",
          userLabel: "SH-24011",
        },
      }),
    });

    renderWithProviders(<PortalLoginView />);

    expect(screen.queryByText(/review portal access/i)).toBeNull();
    expect(screen.queryByText(/Portal#2026/i)).toBeNull();

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
      expect(routerPushMock).toHaveBeenCalledWith("/portal/dashboard"),
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
        redirectTo: "/finance/dashboard",
        session: {
          audience: "school",
          homePath: "/finance/dashboard",
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
      expect(routerPushMock).toHaveBeenCalledWith("/finance/dashboard"),
    );
  });
});
