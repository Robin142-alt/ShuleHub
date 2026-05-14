import { createElement } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SchoolPages } from "@/components/school/school-pages";
import { UserManagementPanel } from "@/components/school/user-management-panel";

import { renderWithProviders } from "./test-utils";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    json: async () => body,
  } as Response;
}

describe("school user management", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("submits tenant invitations with CSRF and the backend role_code contract", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-invite-token" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "invite-1",
        kind: "invitation",
        display_name: "Jane Parent",
        email: "jane.parent@example.test",
        role_code: "parent",
        role_name: "Parent",
        status: "invited",
        invitation_sent: true,
      }));

    renderWithProviders(<UserManagementPanel />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/invitations",
        expect.objectContaining({
          method: "GET",
          credentials: "same-origin",
        }),
      ),
    );
    await user.type(screen.getByPlaceholderText(/full name/i), "Jane Parent");
    await user.type(screen.getByPlaceholderText(/name@school\.ac\.ke/i), "jane.parent@example.test");
    await user.selectOptions(screen.getByLabelText(/role/i), "parent");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() =>
      expect(screen.getByText(/invitation queued for delivery/i)).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/auth/invitations",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-shulehub-csrf": "csrf-invite-token",
        }),
        body: JSON.stringify({
          display_name: "Jane Parent",
          email: "jane.parent@example.test",
          role_code: "parent",
        }),
      }),
    );
    expect(screen.getAllByText("Jane Parent").length).toBeGreaterThan(0);
  });

  it("loads live tenant users and supports resend and revoke for pending invitations", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        users: [
          {
            id: "membership-1",
            kind: "member",
            display_name: "Mary Wanjiku",
            email: "principal@example.test",
            role_code: "admin",
            role_name: "School admin",
            status: "active",
          },
          {
            id: "invite-1",
            kind: "invitation",
            display_name: "Jane Parent",
            email: "parent@example.test",
            role_code: "parent",
            role_name: "Parent",
            status: "invited",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-resend-token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "invite-1", invitation_sent: true }))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-revoke-token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "invite-1", status: "revoked" }));

    renderWithProviders(<UserManagementPanel />);

    expect((await screen.findAllByText("Mary Wanjiku")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jane Parent").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: /resend jane parent/i })[0]);
    await waitFor(() =>
      expect(screen.getByText(/invitation resent/i)).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/invitations/invite-1/resend",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-resend-token",
        }),
      }),
    );

    await user.click(screen.getAllByRole("button", { name: /revoke jane parent/i })[0]);
    await waitFor(() =>
      expect(screen.queryByText("Jane Parent")).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/invitations/invite-1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-revoke-token",
        }),
      }),
    );
  });

  it("persists member suspension through the tenant user proxy", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        users: [
          {
            id: "membership-1",
            kind: "member",
            display_name: "Mary Wanjiku",
            email: "principal@example.test",
            role_code: "admin",
            role_name: "School admin",
            status: "active",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-suspend-token" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "membership-1",
        kind: "member",
        display_name: "Mary Wanjiku",
        email: "principal@example.test",
        role_code: "admin",
        role_name: "School admin",
        status: "suspended",
      }));

    renderWithProviders(<UserManagementPanel />);

    expect((await screen.findAllByText("Mary Wanjiku")).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /suspend mary wanjiku/i })[0]);

    await waitFor(() =>
      expect(screen.getByText(/membership updated/i)).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/tenant-users/membership-1/status",
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-shulehub-csrf": "csrf-suspend-token",
        }),
        body: JSON.stringify({ status: "suspended" }),
      }),
    );
    expect(screen.getAllByText("Suspended").length).toBeGreaterThan(0);
  });

  it("persists member role changes through the tenant user proxy", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        users: [
          {
            id: "membership-1",
            kind: "member",
            display_name: "Mary Wanjiku",
            email: "principal@example.test",
            role_code: "admin",
            role_name: "School admin",
            status: "active",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-role-token" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "membership-1",
        kind: "member",
        display_name: "Mary Wanjiku",
        email: "principal@example.test",
        role_code: "teacher",
        role_name: "Teacher",
        status: "active",
      }));

    renderWithProviders(<UserManagementPanel />);

    const roleSelects = await screen.findAllByLabelText(/role for mary wanjiku/i);
    await user.selectOptions(roleSelects[0], "teacher");

    await waitFor(() =>
      expect(screen.getByText(/role updated/i)).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/tenant-users/membership-1/role",
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-shulehub-csrf": "csrf-role-token",
        }),
        body: JSON.stringify({ role_code: "teacher" }),
      }),
    );
    expect(screen.getAllByDisplayValue("Teacher").length).toBeGreaterThan(0);
  });

  it("exposes user invitations from school settings", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [] }));

    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        section: "settings",
        tenantSlug: "barakaacademy",
      }),
    );

    expect(screen.getByRole("heading", { name: /invite user/i })).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/invitations",
        expect.objectContaining({ method: "GET" }),
      ),
    );
  });
});
