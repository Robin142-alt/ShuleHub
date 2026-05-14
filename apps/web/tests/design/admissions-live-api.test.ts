import { requestDashboardApi, type LiveAuthSession } from "@/lib/dashboard/api-client";
import {
  advanceAdmissionsStudentAcademicLifecycleLive,
  fetchAdmissionsReportExportLive,
} from "@/lib/modules/admissions-live";
import {
  buildAdmissionsReports,
  createAdmissionsDataset,
} from "@/lib/modules/admissions-data";

jest.mock("@/lib/dashboard/api-client", () => ({
  requestDashboardApi: jest.fn(),
}));

describe("admissions live API client", () => {
  it("posts academic lifecycle actions to the admissions API endpoint", async () => {
    const session: LiveAuthSession = {
      tenantId: "tenant-a",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        user_id: "user-1",
        tenant_id: "tenant-a",
        role: "admissions",
        email: "admissions@example.test",
        display_name: "Admissions Desk",
        permissions: [],
        session_id: "session-1",
      },
    };
    const mockedRequest = jest.mocked(requestDashboardApi);
    mockedRequest.mockResolvedValueOnce({
      lifecycle_event: {
        id: "event-1",
        event_type: "promotion",
      },
    });

    await advanceAdmissionsStudentAcademicLifecycleLive(session, "student-1", {
      action: "promotion",
      class_name: "Grade 8",
      stream_name: "North",
      reason: "End of year promotion",
    });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/admissions/students/student-1/academic-lifecycle",
      {
        tenantId: "tenant-a",
        accessToken: "access-token",
        method: "POST",
        body: {
          action: "promotion",
          class_name: "Grade 8",
          stream_name: "North",
          reason: "End of year promotion",
        },
      },
    );
  });

  it("fetches server-side admissions report export artifacts", async () => {
    const session: LiveAuthSession = {
      tenantId: "tenant-a",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        user_id: "user-1",
        tenant_id: "tenant-a",
        role: "admissions",
        email: "admissions@example.test",
        display_name: "Admissions Desk",
        permissions: [],
        session_id: "session-1",
      },
    };
    const mockedRequest = jest.mocked(requestDashboardApi);
    mockedRequest.mockResolvedValueOnce({
      report_id: "applications",
      title: "Applications register",
      filename: "admissions-applications.csv",
      content_type: "text/csv; charset=utf-8",
      generated_at: "2026-05-14T10:00:00.000Z",
      row_count: 1,
      checksum_sha256: "checksum",
      csv: "Applicant,Application No\r\nAchieng,APP-20260514-001\r\n",
    });

    const artifact = await fetchAdmissionsReportExportLive(session, "applications");

    expect(mockedRequest).toHaveBeenCalledWith(
      "/admissions/reports/applications/export",
      {
        tenantId: "tenant-a",
        accessToken: "access-token",
      },
    );
    expect(artifact).toMatchObject({
      filename: "admissions-applications.csv",
      row_count: 1,
      checksum_sha256: "checksum",
    });
  });

  it("marks admissions report cards with server export identifiers", () => {
    const reports = buildAdmissionsReports(createAdmissionsDataset());

    expect(reports.map((report) => report.serverExportId)).toEqual([
      "applications",
      "documents",
      "allocations",
      "transfers",
    ]);
  });
});
