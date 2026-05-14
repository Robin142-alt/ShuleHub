import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { SuperadminPages } from "@/components/platform/superadmin-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { StorekeeperWorkspace } from "@/components/storekeeper/storekeeper-workspace";
import {
  adminSupportSidebarItems,
  supportSidebarItems,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/support/support-data";

import { renderWithProviders } from "./test-utils";

const mockAddSupportInternalNoteLive = jest.fn();
const mockCreateSupportTicketLive = jest.fn();
const mockEscalateSupportTicketLive = jest.fn();
const mockFetchKnowledgeBaseLive = jest.fn();
const mockFetchSupportNotificationDeadLettersLive = jest.fn();
const mockFetchSupportAnalyticsLive = jest.fn();
const mockFetchSupportCategoriesLive = jest.fn();
const mockFetchSupportTicketDetailLive = jest.fn();
const mockFetchSupportTicketsLive = jest.fn();
const mockFetchSystemStatusLive = jest.fn();
const mockMergeSupportTicketLive = jest.fn();
const mockReplyToSupportTicketLive = jest.fn();
const mockUpdateSupportTicketStatusLive = jest.fn();
const mockUploadSupportAttachmentLive = jest.fn();

jest.mock("@/lib/dashboard/api-client", () => ({
  isDashboardApiConfigured: () => true,
}));

jest.mock("@/lib/support/support-live", () => ({
  addSupportInternalNoteLive: (...args: unknown[]) => mockAddSupportInternalNoteLive(...args),
  createSupportTicketLive: (...args: unknown[]) => mockCreateSupportTicketLive(...args),
  escalateSupportTicketLive: (...args: unknown[]) => mockEscalateSupportTicketLive(...args),
  fetchKnowledgeBaseLive: (...args: unknown[]) => mockFetchKnowledgeBaseLive(...args),
  fetchSupportNotificationDeadLettersLive: (...args: unknown[]) => mockFetchSupportNotificationDeadLettersLive(...args),
  fetchSupportAnalyticsLive: (...args: unknown[]) => mockFetchSupportAnalyticsLive(...args),
  fetchSupportCategoriesLive: (...args: unknown[]) => mockFetchSupportCategoriesLive(...args),
  fetchSupportTicketDetailLive: (...args: unknown[]) => mockFetchSupportTicketDetailLive(...args),
  fetchSupportTicketsLive: (...args: unknown[]) => mockFetchSupportTicketsLive(...args),
  fetchSystemStatusLive: (...args: unknown[]) => mockFetchSystemStatusLive(...args),
  mergeSupportTicketLive: (...args: unknown[]) => mockMergeSupportTicketLive(...args),
  replyToSupportTicketLive: (...args: unknown[]) => mockReplyToSupportTicketLive(...args),
  updateSupportTicketStatusLive: (...args: unknown[]) => mockUpdateSupportTicketStatusLive(...args),
  uploadSupportAttachmentLive: (...args: unknown[]) => mockUploadSupportAttachmentLive(...args),
}));

jest.setTimeout(20_000);

function buildSupportTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: "ticket-live-001",
    ticketNumber: "SUP-2026-000145",
    tenantId: "tenant-live-001",
    tenantSlug: "barakaacademy",
    schoolName: "Live school workspace",
    subject: "Critical callback reconciliation failure",
    category: "MPESA",
    priority: "Critical",
    moduleAffected: "MPESA",
    description: "Callbacks are queued for support triage.",
    status: "Escalated",
    owner: "Support escalation desk",
    requester: "School admin",
    updatedAt: "now",
    firstResponseDue: "15 minutes",
    resolutionDue: "4 hours",
    context: {
      requestId: "req-live-support-001",
      browser: "Chrome 124",
      device: "Windows laptop",
      pageUrl: "/school/admin/mpesa",
      appVersion: "2026.05.08",
      errorLogs: ["No client errors captured in the last 5 minutes"],
    },
    attachments: [],
    messages: [
      {
        id: "msg-001",
        author: "School admin",
        authorType: "school",
        body: "Callbacks are not reconciling for several receipts.",
        createdAt: "now",
      },
    ],
    internalNotes: [
      {
        id: "note-001",
        author: "Support agent",
        body: "Bug confirmed. Deploying fix tonight.",
        createdAt: "now",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockFetchSupportTicketsLive.mockResolvedValue([]);
  mockFetchSupportCategoriesLive.mockResolvedValue([
    "Finance",
    "MPESA",
    "Exams",
    "Timetable",
    "Inventory",
    "Library",
    "Login Issues",
    "Subscription",
    "Reports",
    "Performance",
    "Bug Report",
    "Feature Request",
  ]);
  mockFetchKnowledgeBaseLive.mockResolvedValue([]);
  mockFetchSupportNotificationDeadLettersLive.mockResolvedValue([]);
  mockFetchSystemStatusLive.mockResolvedValue({ components: [], incidents: [] });
  mockFetchSupportAnalyticsLive.mockResolvedValue({
    metrics: [
      { id: "unresolved", label: "Unresolved tickets", value: "1", helper: "Backed by the support ticket database" },
      { id: "breach", label: "SLA breach risk", value: "1", helper: "Critical ticket first response due soon" },
      { id: "critical", label: "Critical tickets", value: "1", helper: "Instant escalation and support visibility" },
      { id: "response", label: "Median first response", value: "8m", helper: "Live support analytics" },
    ],
    recurringIssues: ["Recurring MPESA callback failures"],
    heatmap: [{ day: "Mon", tickets: 1 }],
  });
});

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
    const createdTicket = buildSupportTicket({
      id: "ticket-created-001",
      ticketNumber: "SUP-2026-000001",
      internalNotes: [],
    });

    mockCreateSupportTicketLive.mockImplementation(async (input) =>
      buildSupportTicket({
        ...createdTicket,
        tenantSlug: input.tenantSlug,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        moduleAffected: input.moduleAffected,
        description: input.description,
        status: input.priority === "Critical" ? "Escalated" : "Open",
        context: {
          ...createdTicket.context,
          browser: input.browser,
          device: input.device,
          pageUrl: input.currentPageUrl,
          appVersion: input.appVersion,
          errorLogs: input.errorLogs,
        },
      }),
    );
    mockUploadSupportAttachmentLive.mockResolvedValue({
      id: "attachment-001",
      name: "mpesa-callback.log",
      type: "text/plain",
      size: "12 B",
      storedPath: "tenant/barakaacademy/support/SUP-2026-000001/mpesa-callback.log",
    });

    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        tenantSlug: "barakaacademy",
        section: "support-new-ticket",
      }),
    );

    expect(screen.getByRole("heading", { name: /support center/i })).toBeVisible();
    expect(await screen.findByText(/support connected/i)).toBeVisible();
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
    const liveTicket = buildSupportTicket();
    const supportReply: SupportMessage = {
      id: "msg-reply-001",
      author: "Support agent",
      authorType: "support",
      body: "We have patched the callback worker and are replaying unmatched receipts.",
      createdAt: "now",
    };

    mockFetchSupportTicketsLive.mockResolvedValue([liveTicket]);
    mockFetchSupportTicketDetailLive.mockResolvedValue(liveTicket);
    mockFetchSupportNotificationDeadLettersLive.mockResolvedValue([
      {
        id: "notification-dead-001",
        ticketNumber: "SUP-2026-000145",
        schoolName: "Live school workspace",
        title: "Critical support ticket raised: SUP-2026-000145",
        channel: "email",
        attempts: 3,
        error: "SMTP rejected recipient",
        createdAt: "May 11, 06:00 PM",
      },
    ]);
    mockReplyToSupportTicketLive.mockResolvedValue({
      ticket: { ...liveTicket, status: "Waiting for School" },
      message: supportReply,
    });

    renderWithProviders(createElement(SuperadminPages, { section: "support" }));

    expect(screen.getByRole("heading", { name: /support command center/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sla monitoring/i })).toHaveAttribute(
      "href",
      "/support-sla",
    );
    expect(await screen.findByText(/Recurring MPESA callback failures/i)).toBeVisible();
    expect(screen.getAllByText(/SLA breach risk/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Notification dead letters/i)).toBeVisible();
    expect(screen.getByText(/SMTP rejected recipient/i)).toBeVisible();

    const openButtons = await screen.findAllByRole("button", { name: /open sup-2026-000145/i });
    await user.click(openButtons[0]!);

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
