import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { PortalPages } from "@/components/portal/portal-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { SuperadminPages } from "@/components/platform/superadmin-pages";

import { routerPushMock } from "./router-mock";
import { renderWithProviders } from "./test-utils";

jest.setTimeout(20_000);

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    json: async () => body,
  } as Response;
}

function emptyReconciliationReport() {
  return {
    period: {
      from: "2026-05-01",
      to: "2026-05-16",
      payment_method: null,
    },
    totals: {
      transaction_count: 0,
      total_amount_minor: "0",
      cleared_count: 0,
      cleared_amount_minor: "0",
      pending_count: 0,
      pending_amount_minor: "0",
      exception_count: 0,
      exception_amount_minor: "0",
    },
    method_summaries: [],
    rows: [],
  };
}

describe("experience actions", () => {
  it("supports shell search and notifications inside the hosted school workspace", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      createElement(SchoolPages, { role: "bursar", tenantSlug: "barakaacademy" }),
    );

    const searchInput = screen.getByLabelText("Workspace search");
    await user.click(searchInput);
    await user.type(searchInput, "fees");

    const searchPanel = await screen.findByTestId("workspace-search-panel");
    const financeResult = within(searchPanel).getByRole("button", {
      name: /fees/i,
    });
    await user.click(financeResult);

    expect(routerPushMock).toHaveBeenCalledWith("/finance");

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const notificationsPanel = await screen.findByTestId("workspace-notifications-panel");
    expect(
      within(notificationsPanel).getByText(/no notifications are open/i),
    ).toBeVisible();
  });

  it("adds a learner from the school students workspace instead of exposing a dead action", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        tenantSlug: "barakaacademy",
        section: "students",
      }),
    );

    await user.click(screen.getByRole("button", { name: /add student/i }));

    const dialog = await screen.findByRole("dialog", { name: /add student/i });
    fireEvent.change(within(dialog).getByLabelText(/learner name/i), {
      target: { value: "Mercy Atieno" },
    });
    fireEvent.change(within(dialog).getByLabelText(/admission number/i), {
      target: { value: "ADM-9001" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^class$/i), {
      target: { value: "Grade 6 Hope" },
    });
    fireEvent.change(within(dialog).getByLabelText(/parent contact/i), {
      target: { value: "0722000001" },
    });

    await user.click(within(dialog).getByRole("button", { name: /save student/i }));

    expect(
      await screen.findByText(/mercy atieno added to the learner register/i),
    ).toBeVisible();
  });

  it("keeps the superadmin schools surface empty until real schools are onboarded", () => {
    renderWithProviders(createElement(SuperadminPages, { section: "schools" }));

    expect(screen.getByRole("heading", { name: /tenant control/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /nothing to show yet/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /open tenant/i })).not.toBeInTheDocument();
  });

  it("shares a portal fee statement through a real copy flow", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    renderWithProviders(
      createElement(PortalPages, { viewer: "parent", section: "fees" }),
    );

    await user.click(screen.getByRole("button", { name: /share statement/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ShuleHub family statement"));
    expect(screen.getByText(/statement copied for sharing/i)).toBeVisible();
  });

  it("records a school payment through the collections workspace", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(emptyReconciliationReport()))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-payment-token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "manual-payment-1", status: "cleared" }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(emptyReconciliationReport()));

    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      renderWithProviders(
        createElement(SchoolPages, {
          role: "admin",
          tenantSlug: "barakaacademy",
          section: "finance",
        }),
      );

      await user.click(screen.getByRole("button", { name: /record payment/i }));

      const dialog = await screen.findByRole("dialog", { name: /record payment/i });
      fireEvent.change(within(dialog).getByLabelText(/payment student/i), {
        target: { value: "Mercy Atieno" },
      });
      fireEvent.change(within(dialog).getByLabelText(/payment amount/i), {
        target: { value: "18500" },
      });
      fireEvent.change(within(dialog).getByLabelText(/payment reference/i), {
        target: { value: "SMX82KQ4" },
      });

      await user.click(within(dialog).getByRole("button", { name: /save payment/i }));

      expect(await screen.findByText(/payment recorded and posted to finance activity/i)).toBeVisible();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/billing/manual-fee-payments"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-shulehub-csrf": "csrf-payment-token",
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("blocks manual MPESA reconciliation when the receipt is not in live tenant data", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        tenantSlug: "barakaacademy",
        section: "mpesa",
      }),
    );

    await user.click(screen.getByRole("button", { name: /manual reconcile/i }));

    const dialog = await screen.findByRole("dialog", { name: /manual reconcile/i });
    const receiptInput = within(dialog).getByLabelText(/^receipt code$/i);
    fireEvent.change(receiptInput, {
      target: { value: "QJT8V9H33" },
    });
    fireEvent.change(within(dialog).getByLabelText(/matched learner/i), {
      target: { value: "Mercy Atieno" },
    });

    await user.click(within(dialog).getByRole("button", { name: /save match/i }));

    expect(
      await within(dialog).findByText(/receipt code was not found in the current mpesa queue/i),
    ).toBeVisible();
  });
});
