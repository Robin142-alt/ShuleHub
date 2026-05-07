import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderDashboardScreen } from "./test-utils";

describe("STEP 6: Offline UI tests", () => {
  it("shows sync state and pending work in offline mode", async () => {
    const user = userEvent.setup();
    renderDashboardScreen({ role: "admin", online: false });

    expect(
      screen.getByRole("button", { name: /offline queue status/i }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /offline queue status/i }),
    );

    const syncPanel = screen.getByTestId("sync-panel");

    expect(syncPanel).toBeVisible();
    expect(within(syncPanel).getByText("Offline mode active")).toBeVisible();
    expect(within(syncPanel).getByText("Pending")).toBeVisible();
    expect(within(syncPanel).getByText("Failed")).toBeVisible();
  });

  it("disables unsafe finance actions while preserving offline-safe attendance actions", () => {
    renderDashboardScreen({ role: "admin", online: false });

    expect(
      screen.getByRole("button", { name: /record payment/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /send sms/i }),
    ).toBeDisabled();
  });

  it("keeps teacher attendance action available while offline", () => {
    renderDashboardScreen({ role: "teacher", online: false });

    expect(
      screen.getByRole("button", { name: /mark attendance/i }),
    ).toBeEnabled();
  });
});
