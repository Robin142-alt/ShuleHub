import {
  requestDashboardApi,
  type LiveAuthSession,
} from "@/lib/dashboard/api-client";
import type { DashboardRole, StatusTone } from "@/lib/dashboard/types";
import {
  buildAdmissionsSearchItems,
  type AdmissionApplication,
  type AdmissionsDataset,
  type AdmissionsDocument,
  type AdmissionsStudentProfile,
  type AdmissionsTransfer,
  type ClassAllocation,
  type ParentDirectoryEntry,
  type StudentAcademicLine,
  type StudentDirectoryEntry,
  type StudentFeesLine,
} from "@/lib/modules/admissions-data";

export interface AdmissionDocumentUploadInput {
  birthCertificateFileName: string;
  birthCertificateFile: File | null;
  passportPhotoFileName: string;
  passportPhotoFile: File | null;
  reportFormsFileName?: string;
  reportFormsFile?: File | null;
}

export function buildAdmissionDocumentUploads(input: AdmissionDocumentUploadInput) {
  const uploads: Array<{
    document_type: string;
    file: File;
    file_name: string;
  }> = [];

  if (input.birthCertificateFile && input.birthCertificateFileName.trim()) {
    uploads.push({
      document_type: "Birth certificate",
      file: input.birthCertificateFile,
      file_name: input.birthCertificateFileName.trim(),
    });
  }

  if (input.passportPhotoFile && input.passportPhotoFileName.trim()) {
    uploads.push({
      document_type: "Passport photo",
      file: input.passportPhotoFile,
      file_name: input.passportPhotoFileName.trim(),
    });
  }

  if (input.reportFormsFile && input.reportFormsFileName?.trim()) {
    uploads.push({
      document_type: "Previous report forms",
      file: input.reportFormsFile,
      file_name: input.reportFormsFileName.trim(),
    });
  }

  return uploads;
}

export interface LiveAdmissionsSummary {
  new_applications: number;
  approved_students: number;
  pending_review: number;
  total_registered: number;
  recent_applications: Array<Record<string, unknown>>;
  pending_approvals: Array<Record<string, unknown>>;
  missing_documents: Array<{
    application_id?: string;
    application_number: string;
    full_name: string;
    uploaded_documents: number;
  }>;
}

