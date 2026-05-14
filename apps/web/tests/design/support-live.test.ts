import {
  createSupportTicketLive,
  fetchPublicSystemStatusLive,
  fetchSupportNotificationDeadLettersLive,
  fetchSupportTicketsLive,
} from "@/lib/support/support-live";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    json: async () => body,
  } as Response;
}

const liveTicket = {
  id: "ticket-1",
  tenant_id: "school-alpha",
  ticket_number: "SUP-2026-000001",
  subject: "Login issue",
  category: "Login Issues",
  priority: "High",
  module_affected: "Authentication",
  description: "Unable to sign in",
  status: "Open",
  requester_user_id: "user-1",
  assigned_agent_id: null,
  assigned_agent_name: null,
  school_name: "School Alpha",
  first_response_due_at: null,
  resolution_due_at: null,
  context: null,
  message_count: 1,
  attachment_count: 0,
  created_at: "2026-05-11T18:00:00.000Z",
  updated_at: "2026-05-11T18:00:00.000Z",
};

describe("live support proxy client", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Object.assign(global, { fetch: jest.fn() });
  });

  it("keeps read-only support requests free of CSRF preflight", async () => {
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse([liveTicket]),
    );

    await fetchSupportTicketsLive({
      tenantSlug: "school-alpha",
      audience: "school",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/support/tickets?tenantSlug=school-alpha&audience=school",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        headers: expect.not.objectContaining({
          "x-shulehub-csrf": expect.any(String),
        }),
      }),
    );
  });

  it("unwraps backend data envelopes before mapping support tickets", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        data: [liveTicket],
        meta: { request_id: "req-support-live" },
      }),
    );

    const tickets = await fetchSupportTicketsLive({
      tenantSlug: "school-alpha",
      audience: "school",
    });

    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.ticketNumber).toBe("SUP-2026-000001");
  });

  it("attaches CSRF protection to support mutations", async () => {
    const fetchMock = jest.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-support-token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ticket: liveTicket,
            initial_message: {
              id: "message-1",
              author_type: "school",
              body: "Unable to sign in",
              created_at: "2026-05-11T18:00:00.000Z",
            },
          },
        }),
      );

    await createSupportTicketLive({
      tenantSlug: "school-alpha",
      subject: "Login issue",
      category: "Login Issues",
      priority: "High",
      moduleAffected: "Authentication",
      description: "Unable to sign in",
      browser: "Chrome",
      device: "Desktop",
      currentPageUrl: "/login",
      appVersion: "2026.05.11",
      errorLogs: [],
    });

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
      "/api/support/tickets?tenantSlug=school-alpha",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-support-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("fetches failed notification deliveries for support operators", async () => {
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "notification-1",
            tenant_id: "school-alpha",
            ticket_id: "ticket-1",
            recipient_user_id: null,
            recipient_type: "support",
            channel: "email",
            title: "Critical support ticket raised: SUP-2026-000001",
            body: "School Alpha reported a login issue.",
            delivery_status: "failed",
            delivery_attempts: 3,
            last_delivery_error: "SMTP rejected recipient",
            next_delivery_attempt_at: null,
            delivered_at: null,
            metadata: { ticket_number: "SUP-2026-000001" },
            created_at: "2026-05-11T18:00:00.000Z",
            ticket_number: "SUP-2026-000001",
            ticket_subject: "Login issue",
            school_name: "School Alpha",
          },
        ],
      }),
    );

    const failures = await fetchSupportNotificationDeadLettersLive();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/support/admin/notifications/dead-letter?audience=superadmin",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(failures).toEqual([
      expect.objectContaining({
        id: "notification-1",
        ticketNumber: "SUP-2026-000001",
        schoolName: "School Alpha",
        channel: "email",
        attempts: 3,
        error: "SMTP rejected recipient",
      }),
    ]);
  });

  it("fetches public system status without the authenticated support proxy", async () => {
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        data: {
          components: [
            {
              id: "api",
              name: "API status",
              status: "operational",
              uptime_percent: 99.98,
              latency_ms: 42,
            },
          ],
          incidents: [],
        },
      }),
    );

    const status = await fetchPublicSystemStatusLive();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/support/public/system-status",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(status.components).toEqual([
      expect.objectContaining({
        id: "api",
        name: "API status",
        status: "operational",
        uptime: "99.98%",
        latency: "42ms",
      }),
    ]);
  });
});
