import { formatCurrency } from "@/lib/dashboard/format";
import { buildAdmissionsReports } from "@/lib/modules/admissions-data";
import {
  buildAdmissionDocumentUploads,
  buildAdmissionRegistrationSummary,
  mapAdmissionsDatasetFromLive,
  mapAdmissionsSearchItemsFromLive,
  mapAdmissionsStudentProfileFromLive,
} from "@/lib/modules/admissions-live";
import {
  mapInventoryDatasetFromLive,
  mapInventoryReportsFromLive,
} from "@/lib/modules/inventory-live";
import {
  mapLiveSupportAnalytics,
  mapLiveSupportTicketDetail,
} from "@/lib/support/support-live";

describe("module live adapters", () => {
  test("maps support API ticket detail into the threaded workspace shape", () => {
    const ticket = mapLiveSupportTicketDetail({
      ticket: {
        id: "00000000-0000-0000-0000-00000000aaa1",
        tenant_id: "school-alpha",
        ticket_number: "SUP-2026-000145",
        subject: "MPESA callbacks are failing",
        category: "MPESA",
        priority: "Critical",
        module_affected: "MPESA",
        description: "Callbacks are returning 500 and receipts are not matching learners.",
        status: "Escalated",
        requester_user_id: "00000000-0000-0000-0000-000000000001",
        assigned_agent_id: null,
        assigned_agent_name: "Support Agent",
        school_name: "School Alpha",
        first_response_due_at: "2026-05-08T08:15:00.000Z",
        resolution_due_at: "2026-05-08T10:00:00.000Z",
        context: {
          request_id: "req-support-1",
          browser: "Chrome 124",
          device: "Android phone",
          current_page_url: "/school/admin/mpesa",
          app_version: "2026.05.08",
          error_logs: ["POST /mpesa/callback 500"],
        },
        created_at: "2026-05-08T08:00:00.000Z",
        updated_at: "2026-05-08T08:08:00.000Z",
      },
      messages: [
        {
          id: "message-1",
          author_type: "school",
          body: "Parents are paying but callbacks remain unmatched.",
          created_at: "2026-05-08T08:00:00.000Z",
        },
        {
          id: "message-2",
          author_type: "support",
          body: "We are replaying callback events now.",
          created_at: "2026-05-08T08:08:00.000Z",
        },
      ],
      attachments: [
        {
          id: "attachment-1",
          original_file_name: "mpesa-callback.log",
          mime_type: "text/plain",
          size_bytes: 18432,
          stored_path: "tenant/school-alpha/support/00000000-0000-0000-0000-00000000aaa1/mpesa-callback.log",
        },
      ],
      internal_notes: [
        {
          id: "note-1",
          note: "Bug confirmed. Deploying fix tonight.",
          created_at: "2026-05-08T08:11:00.000Z",
        },
      ],
      status_logs: [],
    });

    expect(ticket).toMatchObject({
      id: "00000000-0000-0000-0000-00000000aaa1",
      tenantSlug: "school-alpha",
      ticketNumber: "SUP-2026-000145",
      schoolName: "School Alpha",
      owner: "Support Agent",
      status: "Escalated",
      context: {
        requestId: "req-support-1",
        browser: "Chrome 124",
        device: "Android phone",
        pageUrl: "/school/admin/mpesa",
        appVersion: "2026.05.08",
        errorLogs: ["POST /mpesa/callback 500"],
      },
    });
    expect(ticket.messages.map((message) => message.authorType)).toEqual(["school", "support"]);
    expect(ticket.attachments[0]).toMatchObject({
      name: "mpesa-callback.log",
      size: "18 KB",
    });
    expect(ticket.internalNotes[0]?.body).toBe("Bug confirmed. Deploying fix tonight.");
  });

  test("maps support analytics into command-center metrics and heatmap rows", () => {
    const analytics = mapLiveSupportAnalytics({
      status_counts: [
        { status: "Open", total: 5 },
        { status: "In Progress", total: 3 },
        { status: "Waiting for School", total: 2 },
      ],
      priority_counts: [
        { priority: "Critical", total: 2 },
        { priority: "High", total: 4 },
      ],
      sla_breaches: 7,
      recurring_issues: [
        { category: "MPESA", module_affected: "MPESA", total: 6 },
      ],
      ticket_heatmap: [
        { day: "2026-05-08", total: 11 },
      ],
    });

    expect(analytics.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "unresolved", value: "10" }),
        expect.objectContaining({ id: "breach", value: "7" }),
        expect.objectContaining({ id: "critical", value: "2" }),
      ]),
    );
    expect(analytics.recurringIssues).toContain("MPESA in MPESA: 6 tickets");
    expect(analytics.heatmap[0]).toEqual({ day: "Fri", tickets: 11 });
  });

  test("maps inventory API records into the operational dataset shape", () => {
    const dataset = mapInventoryDatasetFromLive({
      categories: [
        {
          id: "cat-1",
          code: "STAT",
          name: "Stationery",
          description: "Daily classroom and office consumables",
        },
      ],
      suppliers: [
        {
          id: "sup-1",
          supplier_name: "Crown Office Supplies",
          contact_person: "Lucy Njeri",
          email: "orders@crownoffice.co.ke",
          phone: "+254722441885",
          last_delivery_at: "2026-05-02",
          status: "active",
        },
      ],
      items: [
        {
          id: "itm-1",
          item_name: "A4 Printing Paper",
          sku: "STAT-A4-001",
          category_id: "cat-1",
          category_name: "Stationery",
          unit: "pack",
          quantity_on_hand: 18,
          unit_price: 650,
          reorder_level: 25,
          supplier_id: "sup-1",
          supplier_name: "Crown Office Supplies",
          storage_location: "Admin Store Shelf A2",
          notes: "Exam office issue line",
          status: "active",
          is_archived: false,
        },
      ],
      movements: [
        {
          id: "mov-1",
          item_name: "A4 Printing Paper",
          movement_type: "stock_out",
          quantity: 5,
          reference: "REQ-001",
          notes: "Issued to Grade 7 desk",
          occurred_at: "2026-05-04T08:00:00.000Z",
          actor_display_name: "Linet Auma",
        },
      ],
      purchaseOrders: [
        {
          id: "po-1",
          tenant_id: "tenant-a",
          po_number: "PO-2026-014",
          supplier_id: "sup-1",
          supplier_name: "Crown Office Supplies",
          status: "approved",
          expected_delivery_date: "2026-05-06",
          ordered_at: "2026-05-04",
          received_at: null,
          total_amount: 19500,
          lines: [
            {
              item_id: "itm-1",
              item_name: "A4 Printing Paper",
              quantity: 30,
              unit_price: 650,
            },
          ],
          notes: "Urgent restock before exams",
          requested_by_display_name: "Procurement Desk",
        },
      ],
      requests: [
        {
          id: "req-1",
          request_number: "REQ-2026-104",
          department: "Academics",
          requested_by: "Mercy Wanjiku",
          status: "approved",
          needed_by: "2026-05-06",
          priority: "high",
          lines: [
            {
              item_id: "itm-1",
              item_name: "A4 Printing Paper",
              quantity: 12,
              unit_price: 650,
            },
          ],
          notes: "Exam papers",
          created_at: "2026-05-04",
        },
      ],
      transfers: [
        {
          id: "trf-1",
          transfer_number: "TRF-2026-008",
          from_location: "Main Store",
          to_location: "Boarding Kitchen",
          status: "pending",
          requested_by: "Linet Auma",
          lines: [
            {
              item_id: "itm-1",
              item_name: "A4 Printing Paper",
              quantity: 6,
              unit_price: 650,
            },
          ],
          notes: "Weekend boarding issue",
          created_at: "2026-05-04",
        },
      ],
      incidents: [
        {
          id: "inc-1",
          incident_number: "INC-2026-003",
          item_name: "A4 Printing Paper",
          incident_type: "lost",
          quantity: 2,
          reason: "Miscount after classroom issue",
          responsible_department: "Academics",
          cost_impact: 1300,
          status: "logged",
          notes: null,
          reported_at: "2026-05-04",
        },
      ],
    });

    expect(dataset.categories[0]).toMatchObject({
      code: "STAT",
      name: "Stationery",
      manager: "Not assigned",
      storageZones: "Not configured",
    });
    expect(dataset.items[0]).toMatchObject({
      name: "A4 Printing Paper",
      supplier: "Crown Office Supplies",
    });
    expect(dataset.suppliers[0]).toMatchObject({
      county: "Not recorded",
    });
    expect(dataset.movements[0]).toMatchObject({
      user: "Linet Auma",
      type: "stock_out",
    });
    expect(dataset.purchaseOrders[0]).toMatchObject({
      requestedBy: "Procurement Desk",
      lineSummary: "A4 Printing Paper x30",
    });
    expect(dataset.requests[0].quantity).toBe("12 units");
    expect(dataset.transfers[0].status).toBe("requested");
    expect(dataset.incidents[0]).toMatchObject({
      type: "lost",
      costImpact: 1300,
    });
  });

  test("does not manufacture inventory ownership or location metadata when live data is incomplete", () => {
    const dataset = mapInventoryDatasetFromLive({
      categories: [
        {
          id: "cat-empty",
          code: "GENERAL",
          name: "General Supplies",
          description: null,
        },
      ],
      suppliers: [
        {
          id: "sup-empty",
          supplier_name: "Registered Supplier",
          contact_person: null,
          email: null,
          phone: null,
          last_delivery_at: null,
          status: "active",
          county: null,
        },
      ],
      items: [
        {
          id: "item-empty",
          item_name: "Registered Item",
          sku: "ITEM-001",
          category_id: "cat-empty",
          category_name: "General Supplies",
          unit: "unit",
          quantity_on_hand: 0,
          unit_price: 0,
          reorder_level: 0,
          supplier_id: null,
          supplier_name: null,
          storage_location: null,
          notes: null,
          status: "active",
          is_archived: false,
        },
      ],
      movements: [],
      purchaseOrders: [],
      requests: [],
      transfers: [],
      incidents: [],
    });

    expect(dataset.categories[0]).toMatchObject({
      manager: "Not assigned",
      storageZones: "Not configured",
      notes: "No notes recorded.",
    });
    expect(dataset.suppliers[0]).toMatchObject({
      contact: "Not recorded",
      email: "",
      phone: "Not on file",
      county: "Not recorded",
    });
    expect(dataset.items[0]).toMatchObject({
      supplier: "Unassigned supplier",
      location: "Not assigned",
      notes: "No notes recorded.",
    });
  });

  test("maps admissions API records into workflow tables and missing document rows", () => {
    const dataset = mapAdmissionsDatasetFromLive({
      summary: {
        new_applications: 3,
        approved_students: 1,
        pending_review: 2,
        total_registered: 4,
        recent_applications: [],
        pending_approvals: [],
        missing_documents: [
          {
            application_id: "app-1",
            application_number: "APP-20260504-118",
            full_name: "Ian Mwangi",
            uploaded_documents: 1,
          },
        ],
      },
      applications: [
        {
          id: "app-1",
          tenant_id: "tenant-a",
          application_number: "APP-20260504-118",
          full_name: "Ian Mwangi",
          date_of_birth: "2017-09-13",
          gender: "Male",
          birth_certificate_number: "BC-667140",
          nationality: "Kenyan",
          previous_school: "Roysambu Christian Academy",
          kcpe_results: null,
          cbc_level: "Grade 3 complete",
          class_applying: "Grade 4",
          parent_name: "Paul Mwangi",
          parent_phone: "+254723111819",
          parent_email: "paul.mwangi@example.com",
          parent_occupation: "Project manager",
          relationship: "Father",
          allergies: null,
          conditions: "Asthma",
          emergency_contact: "+254733311881",
          status: "approved",
          interview_date: null,
          review_notes: "Ready for registration",
          approved_at: "2026-05-04T08:00:00.000Z",
          admitted_student_id: "stu-1",
          created_at: "2026-05-04T07:30:00.000Z",
          updated_at: "2026-05-04T08:00:00.000Z",
        },
      ],
      students: [
        {
          id: "stu-1",
          admission_number: "ADM-G4-051",
          first_name: "Ian",
          last_name: "Mwangi",
          primary_guardian_name: "Paul Mwangi",
          primary_guardian_phone: "+254723111819",
          metadata: {
            admissions: {
              guardian: {
                parent_email: "paul.mwangi@example.com",
                parent_occupation: "Project manager",
                relationship: "Father",
              },
            },
          },
          class_name: "Grade 4",
          stream_name: "Jasiri",
          dormitory_name: null,
          transport_route: "Northern Bypass",
        },
      ],
      parents: [
        {
          parent_name: "Paul Mwangi",
          parent_phone: "+254723111819",
          parent_email: "paul.mwangi@example.com",
          parent_occupation: "Project manager",
          relationship: "Father",
        },
      ],
      documents: [
        {
          id: "doc-1",
          application_id: "app-1",
          student_id: "stu-1",
          document_type: "Birth certificate",
          original_file_name: "ian-bc.pdf",
          verification_status: "pending",
          created_at: "2026-05-04T09:00:00.000Z",
          application_number: "APP-20260504-118",
          applicant_name: "Ian Mwangi",
          admission_number: "ADM-G4-051",
          student_name: "Ian Mwangi",
        },
      ],
      allocations: [
        {
          id: "alloc-1",
          student_id: "stu-1",
          admission_number: "ADM-G4-051",
          first_name: "Ian",
          last_name: "Mwangi",
          class_name: "Grade 4",
          stream_name: "Jasiri",
          dormitory_name: null,
          transport_route: "Northern Bypass",
          effective_from: "2026-05-04",
        },
      ],
      transfers: [
        {
          id: "trn-1",
          student_id: "stu-1",
          application_id: null,
          transfer_type: "incoming",
          school_name: "Roysambu Christian Academy",
          reason: "Relocation",
          requested_on: "2026-05-04",
          status: "pending",
          notes: null,
        },
      ],
    });

    expect(dataset.applications[0]).toMatchObject({
      applicantName: "Ian Mwangi",
      admissionNumber: "ADM-G4-051",
      status: "approved",
    });
    expect(dataset.students[0]).toMatchObject({
      fullName: "Ian Mwangi",
      className: "Grade 4",
      streamName: "Jasiri",
    });
    expect(dataset.parents[0]).toMatchObject({
      parentName: "Paul Mwangi",
      learners: "Ian Mwangi",
    });
    expect(dataset.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          learnerName: "Ian Mwangi",
          fileName: "ian-bc.pdf",
          verificationStatus: "pending",
          applicationId: "app-1",
          studentId: "stu-1",
        }),
        expect.objectContaining({
          learnerName: "Ian Mwangi",
          documentType: "Required admissions documents",
          verificationStatus: "missing",
          applicationId: "app-1",
          applicationNumber: "APP-20260504-118",
        }),
      ]),
    );
    expect(dataset.transfers[0]).toMatchObject({
      learnerName: "Ian Mwangi",
      admissionNumber: "ADM-G4-051",
      direction: "incoming",
    });
  });

  test("omits transport route data from admissions reports unless transport is enabled", () => {
    const reports = buildAdmissionsReports({
      applications: [],
      students: [],
      parents: [],
      documents: [],
      transfers: [],
      studentProfiles: [],
      allocations: [
        {
          id: "alloc-1",
          studentId: "student-1",
          studentName: "Ian Mwangi",
          admissionNumber: "ADM-G4-051",
          className: "Grade 4",
          streamName: "Jasiri",
          dormitoryName: "Mara House",
          transportRoute: "Northern Bypass",
          effectiveFrom: "2026-05-04",
          status: "assigned",
        },
      ],
    });
    const allocationReport = reports.find((report) => report.id === "report-allocations");

    expect(allocationReport?.headers).toEqual(["Student", "Class", "Stream", "Dormitory", "Status"]);
    expect(allocationReport?.rows[0]).toEqual(["Ian Mwangi", "Grade 4", "Jasiri", "Mara House", "Assigned"]);

    const transportEnabledReport = buildAdmissionsReports({
      applications: [],
      students: [],
      parents: [],
      documents: [],
      transfers: [],
      studentProfiles: [],
      allocations: [
        {
          id: "alloc-1",
          studentId: "student-1",
          studentName: "Ian Mwangi",
          admissionNumber: "ADM-G4-051",
          className: "Grade 4",
          streamName: "Jasiri",
          dormitoryName: "Mara House",
          transportRoute: "Northern Bypass",
          effectiveFrom: "2026-05-04",
          status: "assigned",
        },
      ],
    }, { transportEnabled: true }).find((report) => report.id === "report-allocations");

    expect(transportEnabledReport?.headers).toEqual(["Student", "Class", "Stream", "Dormitory", "Route", "Status"]);
    expect(transportEnabledReport?.rows[0]).toContain("Northern Bypass");
  });

  test("maps a live student profile into the tabbed admissions profile view", () => {
    const profile = mapAdmissionsStudentProfileFromLive({
      student: {
        id: "stu-1",
        admission_number: "ADM-G7-118",
        first_name: "Brenda",
        last_name: "Atieno",
        date_of_birth: "2014-02-19",
        gender: "female",
        primary_guardian_name: "Janet Atieno",
        primary_guardian_phone: "+254712300401",
        metadata: {
          admissions: {
            class_applying: "Grade 7",
            previous_school: "Lakeview Junior School",
            kcpe_results: "368 marks",
            cbc_level: "Grade 6 complete",
            nationality: "Kenyan",
            medical: {
              allergies: "Peanuts",
              conditions: "None",
              emergency_contact: "+254722911404",
            },
            guardian: {
              parent_name: "Janet Atieno",
              parent_email: "janet.atieno@gmail.com",
              parent_occupation: "Clinical officer",
              relationship: "Mother",
            },
          },
        },
      },
      allocation: {
        class_name: "Grade 7",
        stream_name: "Hope",
        dormitory_name: "Mara House",
        transport_route: "Eastern Bypass",
        effective_from: "2026-05-04",
      },
      documents: [
        {
          id: "doc-1",
          document_type: "Birth certificate",
          original_file_name: "brenda-bc.pdf",
          verification_status: "verified",
          created_at: "2026-05-04T10:00:00.000Z",
        },
      ],
    });

    expect(profile).toMatchObject({
      fullName: "Brenda Atieno",
      admissionNumber: "ADM-G7-118",
      className: "Grade 7",
      streamName: "Hope",
      parentName: "Janet Atieno",
      previousSchool: "Lakeview Junior School",
      allergies: "Peanuts",
    });
    expect(profile.documents[0]).toMatchObject({
      documentType: "Birth certificate",
      verificationStatus: "verified",
    });
    expect("attendance" in profile).toBe(false);
    expect(profile.fees).toEqual([]);
  });

  test("maps admissions academic downstream status into the student profile", () => {
    const profile = mapAdmissionsStudentProfileFromLive({
      student: {
        id: "stu-88",
        admission_number: "ADM-G8-088",
        first_name: "Lifecycle",
        last_name: "Ready",
        metadata: null,
      },
      allocation: {
        class_name: "Grade 8",
        stream_name: "South",
        effective_from: "2026-05-04",
      },
      academic_enrollment: {
        id: "enr-1",
        class_name: "Grade 8",
        stream_name: "South",
        academic_year: "2026",
        status: "active",
      },
      subject_enrollments: [
        { id: "sub-1", subject_name: "Mathematics", status: "active" },
        { id: "sub-2", subject_name: "English", status: "active" },
      ],
      timetable_enrollments: [
        { id: "slot-1", day_of_week: "Monday", starts_at: "08:00", ends_at: "08:40", status: "active" },
      ],
      lifecycle_events: [
        {
          id: "evt-1",
          event_type: "promotion",
          to_class_name: "Grade 8",
          to_stream_name: "South",
          created_at: "2026-05-04T12:00:00.000Z",
        },
      ],
      guardian_links: [
        {
          id: "guardian-1",
          display_name: "Parent Ready",
          email: "parent@example.test",
          status: "active",
          user_id: "user-1",
          accepted_at: "2026-05-04T12:10:00.000Z",
        },
      ],
      fee_assignment: {
        id: "assignment-1",
        status: "assigned",
        amount_minor: "250000",
        currency_code: "KES",
      },
      fee_invoice: {
        id: "invoice-1",
        invoice_number: "SF-20260513-001",
        description: "Term 1 opening fees",
        status: "open",
        amount_due_minor: "250000",
        amount_paid_minor: "0",
        currency_code: "KES",
        due_date: "2026-05-27",
      },
      documents: [],
    } as never);

    expect(profile.academics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "Current enrollment",
          value: "Grade 8 South",
          note: "2026 - active",
        }),
        expect.objectContaining({
          subject: "Subjects",
          value: "2 active",
        }),
        expect.objectContaining({
          subject: "Timetable",
          value: "1 active",
        }),
        expect.objectContaining({
          subject: "Latest lifecycle",
          value: "Promotion",
        }),
      ]),
    );
    expect(profile).toMatchObject({
      portalAccessStatus: "active",
      portalAccessDetail: "Parent portal active for parent@example.test",
      feesBalance: 2500,
      billingPlan: "Term 1 opening fees",
      lastPayment: "Invoice open - due 2026-05-27",
    });
    expect(profile.fees).toEqual([
      expect.objectContaining({
        item: "SF-20260513-001",
        amount: 2500,
        status: "pending",
      }),
    ]);
  });

  test("summarizes admissions registration handoffs for the completion receipt", () => {
    const summary = buildAdmissionRegistrationSummary({
      fallback: {
        applicantName: "Lifecycle Ready",
        admissionNumber: "ADM-G8-088",
        className: "Grade 8",
        streamName: "South",
        parentEmail: "parent@example.test",
      },
      response: {
        student: {
          id: "stu-88",
          admission_number: "ADM-G8-088",
          first_name: "Lifecycle",
          last_name: "Ready",
        },
        academic_enrollment: {
          id: "enr-1",
          class_name: "Grade 8",
          stream_name: "South",
          academic_year: "2026",
          status: "active",
        },
        subject_enrollments: [
          { id: "sub-1", subject_name: "Mathematics", status: "active" },
          { id: "sub-2", subject_name: "English", status: "active" },
        ],
        timetable_enrollments: [
          { id: "slot-1", day_of_week: "Monday", starts_at: "08:00", ends_at: "08:40", status: "active" },
        ],
        guardian_link: {
          id: "guardian-1",
          display_name: "Parent Ready",
          email: "parent@example.test",
          status: "invited",
        },
        fee_invoice: {
          id: "invoice-1",
          invoice_number: "SF-20260513-001",
          description: "Term 1 opening fees",
          status: "open",
          amount_due_minor: "250000",
          amount_paid_minor: "0",
          currency_code: "KES",
          due_date: "2026-05-27",
        },
        application_status: "registered",
      },
    } as never);

    expect(summary).toEqual({
      studentId: "stu-88",
      studentName: "Lifecycle Ready",
      admissionNumber: "ADM-G8-088",
      applicationStatus: "registered",
      academicSummary: "Grade 8 South for 2026 with 2 subjects and 1 timetable slot",
      portalSummary: "Parent portal invitation sent to parent@example.test",
      feeSummary: "Invoice SF-20260513-001 open for KES 2,500.00",
      onboardingChecklist: [
        expect.objectContaining({
          id: "profile",
          title: "Learner profile created",
          value: "Complete",
          tone: "ok",
        }),
        expect.objectContaining({
          id: "academic",
          title: "Academic handoff ready",
          value: "Complete",
          tone: "ok",
        }),
        expect.objectContaining({
          id: "portal",
          title: "Parent portal invited",
          value: "Pending activation",
          tone: "warning",
        }),
        expect.objectContaining({
          id: "fees",
          title: "Opening fees handed off",
          value: "Complete",
          tone: "ok",
        }),
      ],
    });
  });

  test("maps live admissions students into instant topbar search items", () => {
    const items = mapAdmissionsSearchItemsFromLive("admissions", [
      {
        id: "stu-44",
        admission_number: "ADM-G6-044",
        first_name: "Achieng",
        last_name: "Otieno",
        primary_guardian_name: "Rose Otieno",
        primary_guardian_phone: "+254712998877",
        metadata: null,
        class_name: "Grade 6",
        stream_name: "Baraka",
        dormitory_name: null,
        transport_route: "Ngong Road",
      },
    ]);

    expect(items).toEqual([
      {
        id: "student-search-stu-44",
        label: "Achieng Otieno (ADM-G6-044)",
        description: "Grade 6 Baraka · Parent +254712998877",
        href: "/dashboard/admissions/admissions?view=student-directory&student=stu-44",
        kind: "student",
      },
    ]);
  });

  test("does not manufacture admissions profile financial or conduct records when live data is incomplete", () => {
    const dataset = mapAdmissionsDatasetFromLive({
      summary: {
        new_applications: 0,
        approved_students: 0,
        pending_review: 0,
        total_registered: 1,
        recent_applications: [],
        pending_approvals: [],
        missing_documents: [],
      },
      applications: [],
      students: [
        {
          id: "stu-empty",
          admission_number: "ADM-REAL-001",
          first_name: "Real",
          last_name: "Learner",
          primary_guardian_name: null,
          primary_guardian_phone: null,
          metadata: null,
          class_name: null,
          stream_name: null,
          dormitory_name: null,
          transport_route: null,
        },
      ],
      parents: [],
      documents: [],
      allocations: [],
      transfers: [],
    });

    expect(dataset.studentProfiles[0]).toMatchObject({
      fullName: "Real Learner",
      nationality: "Not recorded",
      relationship: "Not recorded",
      kcpeResults: "Not recorded",
      feesBalance: 0,
      lastPayment: "No payment history recorded.",
      billingPlan: "Not configured",
      allergies: "Not recorded",
      conditions: "Not recorded",
    });
    expect(dataset.studentProfiles[0]?.academics).toEqual([]);
    expect("attendance" in dataset.studentProfiles[0]!).toBe(false);
    expect(dataset.studentProfiles[0]?.discipline).toEqual([]);
    expect(dataset.studentProfiles[0]?.fees).toEqual([]);
  });

  test("does not manufacture admissions application academic or medical assumptions", () => {
    const dataset = mapAdmissionsDatasetFromLive({
      summary: {
        new_applications: 1,
        approved_students: 0,
        pending_review: 1,
        total_registered: 0,
        recent_applications: [],
        pending_approvals: [],
        missing_documents: [],
      },
      applications: [
        {
          id: "app-empty",
          tenant_id: "tenant-a",
          application_number: "APP-REAL-001",
          full_name: "Applicant One",
          date_of_birth: "2017-01-02",
          gender: null,
          birth_certificate_number: "BC-REAL-001",
          nationality: "Not recorded",
          previous_school: null,
          kcpe_results: null,
          cbc_level: null,
          class_applying: "Grade 4",
          parent_name: "Guardian One",
          parent_phone: "+254700000001",
          parent_email: null,
          parent_occupation: null,
          relationship: "Guardian",
          allergies: null,
          conditions: null,
          emergency_contact: null,
          status: "pending",
          interview_date: null,
          review_notes: null,
          approved_at: null,
          admitted_student_id: null,
          created_at: "2026-05-12T08:00:00.000Z",
          updated_at: "2026-05-12T08:00:00.000Z",
        },
      ],
      students: [],
      parents: [],
      documents: [],
      allocations: [],
      transfers: [],
    });

    expect(dataset.applications[0]).toMatchObject({
      applicantName: "Applicant One",
      gender: "Not recorded",
      previousSchool: "Not provided",
      kcpeResults: "Not recorded",
      cbcLevel: "Not recorded",
      allergies: "Not recorded",
      conditions: "Not recorded",
      emergencyContact: "Not recorded",
    });
  });

  test("does not manufacture admissions detail assumptions when a live profile is incomplete", () => {
    const profile = mapAdmissionsStudentProfileFromLive({
      student: {
        id: "stu-empty-detail",
        admission_number: "ADM-REAL-002",
        first_name: "Verified",
        last_name: "Learner",
        date_of_birth: null,
        gender: null,
        primary_guardian_name: null,
        primary_guardian_phone: null,
        metadata: null,
      },
      allocation: undefined,
      documents: [],
    });

    expect(profile).toMatchObject({
      fullName: "Verified Learner",
      nationality: "Not recorded",
      relationship: "Not recorded",
      kcpeResults: "Not recorded",
      allergies: "Not recorded",
      conditions: "Not recorded",
      emergencyContact: "Not recorded",
      feesBalance: 0,
      lastPayment: "No payment history recorded.",
      billingPlan: "Not configured",
    });
    expect(profile.academics).toEqual([]);
    expect("attendance" in profile).toBe(false);
    expect(profile.discipline).toEqual([]);
    expect(profile.fees).toEqual([]);
  });

  test("builds admissions document uploads from the original selected files", () => {
    const birthCertificate = new File(["birth certificate"], "ian-birth-certificate.pdf", {
      type: "application/pdf",
    });
    const passportPhoto = new File(["photo"], "ian-passport-photo.jpg", {
      type: "image/jpeg",
    });
    const reportForm = new File(["report"], "ian-report-form.pdf", {
      type: "application/pdf",
    });

    const uploads = buildAdmissionDocumentUploads({
      birthCertificateFileName: "ian-birth-certificate.pdf",
      birthCertificateFile: birthCertificate,
      passportPhotoFileName: "ian-passport-photo.jpg",
      passportPhotoFile: passportPhoto,
      reportFormsFileName: "ian-report-form.pdf",
      reportFormsFile: reportForm,
    });

    expect(uploads).toEqual([
      {
        document_type: "Birth certificate",
        file: birthCertificate,
        file_name: "ian-birth-certificate.pdf",
      },
      {
        document_type: "Passport photo",
        file: passportPhoto,
        file_name: "ian-passport-photo.jpg",
      },
      {
        document_type: "Previous report forms",
        file: reportForm,
        file_name: "ian-report-form.pdf",
      },
    ]);
  });

  test("maps inventory backend report payloads into export-aware report cards", () => {
    const reports = mapInventoryReportsFromLive({
      stock_valuation: [
        {
          item_name: "A4 Printing Paper",
          sku: "STAT-A4-001",
          quantity_on_hand: 18,
          unit_price: 650,
          total_value: 11700,
        },
      ],
      low_stock_report: [
        {
          item_name: "A4 Printing Paper",
          sku: "STAT-A4-001",
          quantity_on_hand: 18,
          reorder_level: 25,
        },
      ],
      movement_history: [
        {
          movement_type: "stock_out",
          movement_count: 14,
        },
      ],
      supplier_purchases: [
        {
          supplier_name: "Crown Office Supplies",
          purchase_orders: 3,
          total_spend: 19500,
        },
      ],
      stock_reconciliation: [
        {
          item_name: "A4 Printing Paper",
          sku: "STAT-A4-001",
          item_quantity_on_hand: 18,
          location_quantity_on_hand: 17,
          variance_quantity: 1,
          status: "mismatch",
        },
      ],
    });

    expect(reports[0]).toMatchObject({
      id: "report-stock-valuation",
      serverExportId: "stock-valuation",
      filename: "inventory-stock-valuation.csv",
      rows: [[
        "A4 Printing Paper",
        "STAT-A4-001",
        "18",
        formatCurrency(650, false),
        formatCurrency(11700, false),
      ]],
    });
    expect(reports[3]).toMatchObject({
      id: "report-supplier-purchases",
      serverExportId: "supplier-purchases",
      headers: ["Supplier", "Purchase Orders", "Total Spend"],
      rows: [["Crown Office Supplies", "3", formatCurrency(19500, false)]],
    });
    expect(reports[4]).toMatchObject({
      id: "report-stock-reconciliation",
      serverExportId: "stock-reconciliation",
      headers: ["Item", "SKU", "Item Qty", "Location Qty", "Variance", "Status"],
      rows: [["A4 Printing Paper", "STAT-A4-001", "18", "17", "1", "mismatch"]],
    });
  });
});