export interface LiveAdmissionApplication {
  id: string;
  tenant_id: string;
  application_number: string;
  full_name: string;
  date_of_birth: string;
  gender?: string | null;
  birth_certificate_number: string;
  nationality: string;
  previous_school?: string | null;
  kcpe_results?: string | null;
  cbc_level?: string | null;
  class_applying: string;
  parent_name: string;
  parent_phone: string;
  parent_email?: string | null;
  parent_occupation?: string | null;
  relationship: string;
  allergies?: string | null;
  conditions?: string | null;
  emergency_contact?: string | null;
  status: "pending" | "interview" | "approved" | "rejected" | "registered";
  interview_date?: string | null;
  review_notes?: string | null;
  approved_at?: string | null;
  admitted_student_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LiveAdmissionsStudent {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  primary_guardian_name?: string | null;
  primary_guardian_phone?: string | null;
  metadata?: Record<string, unknown> | null;
  class_name?: string | null;
  stream_name?: string | null;
  dormitory_name?: string | null;
  transport_route?: string | null;
}

export interface LiveAdmissionsParent {
  parent_name: string;
  parent_phone: string;
  parent_email?: string | null;
  parent_occupation?: string | null;
  relationship?: string | null;
}

export interface LiveAdmissionsDocument {
  id: string;
  application_id?: string | null;
  student_id?: string | null;
  document_type: string;
  original_file_name: string;
  verification_status: "pending" | "verified" | "rejected";
  created_at?: string | null;
  application_number?: string | null;
  applicant_name?: string | null;
  admission_number?: string | null;
  student_name?: string | null;
}

export interface LiveAdmissionsAllocation {
  id: string;
  student_id?: string | null;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string;
  stream_name: string;
  dormitory_name?: string | null;
  transport_route?: string | null;
  effective_from: string;
}

export interface LiveAdmissionsTransferRecord {
  id: string;
  student_id?: string | null;
  application_id?: string | null;
  transfer_type: string;
  school_name: string;
  reason: string;
  requested_on: string;
  status: "pending" | "completed";
  notes?: string | null;
}

export interface LiveAdmissionsStudentProfileResponse {
  student: {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string | null;
    gender?: string | null;
    primary_guardian_name?: string | null;
    primary_guardian_phone?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  allocation?: {
    class_name: string;
    stream_name: string;
    dormitory_name?: string | null;
    transport_route?: string | null;
    effective_from?: string | null;
  } | null;
  academic_enrollment?: {
    id: string;
    class_name: string;
    stream_name: string;
    academic_year: string;
    status: string;
    enrolled_at?: string | null;
  } | null;
  subject_enrollments?: Array<{
    id: string;
    subject_code?: string | null;
    subject_name: string;
    status: string;
  }>;
  timetable_enrollments?: Array<{
    id: string;
    day_of_week: string;
    starts_at: string;
    ends_at: string;
    subject_name?: string | null;
    room_name?: string | null;
    status: string;
  }>;
  lifecycle_events?: Array<{
    id: string;
    event_type: "promotion" | "graduation" | "archive" | string;
    from_class_name?: string | null;
    from_stream_name?: string | null;
    from_academic_year?: string | null;
    to_class_name?: string | null;
    to_stream_name?: string | null;
    to_academic_year?: string | null;
    reason?: string | null;
    created_at?: string | null;
  }>;
  guardian_links?: Array<{
    id: string;
    display_name: string;
    email: string;
    phone?: string | null;
    relationship?: string | null;
    status: "invited" | "active" | "revoked" | string;
    user_id?: string | null;
    invitation_id?: string | null;
    accepted_at?: string | null;
  }>;
  fee_assignment?: {
    id: string;
    status: string;
    amount_minor: string | number;
    currency_code: string;
    description?: string | null;
    term_name?: string | null;
    academic_year?: string | null;
  } | null;
  fee_invoice?: {
    id: string;
    assignment_id?: string | null;
    invoice_number: string;
    status: string;
    description?: string | null;
    currency_code: string;
    amount_due_minor: string | number;
    amount_paid_minor: string | number;
    due_date?: string | null;
  } | null;
  documents: Array<{
    id: string;
    document_type: string;
    original_file_name: string;
    verification_status: "pending" | "verified" | "rejected";
    created_at?: string | null;
  }>;
}

export interface LiveAdmissionRegistrationResponse {
  student?: {
    id?: string;
    admission_number?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null;
  allocation?: {
    class_name?: string | null;
    stream_name?: string | null;
  } | null;
  academic_enrollment?: LiveAdmissionsStudentProfileResponse["academic_enrollment"];
  subject_enrollments?: LiveAdmissionsStudentProfileResponse["subject_enrollments"];
  timetable_enrollments?: LiveAdmissionsStudentProfileResponse["timetable_enrollments"];
  parent_invitation?: {
    email?: string | null;
    invitee_email?: string | null;
    status?: string | null;
  } | null;
  guardian_link?: {
    id?: string;
    display_name?: string | null;
    email?: string | null;
    status?: string | null;
  } | null;
  fee_assignment?: LiveAdmissionsStudentProfileResponse["fee_assignment"];
  fee_invoice?: LiveAdmissionsStudentProfileResponse["fee_invoice"];
  application_status?: string | null;
}

export interface AdmissionRegistrationSummary {
  studentId?: string;
  studentName: string;
  admissionNumber: string;
  applicationStatus: string;
  academicSummary: string;
  portalSummary: string;
  feeSummary: string;
  onboardingChecklist: AdmissionRegistrationChecklistItem[];
}

export interface AdmissionRegistrationChecklistItem {
  id: "profile" | "academic" | "portal" | "fees";
  title: string;
  detail: string;
  value: string;
  tone: StatusTone;
}

export interface AdmissionRegistrationSummaryInput {
  fallback: {
    applicantName: string;
    admissionNumber: string;
    className: string;
    streamName?: string;
    parentEmail?: string;
  };
  response?: LiveAdmissionRegistrationResponse | null;
}

export interface LiveAdmissionAcademicLifecycleResponse {
  lifecycle_event?: {
    id?: string;
    event_type?: "promotion" | "graduation" | "archive" | string;
  } | null;
  academic_enrollment?: {
    id?: string;
    class_name?: string | null;
    stream_name?: string | null;
    academic_year?: string | null;
    status?: string | null;
  } | null;
  allocation?: {
    class_name?: string | null;
    stream_name?: string | null;
  } | null;
  student_status?: string | null;
}

export interface LiveAdmissionsReportExportResponse {
  report_id: string;
  title: string;
  filename: string;
  content_type: string;
  generated_at: string;
  row_count: number;
  checksum_sha256: string;
  csv: string;
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) {
    return "-";
  }

