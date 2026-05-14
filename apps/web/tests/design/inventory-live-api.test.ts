import { requestDashboardApi, type LiveAuthSession } from "@/lib/dashboard/api-client";
import { fetchInventoryReportExportLive } from "@/lib/modules/inventory-live";

jest.mock("@/lib/dashboard/api-client", () => ({
  requestDashboardApi: jest.fn(),
}));

describe("inventory live API client", () => {
  it("fetches server-side report export artifacts from the inventory API", async () => {
    const session: LiveAuthSession = {
      tenantId: "tenant-a",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        user_id: "user-1",
        tenant_id: "tenant-a",
        role: "storekeeper",
        email: "storekeeper@example.test",
        display_name: "Store Keeper",
        permissions: [],
        session_id: "session-1",
      },
    };
    const mockedRequest = jest.mocked(requestDashboardApi);
    mockedRequest.mockResolvedValueOnce({
      report_id: "stock-valuation",
      title: "Stock valuation",
      filename: "inventory-stock-valuation.csv",
      content_type: "text/csv; charset=utf-8",
      generated_at: "2026-05-14T09:00:00.000Z",
      row_count: 1,
      checksum_sha256: "checksum",
      csv: "Item,SKU\r\nA4 Printing Paper,STAT-A4-001\r\n",
    });

    const artifact = await fetchInventoryReportExportLive(session, "stock-valuation");

    expect(mockedRequest).toHaveBeenCalledWith(
      "/inventory/reports/stock-valuation/export",
      {
        tenantId: "tenant-a",
        accessToken: "access-token",
      },
    );
    expect(artifact).toMatchObject({
      filename: "inventory-stock-valuation.csv",
      row_count: 1,
      checksum_sha256: "checksum",
    });
  });
});
