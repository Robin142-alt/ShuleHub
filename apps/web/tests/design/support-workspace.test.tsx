import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { SuperadminPages } from "@/components/platform/superadmin-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { StorekeeperWorkspace } from "@/components/storekeeper/storekeeper-workspace";
import {
  adminSupportSidebarItems,
  supportSidebarItems,
} from "@/lib/support/support-data";

import { renderWithProviders } from "./test-utils";

jest.setTimeout(20_000);

describe("enterprise support workspace", () => {
  it("exposes the required school and admin support sidebar modules", () => {
    expect(supportSidebarItems.map((item) => item.label)).toEqual([
      "New Ticket",
      "My Tickets",
      "Knowledge Base",
      "System Status",
    ]);

    expect(adminSupportSidebarItems.map((item) => item.label)).toEqual([
      "All Tickets",
      "Open",
      "In Progress",
      "Escalated",
      "Resolved",
      "SLA Monitoring",
      "Support Analytics",
    ]);
  });

  it("keeps Support Center reachable from the dedicated storekeeper workspace", () => {
    renderWithProviders(createElement(StorekeeperWorkspace, { section: "dashboard" }));

    expect(screen.getByRole("link", { name: /new ticket/i })).toHaveAttribute(
      "href",
      "/school/storekeeper/support-new-ticket",
    );
    expect(screen.getByRole("link", { name: /system status/i })).toHaveAttribute(
      "href",
      "/school/storekeeper/support-system-status",
    );
  });

  it("lets a school create and track a critical support ticket with captured context", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        tenantSlug: "barakaacademy",
        section: "support-new-ticket",
      }),
    );

    expect(screen.getByRole("heading", { name: /support center/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /new ticket/i })).toHaveAttribute(
      "href",
      "/support-new-ticket",
    );

    fireEvent.change(screen.getByLabelText(/ticket subject/i), {
      target: { value: "MPESA receipts not matching learners" },
    });
    await user.selectOptions(screen.getByLabelText(/category/i), "MPESA");
    await user.selectOptions(screen.getByLabelText(/priority/i), "Critical");
    await user.selectOptions(screen.getByLabelText(/module affected/i), "MPESA");
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Parents are paying but callbacks remain unmatched in the finance workspace." },
    });
    await user.upload(
      screen.getByLabelText(/attachments/i),
      new File(["callback log"], "mpesa-callback.log", { type: "text/plain" }),
    );
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/ticket sup-2026-/i)).toBeVisible();
    expect(screen.getAllByText(/Escalated/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Chrome/i)).toBeVisible();
    expect(screen.getByText(/tenant\/barakaacademy\/support\//i)).toBeVisible();
  });

  it("gives support agents a global queue with replies, escalation, internal notes, SLA, and analytics", async () => {
    const user = userEvent.setup();

    renderWithProviders(createElement(SuperadminPages, { section: "support" }));

    expect(screen.getByRole("heading", { name: /support command center/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sla monitoring/i })).toHaveAttribute(
      "href",
      "/support-sla",
    );
    expect(screen.getAllByText(/SLA breach risk/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recurring MPESA callback failures/i)).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: /open sup-2026-000145/i })[0]!);

    const dialog = await screen.findByRole("dialog", { name: /support ticket/i });
    expect(within(dialog).getByText(/Internal notes/i)).toBeVisible();
    expect(within(dialog).getByText(/Bug confirmed. Deploying fix tonight./i)).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText(/support reply/i), {
      target: { value: "We have patched the callback worker and are replaying unmatched receipts." },
    });
    await user.click(within(dialog).getByRole("button", { name: /send reply/i }));

    expect(
      await within(dialog).findByText(/patched the callback worker/i),
    ).toBeVisible();
    expect(screen.getAllByText(/Waiting for School/i).length).toBeGreaterThan(0);
  });
});
