import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PublicSchoolLoginView } from "@/components/auth/public-school-login-view";
import { ForgotPasswordView } from "@/components/auth/auth-recovery-view";
import { VerifyEmailView } from "@/components/auth/email-verification-view";
import { PortalLoginView } from "@/components/auth/portal-login-view";
import { SchoolLoginView } from "@/components/auth/school-login-view";
import { SuperadminLoginView } from "@/components/auth/superadmin-login-view";
import { resolveSchoolBranding } from "@/lib/auth/school-branding";

import { routerPushMock } from "./router-mock";
import { renderWithProviders } from "./test-utils";

jest.setTimeout(15_000);

describe("enterprise authentication flows", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function mockSecureLogin(payload: unknown) {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "csrf-test-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => payload,
      });
  }

  test("does not expose super admin credentials and submits the real secure login", async () => {
    const user = userEvent.setup();

    mockSecureLogin({
        redirectTo: "/superadmin",
        session: {
          audience: "superadmin",
          homePath: "/superadmin",
          userLabel: "Platform owner",
        },
    });

    renderWithProviders(<SuperadminLoginView />);

    expect(screen.getByText(/welcome back/i)).toBeVisible();
    expect(screen.queryByText(/system\.owner@example\.invalid/i)).toBeNull();
    expect(screen.queryByText(/managed-by-vault/i)).toBeNull();

    await user.type(screen.getByLabelText(/^email$/i), "system.owner@example.invalid");
    await user.type(
      screen.getByLabelText(/^password$/i),
      "managed-by-vault",
    );
    await user.click(
      screen.getByRole("button", { name: /continue securely/i }),
    );

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/superadmin"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-test-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        body: expect.not.stringContaining("verificationCode"),
      }),
    );
  });

  test("does not expose school staff credentials and routes bursar access", async () => {
    const user = userEvent.setup();

    mockSecureLogin({
        redirectTo: "/school/bursar",
        session: {
          audience: "school",
          homePath: "/school/bursar",
          role: "bursar",
          tenantSlug: "school-alpha",
          userLabel: "finance.admin@example.invalid",
        },
    });

    renderWithProviders(
      <SchoolLoginView
        resolution={resolveSchoolBranding("school-alpha.app.com")}
      />,
    );

    expect(screen.getByText(/secure admin access/i)).toBeVisible();
    expect(screen.queryByText(/finance\.admin@example\.invalid/i)).toBeNull();
    expect(screen.queryByText(/managed-by-vault/i)).toBeNull();

    await user.type(
      screen.getByLabelText(/work email address/i),
      "finance.admin@example.invalid",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "managed-by-vault",
    );
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/school/bursar"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-test-token",
        }),
      }),
    );
  });

  test("does not expose portal credentials and signs a student in", async () => {
    const user = userEvent.setup();

    mockSecureLogin({
        redirectTo: "/portal/student",
        session: {
          audience: "portal",
          homePath: "/portal/student",
          viewer: "student",
          userLabel: "student@example.invalid",
        },
    });

    renderWithProviders(<PortalLoginView />);

    expect(screen.getByText(/access your school portal/i)).toBeVisible();
    expect(screen.queryByText(/student@example\.invalid/i)).toBeNull();
    expect(screen.queryByText(/managed-by-vault/i)).toBeNull();

    await user.type(
      screen.getByLabelText(/portal email address/i),
      "student@example.invalid",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "managed-by-vault",
    );
    await user.click(screen.getByRole("button", { name: /open portal/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/portal/student"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-test-token",
        }),
      }),
    );
  });

  test("lets the public entry experience route a school user without exposing chooser cards", async () => {
    const user = userEvent.setup();

    mockSecureLogin({
        redirectTo: "/school/bursar",
        session: {
          audience: "school",
          homePath: "/school/bursar",
          role: "bursar",
          tenantSlug: "school-alpha",
          userLabel: "finance.admin@example.invalid",
        },
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
      screen.getByLabelText(/school code or workspace/i),
      "school-alpha",
    );
    await user.type(
      screen.getByLabelText(/work email address/i),
      "finance.admin@example.invalid",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "managed-by-vault",
    );
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/school/bursar"),
    );
  });

  test("forgot password submits a CSRF-protected recovery request", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "csrf-test-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: "If the account is eligible, password recovery instructions have been sent.",
        }),
      });

    renderWithProviders(
      <ForgotPasswordView
        title="Recover platform access"
        subtitle="Enter your platform email."
        identifierLabel="Work email"
        identifierPlaceholder="Enter your work email"
        submitLabel="Send recovery link"
        backHref="/superadmin/login"
        successMessage="If the account is eligible, password recovery instructions have been sent."
        audience="superadmin"
      />,
    );

    await user.type(screen.getByLabelText(/work email/i), "owner@example.invalid");
    await user.click(screen.getByRole("button", { name: /send recovery link/i }));

    await screen.findByText(/check your messages/i);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/password-recovery/request",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-test-token",
        }),
        body: JSON.stringify({
          audience: "superadmin",
          identifier: "owner@example.invalid",
          tenantSlug: null,
        }),
      }),
    );
  });

  test("forgot password requires an email address before calling recovery", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ForgotPasswordView
        title="Recover platform access"
        subtitle="Enter your verified email."
        identifierLabel="Email address"
        identifierPlaceholder="Enter your email address"
        submitLabel="Send recovery link"
        backHref="/superadmin/login"
        successMessage="If the account is eligible, password recovery instructions have been sent."
        audience="superadmin"
      />,
    );

    await user.type(screen.getByLabelText(/email address/i), "0712345678");
    await user.click(screen.getByRole("button", { name: /send recovery link/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("verify email consumes link tokens through the secure proxy", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "csrf-email-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: "Email verified successfully.",
        }),
      });

    renderWithProviders(<VerifyEmailView initialToken="email-link-token" />);

    await screen.findByRole("status");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/email-verification/verify",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-email-token",
        }),
        body: JSON.stringify({
          token: "email-link-token",
        }),
      }),
    );
  });

  test("school login requires an email address before calling authentication", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <SchoolLoginView
        resolution={resolveSchoolBranding("school-alpha.app.com")}
      />,
    );

    await user.type(screen.getByLabelText(/work email address/i), "0712345678");
    await user.type(screen.getByLabelText(/^password$/i), "managed-by-vault");
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    expect(await screen.findByText(/enter a valid work email address/i)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