  const normalized = value.replace("T", " ");
  return withTime ? normalized.slice(0, 16) : normalized.slice(0, 10);
}

function buildFullName(input: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}) {
  if (input.full_name?.trim()) {
    return input.full_name.trim();
  }

  return `${input.first_name ?? ""} ${input.last_name ?? ""}`.trim();
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatRegistrationMoney(currencyCode: string | null | undefined, amountMinor: string | number) {
  const amount = parseMinorAmount(amountMinor);
  const currency = currencyCode?.trim().toUpperCase() || "KES";

  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildAdmissionRegistrationSummary({
  fallback,
  response,
}: AdmissionRegistrationSummaryInput): AdmissionRegistrationSummary {
  const student = response?.student ?? {};
  const enrollment = response?.academic_enrollment;
  const subjectCount = response?.subject_enrollments?.length ?? 0;
  const timetableCount = response?.timetable_enrollments?.length ?? 0;
  const guardianEmail = response?.guardian_link?.email?.trim();
  const invitationEmail =
    response?.parent_invitation?.email?.trim()
    || response?.parent_invitation?.invitee_email?.trim();
  const fallbackParentEmail = fallback.parentEmail?.trim();
  const studentName = buildFullName(student) || fallback.applicantName;
  const admissionNumber = student.admission_number?.trim() || fallback.admissionNumber;
  const className =
    enrollment?.class_name?.trim()
    || response?.allocation?.class_name?.trim()
    || fallback.className;
  const streamName =
    enrollment?.stream_name?.trim()
    || response?.allocation?.stream_name?.trim()
    || fallback.streamName?.trim()
    || "Pending";
  const academicSummary = enrollment
    ? `${className} ${streamName} for ${enrollment.academic_year} with ${pluralize(subjectCount, "subject")} and ${pluralize(timetableCount, "timetable slot")}`
    : `${className} ${streamName} academic handoff pending`;

  let portalSummary = "No parent portal invitation recorded.";
  if (response?.guardian_link?.status === "active" && guardianEmail) {
    portalSummary = `Parent portal active for ${guardianEmail}`;
  } else if (guardianEmail) {
    portalSummary = `Parent portal invitation sent to ${guardianEmail}`;
  } else if (invitationEmail) {
    portalSummary = `Parent portal invitation sent to ${invitationEmail}`;
  } else if (fallbackParentEmail) {
    portalSummary = `Parent portal invitation prepared for ${fallbackParentEmail}`;
  }

  let feeSummary = "Fee handoff not configured.";
  let feesReady = false;
  if (response?.fee_invoice) {
    feesReady = true;
    feeSummary = `Invoice ${response.fee_invoice.invoice_number} ${response.fee_invoice.status} for ${formatRegistrationMoney(
      response.fee_invoice.currency_code,
      response.fee_invoice.amount_due_minor,
    )}`;
  } else if (response?.fee_assignment) {
    feesReady = true;
    feeSummary = `Fee assignment ${response.fee_assignment.status} for ${formatRegistrationMoney(
      response.fee_assignment.currency_code,
      response.fee_assignment.amount_minor,
    )}`;
  }
  const academicReady = Boolean(enrollment);
  const portalActive = response?.guardian_link?.status === "active" && Boolean(guardianEmail);
  const portalInvited = portalActive || Boolean(guardianEmail || invitationEmail || fallbackParentEmail);

  return {
    studentId: student.id,
    studentName,
    admissionNumber,
    applicationStatus: response?.application_status?.trim() || "registered",
    academicSummary,
    portalSummary,
    feeSummary,
    onboardingChecklist: [
      {
        id: "profile",
        title: "Learner profile created",
        detail: `${studentName} is registered as ${admissionNumber}.`,
        value: "Complete",
        tone: "ok",
      },
      {
        id: "academic",
        title: academicReady ? "Academic handoff ready" : "Academic handoff pending",
        detail: academicSummary,
        value: academicReady ? "Complete" : "Pending setup",
        tone: academicReady ? "ok" : "warning",
      },
      {
        id: "portal",
        title: portalActive
          ? "Parent portal active"
          : portalInvited
            ? "Parent portal invited"
            : "Parent portal pending",
        detail: portalSummary,
        value: portalActive ? "Complete" : portalInvited ? "Pending activation" : "Not invited",
        tone: portalActive ? "ok" : portalInvited ? "warning" : "critical",
      },
      {
        id: "fees",
        title: feesReady ? "Opening fees handed off" : "Fee handoff pending",
        detail: feeSummary,
        value: feesReady ? "Complete" : "Pending setup",
        tone: feesReady ? "ok" : "warning",
      },
    ],
  };
}

function getDocumentOwnerType(document: LiveAdmissionsDocument): "application" | "student" {
  return document.student_id || document.admission_number ? "student" : "application";
}

function getAdmissionsMetadata(metadata?: Record<string, unknown> | null) {
  const admissions =
    metadata && typeof metadata === "object" && "admissions" in metadata
      ? (metadata.admissions as Record<string, unknown>)
      : undefined;

  return admissions ?? {};
}

function getGuardianMetadata(metadata?: Record<string, unknown> | null) {
  const admissions = getAdmissionsMetadata(metadata);
  const guardian =
    admissions.guardian && typeof admissions.guardian === "object"
      ? (admissions.guardian as Record<string, unknown>)
      : {};

  return guardian;
}

function getMedicalMetadata(metadata?: Record<string, unknown> | null) {
  const admissions = getAdmissionsMetadata(metadata);
  const medical =
    admissions.medical && typeof admissions.medical === "object"
      ? (admissions.medical as Record<string, unknown>)
      : {};

  return medical;
}

function buildLearnerMap(
  students: LiveAdmissionsStudent[],
  applications: LiveAdmissionApplication[],
) {
  const namesByPhone = new Map<string, Set<string>>();
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const studentsByAdmission = new Map(
    students.map((student) => [student.admission_number, student]),
  );
  const applicationsById = new Map(
    applications.map((application) => [application.id, application]),
  );
  const applicationsByNumber = new Map(
    applications.map((application) => [application.application_number, application]),
  );

  students.forEach((student) => {
    const fullName = buildFullName(student);
    const phone = student.primary_guardian_phone ?? "";
    if (!phone) {
      return;
    }

    if (!namesByPhone.has(phone)) {
      namesByPhone.set(phone, new Set<string>());
    }

    namesByPhone.get(phone)?.add(fullName);
  });

  applications.forEach((application) => {
    if (!namesByPhone.has(application.parent_phone)) {
      namesByPhone.set(application.parent_phone, new Set<string>());
    }

    namesByPhone.get(application.parent_phone)?.add(application.full_name);
  });

  return {
    namesByPhone,
    studentsById,
    studentsByAdmission,
    applicationsById,
    applicationsByNumber,
  };
}

function buildStudentEntry(student: LiveAdmissionsStudent): StudentDirectoryEntry {
  return {
    id: student.id,
    fullName: buildFullName(student),
    admissionNumber: student.admission_number,
    className: student.class_name ?? "Pending",
    streamName: student.stream_name ?? "Pending",
    parentName: student.primary_guardian_name ?? "Guardian pending",
    parentPhone: student.primary_guardian_phone ?? "Not on file",
    status: student.class_name && student.stream_name ? "registered" : "pending_allocation",
    registrationDate: "On file",
  };
}

function buildStudentProfileFromLive(
  student: LiveAdmissionsStudent,
  documents: AdmissionsDocument[],
): AdmissionsStudentProfile {
  const fullName = buildFullName(student);
  const admissionsMetadata = getAdmissionsMetadata(student.metadata);
  const guardianMetadata = getGuardianMetadata(student.metadata);
  const medicalMetadata = getMedicalMetadata(student.metadata);

  return {
    id: student.id,
    fullName,
    admissionNumber: student.admission_number,
    className: student.class_name ?? "Pending",
    streamName: student.stream_name ?? "Pending",
    dormitoryName: student.dormitory_name ?? "Pending",
    transportRoute: student.transport_route ?? "Pending",
    gender: "Not recorded",
    dateOfBirth: "Not recorded",
    nationality:
      typeof admissionsMetadata.nationality === "string"
        ? admissionsMetadata.nationality
        : "Not recorded",
    parentName:
      student.primary_guardian_name
      ?? (typeof guardianMetadata.parent_name === "string" ? guardianMetadata.parent_name : null)
      ?? "Guardian pending",
    parentPhone: student.primary_guardian_phone ?? "Not on file",
    parentEmail:
      typeof guardianMetadata.parent_email === "string"
        ? guardianMetadata.parent_email
        : "",
    occupation:
      typeof guardianMetadata.parent_occupation === "string"
        ? guardianMetadata.parent_occupation
        : "Not provided",
    relationship:
      typeof guardianMetadata.relationship === "string"
        ? guardianMetadata.relationship
        : "Not recorded",
    previousSchool:
      typeof admissionsMetadata.previous_school === "string"
        ? admissionsMetadata.previous_school
        : "Not provided",
    kcpeResults:
      typeof admissionsMetadata.kcpe_results === "string"
        ? admissionsMetadata.kcpe_results
        : "Not recorded",
    cbcLevel:
      typeof admissionsMetadata.cbc_level === "string"
        ? admissionsMetadata.cbc_level
        : "Not recorded",
    registrationDate: "On file",
    applicationStatus: "registered",
    feesBalance: 0,
    lastPayment: "No payment history recorded.",
    billingPlan: "Not configured",
    portalAccessStatus: "not_invited",
    portalAccessDetail: "No parent portal invitation recorded.",
    allergies:
      typeof medicalMetadata.allergies === "string"
        ? medicalMetadata.allergies
        : "Not recorded",
    conditions:
      typeof medicalMetadata.conditions === "string"
        ? medicalMetadata.conditions
        : "Not recorded",
    emergencyContact:
      typeof medicalMetadata.emergency_contact === "string"
        ? medicalMetadata.emergency_contact
        : "Not recorded",
    academics: [],
    discipline: [],
    fees: [],
    documents: documents
      .filter((document) => document.ownerType === "student" && document.learnerName === fullName)
      .map((document) => ({
        id: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        uploadedOn: document.uploadedOn,
        verificationStatus: document.verificationStatus,
      })),
  };
}

function formatLifecycleEventType(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "Lifecycle";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildAcademicStatusLines(
  input: LiveAdmissionsStudentProfileResponse,
): StudentAcademicLine[] {
  const academicLines: StudentAcademicLine[] = [];
  const enrollment = input.academic_enrollment;
  const subjectEnrollments = input.subject_enrollments ?? [];
  const timetableEnrollments = input.timetable_enrollments ?? [];
  const latestLifecycleEvent = input.lifecycle_events?.[0];

  if (enrollment) {
    academicLines.push({
      id: `academic-enrollment-${enrollment.id}`,
      subject: "Current enrollment",
      value: `${enrollment.class_name} ${enrollment.stream_name}`.trim(),
      note: `${enrollment.academic_year} - ${enrollment.status}`,
    });
  }

  if (subjectEnrollments.length > 0) {
    academicLines.push({
      id: "academic-subject-enrollments",
      subject: "Subjects",
      value: `${subjectEnrollments.length} active`,
      note: subjectEnrollments.map((subject) => subject.subject_name).join(", "),
    });
  }

  if (timetableEnrollments.length > 0) {
    academicLines.push({
      id: "academic-timetable-enrollments",
      subject: "Timetable",
      value: `${timetableEnrollments.length} active`,
      note: timetableEnrollments
        .slice(0, 3)
        .map((slot) => `${slot.day_of_week} ${slot.starts_at}`)
        .join(", "),
    });
  }

  if (latestLifecycleEvent) {
    academicLines.push({
      id: `academic-lifecycle-${latestLifecycleEvent.id}`,
      subject: "Latest lifecycle",
      value: formatLifecycleEventType(latestLifecycleEvent.event_type),
      note:
        [
          latestLifecycleEvent.to_class_name,
          latestLifecycleEvent.to_stream_name,
          latestLifecycleEvent.to_academic_year,
        ]
          .filter(Boolean)
          .join(" ")
        || latestLifecycleEvent.reason
        || formatDate(latestLifecycleEvent.created_at),
    });
  }

  return academicLines;
}

function parseMinorAmount(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function buildPortalAccessStatus(input: LiveAdmissionsStudentProfileResponse) {
  const guardianLinks = input.guardian_links ?? [];
  const activeGuardian = guardianLinks.find((guardian) => guardian.status === "active");
  const invitedGuardian = guardianLinks.find((guardian) => guardian.status === "invited");
  const fallbackEmail = getGuardianMetadata(input.student.metadata).parent_email;

  if (activeGuardian) {
    return {
      status: "active" as const,
      detail: `Parent portal active for ${activeGuardian.email}`,
    };
  }

  if (invitedGuardian) {
    return {
      status: "invited" as const,
      detail: `Parent invitation sent to ${invitedGuardian.email}`,
    };
  }

  return {
    status: "not_invited" as const,
    detail:
      typeof fallbackEmail === "string" && fallbackEmail.trim()
        ? `No accepted parent portal invite for ${fallbackEmail}`
        : "No parent portal invitation recorded.",
  };
}

function buildFeeHandoffStatus(input: LiveAdmissionsStudentProfileResponse): {
  feesBalance: number;
  billingPlan: string;
  lastPayment: string;
  fees: StudentFeesLine[];
} {
  const invoice = input.fee_invoice;
  const assignment = input.fee_assignment;

  if (invoice) {
    const amountDue = parseMinorAmount(invoice.amount_due_minor);
    const amountPaid = parseMinorAmount(invoice.amount_paid_minor);
    const balance = Math.max(0, amountDue - amountPaid);
    const status = invoice.status === "paid" ? "posted" : "pending";

    return {
      feesBalance: balance,
      billingPlan: invoice.description?.trim() || assignment?.description?.trim() || "Opening invoice",
      lastPayment:
        invoice.status === "paid"
          ? "Invoice paid"
          : `Invoice ${invoice.status} - due ${formatDate(invoice.due_date)}`,
      fees: [
        {
          id: invoice.id,
          item: invoice.invoice_number,
          amount: amountDue,
          status,
        },
      ],
    };
  }

  if (assignment) {
    return {
      feesBalance: parseMinorAmount(assignment.amount_minor),
      billingPlan: assignment.description?.trim() || "Opening fee assignment",
      lastPayment: `Fee assignment ${assignment.status}`,
      fees: [
        {
          id: assignment.id,
          item: assignment.description?.trim() || "Opening fee assignment",
          amount: parseMinorAmount(assignment.amount_minor),
          status: assignment.status === "assigned" ? "pending" : "posted",
        },
      ],
    };
  }

  return {
    feesBalance: 0,
    billingPlan: "Not configured",
    lastPayment: "No payment history recorded.",
    fees: [],
  };
}

export function mapAdmissionsDatasetFromLive(input: {
  summary: LiveAdmissionsSummary;
  applications: LiveAdmissionApplication[];
  students: LiveAdmissionsStudent[];
  parents: LiveAdmissionsParent[];
  documents: LiveAdmissionsDocument[];
  allocations: LiveAdmissionsAllocation[];
  transfers: LiveAdmissionsTransferRecord[];
}): AdmissionsDataset {
  const lookup = buildLearnerMap(input.students, input.applications);

  const students = input.students.map(buildStudentEntry);

  const applications: AdmissionApplication[] = input.applications.map((application) => {
    const admittedStudent = application.admitted_student_id
      ? lookup.studentsById.get(application.admitted_student_id)
      : undefined;

    return {
      id: application.id,
      applicationNumber: application.application_number,
      applicantName: application.full_name,
      admissionNumber: admittedStudent?.admission_number ?? "PENDING",
      classApplying: application.class_applying,
      parentName: application.parent_name,
      parentPhone: application.parent_phone,
      status: application.status,
      dateApplied: formatDate(application.created_at),
      gender: application.gender ?? "Not recorded",
      dateOfBirth: application.date_of_birth,
      birthCertificateNumber: application.birth_certificate_number,
      nationality: application.nationality,
      previousSchool: application.previous_school ?? "Not provided",
      kcpeResults: application.kcpe_results ?? "Not recorded",
      cbcLevel: application.cbc_level ?? "Not recorded",
      parentEmail: application.parent_email ?? "",
      occupation: application.parent_occupation ?? "Not provided",
      relationship: application.relationship,
      allergies: application.allergies ?? "Not recorded",
      conditions: application.conditions ?? "Not recorded",
      emergencyContact: application.emergency_contact ?? "Not recorded",
      reviewNote: application.review_notes ?? "",
    };
  });

  const parents: ParentDirectoryEntry[] = input.parents.map((parent, index) => ({
    id: `parent-${index + 1}`,
    parentName: parent.parent_name,
    phone: parent.parent_phone,
    email: parent.parent_email ?? "",
    occupation: parent.parent_occupation ?? "Not provided",
    relationship: parent.relationship ?? "Guardian",
    learners: Array.from(lookup.namesByPhone.get(parent.parent_phone) ?? []).join(", ") || "On file",
  }));

  const documents: AdmissionsDocument[] = [
    ...input.documents.map((document) => {
      const matchedStudent = document.admission_number
        ? lookup.studentsByAdmission.get(document.admission_number)
        : undefined;
      const learnerName =
        document.applicant_name
        ?? document.student_name
        ?? buildFullName(matchedStudent ?? {});

      return {
        id: document.id,
        learnerName: learnerName || "Applicant on file",
        documentType: document.document_type,
        fileName: document.original_file_name,
        uploadedOn: formatDate(document.created_at, true),
        verificationStatus: document.verification_status,
        ownerType: getDocumentOwnerType(document),
        applicationId: document.application_id ?? undefined,
        applicationNumber: document.application_number ?? undefined,
        studentId: document.student_id ?? matchedStudent?.id,
        admissionNumber: document.admission_number ?? matchedStudent?.admission_number,
      };
    }),
    ...input.summary.missing_documents.map((document) => {
      const application = lookup.applicationsByNumber.get(document.application_number);

      return {
        id: `missing-${document.application_number}`,
        learnerName: document.full_name,
        documentType: "Required admissions documents",
        fileName: `${document.uploaded_documents}/3 uploaded`,
        uploadedOn: "-",
        verificationStatus: "missing" as const,
        ownerType: "application" as const,
        applicationId: document.application_id ?? application?.id,
        applicationNumber: document.application_number,
      };
    }),
  ];

  const allocations: ClassAllocation[] = input.allocations.map((allocation) => ({
    id: allocation.id,
    studentId:
      allocation.student_id
      ?? lookup.studentsByAdmission.get(allocation.admission_number)?.id
      ?? `student-${allocation.admission_number}`,
    studentName: buildFullName(allocation),
    admissionNumber: allocation.admission_number,
    className: allocation.class_name,
    streamName: allocation.stream_name,
    dormitoryName: allocation.dormitory_name ?? "Not assigned",
    transportRoute: allocation.transport_route ?? "Not assigned",
    effectiveFrom: formatDate(allocation.effective_from),
    status: "assigned",
  }));

  const transfers: AdmissionsTransfer[] = input.transfers.map((transfer) => {
    const student = transfer.student_id ? lookup.studentsById.get(transfer.student_id) : undefined;
    const application = transfer.application_id
      ? lookup.applicationsById.get(transfer.application_id)
      : undefined;

    return {
      id: transfer.id,
      learnerName: student ? buildFullName(student) : application?.full_name ?? "Learner on file",
      admissionNumber: student?.admission_number ?? "PENDING",
      direction:
        transfer.transfer_type.toLowerCase().includes("out")
          ? "outgoing"
          : "incoming",
      schoolName: transfer.school_name,
      reason: transfer.reason,
      requestedOn: formatDate(transfer.requested_on),
      status: transfer.status,
    };
  });

  const studentProfiles = input.students.map((student) =>
    buildStudentProfileFromLive(student, documents),
  );

  return {
    applications,
    students,
    parents,
    documents,
    allocations,
    transfers,
    studentProfiles,
  };
}

export function mapAdmissionsStudentProfileFromLive(
  input: LiveAdmissionsStudentProfileResponse,
): AdmissionsStudentProfile {
  const fullName = buildFullName(input.student);
  const admissionsMetadata = getAdmissionsMetadata(input.student.metadata);
  const guardianMetadata = getGuardianMetadata(input.student.metadata);
  const medicalMetadata = getMedicalMetadata(input.student.metadata);
  const portalAccess = buildPortalAccessStatus(input);
  const feeHandoff = buildFeeHandoffStatus(input);

  return {
    id: input.student.id,
    fullName,
    admissionNumber: input.student.admission_number,
    className: input.allocation?.class_name ?? "Pending",
    streamName: input.allocation?.stream_name ?? "Pending",
    dormitoryName: input.allocation?.dormitory_name ?? "Pending",
    transportRoute: input.allocation?.transport_route ?? "Pending",
    gender: input.student.gender ?? "Not recorded",
    dateOfBirth: input.student.date_of_birth ?? "Not recorded",
    nationality:
      typeof admissionsMetadata.nationality === "string"
        ? admissionsMetadata.nationality
        : "Not recorded",
    parentName:
      input.student.primary_guardian_name
      ?? (typeof guardianMetadata.parent_name === "string" ? guardianMetadata.parent_name : null)
      ?? "Guardian pending",
    parentPhone: input.student.primary_guardian_phone ?? "Not on file",
    parentEmail:
      typeof guardianMetadata.parent_email === "string"
        ? guardianMetadata.parent_email
        : "",
    occupation:
      typeof guardianMetadata.parent_occupation === "string"
        ? guardianMetadata.parent_occupation
        : "Not provided",
    relationship:
      typeof guardianMetadata.relationship === "string"
        ? guardianMetadata.relationship
        : "Not recorded",
    previousSchool:
      typeof admissionsMetadata.previous_school === "string"
        ? admissionsMetadata.previous_school
        : "Not provided",
    kcpeResults:
      typeof admissionsMetadata.kcpe_results === "string"
        ? admissionsMetadata.kcpe_results
        : "Not recorded",
    cbcLevel:
      typeof admissionsMetadata.cbc_level === "string"
        ? admissionsMetadata.cbc_level
        : "Not recorded",
    registrationDate: input.allocation?.effective_from
      ? formatDate(input.allocation.effective_from)
      : "On file",
    applicationStatus: "registered",
    feesBalance: feeHandoff.feesBalance,
    lastPayment: feeHandoff.lastPayment,
    billingPlan: feeHandoff.billingPlan,
    portalAccessStatus: portalAccess.status,
    portalAccessDetail: portalAccess.detail,
    allergies:
      typeof medicalMetadata.allergies === "string"
        ? medicalMetadata.allergies
        : "Not recorded",
    conditions:
      typeof medicalMetadata.conditions === "string"
        ? medicalMetadata.conditions
        : "Not recorded",
    emergencyContact:
      typeof medicalMetadata.emergency_contact === "string"
        ? medicalMetadata.emergency_contact
        : "Not recorded",
    academics: buildAcademicStatusLines(input),
    discipline: [],
    fees: feeHandoff.fees,
    documents: input.documents.map((document) => ({
      id: document.id,
      documentType: document.document_type,
      fileName: document.original_file_name,
      uploadedOn: formatDate(document.created_at, true),
      verificationStatus: document.verification_status,
    })),
  };
}

export function mapAdmissionsSearchItemsFromLive(
  role: DashboardRole,
  students: LiveAdmissionsStudent[],
): ReturnType<typeof buildAdmissionsSearchItems> {
  if (role === "storekeeper") {
    return [];
  }

  return students.map((student) => ({
    id: `student-search-${student.id}`,
    label: `${buildFullName(student)} (${student.admission_number})`,
    description: `${student.class_name ?? "Class pending"} ${student.stream_name ?? "Stream pending"} · Parent ${student.primary_guardian_phone ?? "Not on file"}`,
    href:
      role === "admissions"
        ? `/dashboard/admissions/admissions?view=student-directory&student=${student.id}`
        : `/dashboard/${role}/students/${student.id}`,
    kind: "student" as const,
  }));
}

function withSession<T>(
  session: LiveAuthSession,
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    body?: BodyInit | Record<string, unknown> | null;
  },
) {
  return requestDashboardApi<T>(path, {
    tenantId: session.tenantId,
    accessToken: session.accessToken,
    method: options?.method,
    body: options?.body,
  });
}

export async function fetchAdmissionsDatasetLive(session: LiveAuthSession) {
  const [summary, applications, students, parents, documents, allocations, transfers] =
    await Promise.all([
      withSession<LiveAdmissionsSummary>(session, "/admissions/summary"),
      withSession<LiveAdmissionApplication[]>(session, "/admissions/applications?limit=200"),
      withSession<LiveAdmissionsStudent[]>(session, "/admissions/students?limit=200"),
      withSession<LiveAdmissionsParent[]>(session, "/admissions/parents"),
      withSession<LiveAdmissionsDocument[]>(session, "/admissions/documents"),
      withSession<LiveAdmissionsAllocation[]>(session, "/admissions/allocations"),
      withSession<LiveAdmissionsTransferRecord[]>(session, "/admissions/transfers"),
    ]);

  return mapAdmissionsDatasetFromLive({
    summary,
    applications,
    students,
    parents,
    documents,
    allocations,
    transfers,
  });
}

export function fetchAdmissionsReportExportLive(
  session: LiveAuthSession,
  reportId: string,
) {
  return withSession<LiveAdmissionsReportExportResponse>(
    session,
    `/admissions/reports/${encodeURIComponent(reportId)}/export`,
  );
}

export function fetchAdmissionsStudentProfileLive(
  session: LiveAuthSession,
  studentId: string,
) {
  return withSession<LiveAdmissionsStudentProfileResponse>(
    session,
    `/admissions/students/${studentId}/profile`,
  );
}

export function fetchAdmissionsStudentSearchLive(session: LiveAuthSession) {
  return withSession<LiveAdmissionsStudent[]>(session, "/admissions/students?limit=100");
}

export function createAdmissionApplicationLive(
  session: LiveAuthSession,
  input: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    birth_certificate_number: string;
    nationality: string;
    previous_school?: string;
    kcpe_results?: string;
    cbc_level?: string;
    class_applying: string;
    parent_name: string;
    parent_phone: string;
    parent_email?: string;
    parent_occupation?: string;
    relationship: string;
    allergies?: string;
    conditions?: string;
    emergency_contact?: string;
  },
) {
  return withSession<LiveAdmissionApplication>(session, "/admissions/applications", {
    method: "POST",
    body: input,
  });
}

export function updateAdmissionApplicationLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    status?: "pending" | "interview" | "approved" | "rejected" | "registered";
    review_notes?: string;
    interview_date?: string;
  },
) {
  return withSession<LiveAdmissionApplication>(
    session,
    `/admissions/applications/${applicationId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function uploadAdmissionDocumentLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    document_type: string;
    file: File | Blob;
    file_name: string;
    uploaded_by_user_id?: string;
  },
) {
  const formData = new FormData();
  formData.append("document_type", input.document_type);
  if (input.uploaded_by_user_id) {
    formData.append("uploaded_by_user_id", input.uploaded_by_user_id);
  }
  formData.append("file", input.file, input.file_name);

  return withSession(
    session,
    `/admissions/applications/${applicationId}/documents`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function registerAdmissionApplicationLive(
  session: LiveAuthSession,
  applicationId: string,
  input: {
    admission_number: string;
    class_name: string;
    stream_name: string;
    dormitory_name?: string;
    transport_route?: string;
  },
) {
  return withSession<LiveAdmissionRegistrationResponse>(
    session,
    `/admissions/applications/${applicationId}/register`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function advanceAdmissionsStudentAcademicLifecycleLive(
  session: LiveAuthSession,
  studentId: string,
  input: {
    action: "promotion" | "graduation" | "archive";
    class_name?: string;
    stream_name?: string;
    reason?: string;
    notes?: string;
  },
) {
  return withSession<LiveAdmissionAcademicLifecycleResponse>(
    session,
    `/admissions/students/${studentId}/academic-lifecycle`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function updateAdmissionDocumentVerificationLive(
  session: LiveAuthSession,
  documentId: string,
  input: {
    verification_status: "pending" | "verified" | "rejected";
  },
) {
  return withSession(
    session,
    `/admissions/documents/${documentId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function createAdmissionsAllocationLive(
  session: LiveAuthSession,
  studentId: string,
  input: {
    class_name: string;
    stream_name: string;
    dormitory_name?: string;
    transport_route?: string;
    effective_from?: string;
  },
) {
  return withSession(session, `/admissions/allocations/${studentId}`, {
    method: "POST",
    body: input,
  });
}

export function createAdmissionsTransferLive(
  session: LiveAuthSession,
  input: {
    student_id?: string;
    application_id?: string;
    transfer_type: string;
    school_name: string;
    reason: string;
    requested_on?: string;
    notes?: string;
  },
) {
  return withSession(session, "/admissions/transfers", {
    method: "POST",
    body: input,
  });
}
