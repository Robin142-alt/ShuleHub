import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { PortalPages } from "@/components/portal/portal-pages";
import { SchoolPages } from "@/components/school/school-pages";
import { SuperadminPages } from "@/components/platform/superadmin-pages";

import { routerPushMock } from "./router-mock";
import { renderWithProviders } from "./test-utils";

jest.setTimeout(20_000);

describe("experience actions", () => {
  it("supports shell search and notifications inside the hosted school workspace", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      createElement(SchoolPages, { role: "bursar", tenantSlug: "barakaacademy" }),
    );

    const searchInput = screen.getByLabelText("Workspace search");
    await user.click(searchInput);
    await user.type(searchInput, "reports");

    const searchPanel = await screen.findByTestId("workspace-search-panel");
    const reportsResult = within(searchPanel).getByRole("button", {
      name: /reports/i,
    });
    await user.click(reportsResult);

    expect(routerPushMock).toHaveBeenCalledWith("/reports");

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const notificationsPanel = await screen.findByTestId("workspace-notifications-panel");
    expect(
      within(notificationsPanel).getByText(/renewal due in 5 days/i),
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
    await user.type(within(dialog).getByLabelText(/learner name/i), "Mercy Atieno");
    await user.type(within(dialog).getByLabelText(/admission number/i), "ADM-9001");
    await user.type(within(dialog).getByLabelText(/^class$/i), "Grade 6 Hope");
    await user.type(within(dialog).getByLabelText(/parent contact/i), "0722000001");

    await user.click(within(dialog).getByRole("button", { name: /save student/i }));

    expect(
      await screen.findByText(/mercy atieno added to the learner register/i),
    ).toBeVisible();
  });

  it("opens a tenant control workflow from the superadmin schools surface", async () => {
    const user = userEvent.setup();
    renderWithProviders(createElement(SuperadminPages, { section: "schools" }));

    await user.click(screen.getAllByRole("button", { name: /open tenant/i })[0]!);

    const dialog = await screen.findByRole("dialog", { name: /tenant control/i });
    expect(within(dialog).getByText(/amani prep school/i)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: /suspend/i }));

    expect(screen.getAllByText("Suspended").length).toBeGreaterThan(0);
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

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/statement copied for sharing/i)).toBeVisible();
  });

  it("records a school payment through the collections workspace", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      createElement(SchoolPages, {
        role: "admin",
        tenantSlug: "barakaacademy",
        section: "finance",
      }),
    );

    await user.click(screen.getByRole("button", { name: /record payment/i }));

    const dialog = await screen.findByRole("dialog", { name: /record payment/i });
    await user.type(within(dialog).getByLabelText(/payment student/i), "Mercy Atieno");
    await user.type(within(dialog).getByLabelText(/payment amount/i), "18500");
    await user.type(within(dialog).getByLabelText(/payment reference/i), "SMX82KQ4");

    await user.click(within(dialog).getByRole("button", { name: /save payment/i }));

    expect(await screen.findByText(/payment recorded for mercy atieno/i)).toBeVisible();
    expect(screen.getAllByText("Matched").length).toBeGreaterThan(0);
  });

  it("reconciles an mpesa receipt into a matched learner record", async () => {
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
    await user.clear(receiptInput);
    await user.type(receiptInput, "QJT8V9H33");
    await user.clear(within(dialog).getByLabelText(/matched learner/i));
    await user.type(within(dialog).getByLabelText(/matched learner/i), "Mercy Atieno");

    await user.click(within(dialog).getByRole("button", { name: /save match/i }));

    expect(await screen.findByText(/qjt8v9h33 matched to mercy atieno/i)).toBeVisible();
    expect(screen.getAllByText("Matched").length).toBeGreaterThan(0);
  });
});
