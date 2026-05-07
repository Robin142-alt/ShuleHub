import { formatCurrency } from "@/lib/dashboard/format";
import {
  buildAdmissionDocumentUploads,
  mapAdmissionsDatasetFromLive,
  mapAdmissionsSearchItemsFromLive,
  mapAdmissionsStudentProfileFromLive,
} from "@/lib/modules/admissions-live";
import {
  mapInventoryDatasetFromLive,
  mapInventoryReportsFromLive,
} from "@/lib/modules/inventory-live";

describe("module live adapters", () => {
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
      manager: "Academic Office",
      storageZones: "Admin Store, Block A",
    });
    expect(dataset.items[0]).toMatchObject({
      name: "A4 Printing Paper",
      supplier: "Crown Office Supplies",
    });
    expect(dataset.suppliers[0]).toMatchObject({
      county: "Nairobi",
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
      attendance: [
        {
          attendance_date: "2026-05-04",
          status: "Present",
          notes: "Orientation complete",
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
    expect(profile.attendance[0]).toMatchObject({
      status: "Present",
    });
    expect(profile.fees.length).toBeGreaterThan(0);
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

  test("maps inventory backend report payloads into exportable report cards", () => {
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
    });

    expect(reports[0]).toMatchObject({
      id: "report-stock-valuation",
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
      headers: ["Supplier", "Purchase Orders", "Total Spend"],
      rows: [["Crown Office Supplies", "3", formatCurrency(19500, false)]],
    });
  });
});
