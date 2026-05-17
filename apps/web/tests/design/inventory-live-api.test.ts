import type { LiveAuthSession } from "@/lib/dashboard/api-client";
import { fetchInventoryReportExportLive } from "@/lib/modules/inventory-live";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    json: async () => body,
  } as Response;
}

describe("inventory live API client", () => {
  beforeEach(() => {
    Object.assign(global, { fetch: jest.fn() });
  });

  it("fetches server-side report export artifacts from the inventory API", async () => {
    const session: LiveAuthSession = {
      tenantId: "tenant-a",
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
    jest.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({
      report_id: "stock-valuation",
      title: "Stock valuation",
      filename: "inventory-stock-valuation.csv",
      content_type: "text/csv; charset=utf-8",
      generated_at: "2026-05-14T09:00:00.000Z",
      row_count: 1,
      checksum_sha256: "checksum",
      csv: "Item,SKU\r\nA4 Printing Paper,STAT-A4-001\r\n",
    }));

    const artifact = await fetchInventoryReportExportLive(session, "stock-valuation");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/inventory/reports/stock-valuation/export",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(artifact).toMatchObject({
      filename: "inventory-stock-valuation.csv",
      row_count: 1,
      checksum_sha256: "checksum",
    });
  });
});
