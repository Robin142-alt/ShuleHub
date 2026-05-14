import { render, screen } from "@testing-library/react";

import PublicSupportStatusPage from "@/app/support/status/page";

jest.mock("@/lib/dashboard/api-client", () => ({
  getDashboardApiBaseUrl: () => "",
}));

describe("PublicSupportStatusPage", () => {
  test("renders an unsubscribe confirmation form when an unsubscribe token is present", async () => {
    const element = await PublicSupportStatusPage({
      searchParams: {
        token: "signed-unsubscribe-token",
      },
    } as never);

    const { container } = render(element);
    const form = container.querySelector(
      'form[action="/api/support/public/status-subscriptions/unsubscribe"]',
    );

    expect(form).not.toBeNull();
    expect(screen.getByRole("button", { name: /unsubscribe/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("signed-unsubscribe-token")).toHaveAttribute("name", "token");
  });
});
