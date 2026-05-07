import { formatCurrency } from "@/lib/dashboard/format";
import type { DashboardRole, StatusTone } from "@/lib/dashboard/types";

export interface ModuleShellSectionData {
  id: string;
  label: string;
  description: string;
  badge?: string;
  tone?: StatusTone;
}

export interface StatStripDataItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone?: StatusTone;
}

export type AdmissionsSectionId =
  | "dashboard"
  | "applications"
  | "new-registration"
  | "student-directory"
  | "parent-information"
  | "documents"
  | "class-allocation"
  | "transfers"
  | "reports";

export type ApplicationStatus =
  | "pending"
  | "interview"
  | "approved"
  | "rejected"
  | "registered";

export type DocumentVerificationStatus = "pending" | "verified" | "rejected" | "missing";
export type AllocationStatus = "pending" | "assigned";
export type TransferDirection = "incoming" | "outgoing";

export interface AdmissionApplication {
  id: string;
  applicationNumber: string;
  applicantName: string;
  admissionNumber: string;
  classApplying: string;
  parentName: string;
  parentPhone: string;
  status: ApplicationStatus;
  dateApplied: string;
  gender: string;
  dateOfBirth: string;
  birthCertificateNumber: string;
  nationality: string;
  previousSchool: string;
  kcpeResults: string;
  cbcLevel: string;
  parentEmail: string;
  occupation: string;
  relationship: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  reviewNote: string;
}

export interface StudentDirectoryEntry {
  id: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  parentName: string;
  parentPhone: string;
  status: "registered" | "pending_allocation";
  registrationDate: string;
}

export interface ParentDirectoryEntry {
  id: string;
  parentName: string;
  phone: string;
  email: string;
  occupation: string;
  relationship: string;
  learners: string;
}

export interface AdmissionsDocument {
  id: string;
  learnerName: string;
  documentType: string;
  fileName: string;
  uploadedOn: string;
  verificationStatus: DocumentVerificationStatus;
  ownerType: "application" | "student";
}

export interface ClassAllocation {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  dormitoryName: string;
  transportRoute: string;
  effectiveFrom: string;
  status: AllocationStatus;
}

export interface AdmissionsTransfer {
  id: string;
  learnerName: string;
  admissionNumber: string;
  direction: TransferDirection;
  schoolName: string;
  reason: string;
  requestedOn: string;
  status: "pending" | "completed";
}

export interface StudentFeesLine {
  id: string;
  item: string;
  amount: number;
  status: "posted" | "pending";
}

export interface StudentAcademicLine {
  id: string;
  subject: string;
  value: string;
  note: string;
}

export interface StudentAttendanceLine {
  id: string;
  date: string;
  status: string;
  note: string;
}

export interface StudentDisciplineLine {
  id: string;
  date: string;
  entry: string;
  status: string;
}

export interface StudentProfileDocument {
  id: string;
  documentType: string;
  fileName: string;
  uploadedOn: string;
  verificationStatus: DocumentVerificationStatus;
}

export interface AdmissionsStudentProfile {
  id: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  streamName: string;
  dormitoryName: string;
  transportRoute: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  occupation: string;
  relationship: string;
  previousSchool: string;
  kcpeResults: string;
  cbcLevel: string;
  registrationDate: string;
  applicationStatus: ApplicationStatus;
  feesBalance: number;
  lastPayment: string;
  billingPlan: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  academics: StudentAcademicLine[];
  attendance: StudentAttendanceLine[];
  discipline: StudentDisciplineLine[];
  fees: StudentFeesLine[];
  documents: StudentProfileDocument[];
}

export interface AdmissionsReportCard {
  id: string;
  title: string;
  description: string;
  filename: string;
  headers: string[];
  rows: string[][];
}

export interface AdmissionsDataset {
  applications: AdmissionApplication[];
  students: StudentDirectoryEntry[];
  parents: ParentDirectoryEntry[];
  documents: AdmissionsDocument[];
  allocations: ClassAllocation[];
  transfers: AdmissionsTransfer[];
  studentProfiles: AdmissionsStudentProfile[];
}

const baseApplications: AdmissionApplication[] = [
  {
    id: "app-001",
    applicationNumber: "APP-20260504-118",
    applicantName: "Brenda Atieno",
    admissionNumber: "ADM-G7-118",
    classApplying: "Grade 7",
    parentName: "Janet Atieno",
    parentPhone: "+254 712 300 401",
    status: "registered",
    dateApplied: "2026-05-04",
    gender: "Female",
    dateOfBirth: "2014-02-19",
    birthCertificateNumber: "BC-448211",
    nationality: "Kenyan",
    previousSchool: "Lakeview Junior School",
    kcpeResults: "368 marks",
    cbcLevel: "Grade 6 complete",
    parentEmail: "janet.atieno@gmail.com",
    occupation: "Clinical officer",
    relationship: "Mother",
    allergies: "Peanuts",
    conditions: "None",
    emergencyContact: "+254 722 911 404",
    reviewNote: "Interview complete and family orientation done.",
  },
  {
    id: "app-002",
    applicationNumber: "APP-20260503-112",
    applicantName: "Ian Mwangi",
    admissionNumber: "PENDING",
    classApplying: "Grade 4",
    parentName: "Paul Mwangi",
    parentPhone: "+254 723 111 819",
    status: "pending",
    dateApplied: "2026-05-03",
    gender: "Male",
    dateOfBirth: "2017-09-13",
    birthCertificateNumber: "BC-667140",
    nationality: "Kenyan",
    previousSchool: "Roysambu Christian Academy",
    kcpeResults: "N/A",
    cbcLevel: "Grade 3 complete",
    parentEmail: "paul.mwangi@yahoo.com",
    occupation: "Project manager",
    relationship: "Father",
    allergies: "None",
    conditions: "Asthma",
    emergencyContact: "+254 733 311 881",
    reviewNote: "Passport photo missing from file.",
  },
  {
    id: "app-003",
    applicationNumber: "APP-20260503-115",
    applicantName: "Mercy Chebet",
    admissionNumber: "ADM-G8-046",
    classApplying: "Grade 8",
    parentName: "Rose Chebet",
    parentPhone: "+254 711 441 099",
    status: "approved",
    dateApplied: "2026-05-03",
    gender: "Female",
    dateOfBirth: "2012-11-09",
    birthCertificateNumber: "BC-774012",
    nationality: "Kenyan",
    previousSchool: "Kericho Hills School",
    kcpeResults: "380 marks",
    cbcLevel: "Grade 7 complete",
    parentEmail: "rchebet@gmail.com",
    occupation: "Lecturer",
    relationship: "Mother",
    allergies: "None",
    conditions: "None",
    emergencyContact: "+254 701 440 203",
    reviewNote: "Ready for admission number confirmation and allocation.",
  },
  {
    id: "app-004",
    applicationNumber: "APP-20260502-108",
    applicantName: "Hassan Noor",
    admissionNumber: "PENDING",
    classApplying: "Grade 5",
    parentName: "Amina Noor",
    parentPhone: "+254 721 889 440",
    status: "interview",
    dateApplied: "2026-05-02",
    gender: "Male",
    dateOfBirth: "2016-04-18",
    birthCertificateNumber: "BC-902113",
    nationality: "Kenyan",
    previousSchool: "Eastleigh Education Centre",
    kcpeResults: "N/A",
    cbcLevel: "Grade 4 complete",
    parentEmail: "amina.noor@mail.com",
    occupation: "Trader",
    relationship: "Mother",
    allergies: "Seafood",
    conditions: "None",
    emergencyContact: "+254 721 800 310",
    reviewNote: "Interview scheduled for Tuesday afternoon.",
  },
  {
    id: "app-005",
    applicationNumber: "APP-20260501-104",
    applicantName: "Sheila Akinyi",
    admissionNumber: "N/A",
    classApplying: "Grade 9",
    parentName: "Daniel Ouma",
    parentPhone: "+254 724 555 120",
    status: "rejected",
    dateApplied: "2026-05-01",
    gender: "Female",
    dateOfBirth: "2011-06-24",
    birthCertificateNumber: "BC-553010",
    nationality: "Kenyan",
    previousSchool: "Migosi Academy",
    kcpeResults: "289 marks",
    cbcLevel: "Grade 8 complete",
    parentEmail: "d.ouma@mail.com",
    occupation: "Driver",
    relationship: "Father",
    allergies: "None",
    conditions: "None",
    emergencyContact: "+254 710 100 887",
    reviewNote: "Class level unavailable and application deferred.",
  },
  {
    id: "app-006",
    applicationNumber: "APP-20260430-098",
    applicantName: "Daniel Kiptoo",
    admissionNumber: "ADM-G6-082",
    classApplying: "Grade 6",
    parentName: "Leah Kiptoo",
    parentPhone: "+254 733 991 240",
    status: "registered",
    dateApplied: "2026-04-30",
    gender: "Male",
    dateOfBirth: "2015-08-14",
    birthCertificateNumber: "BC-330119",
    nationality: "Kenyan",
    previousSchool: "Hilltop Academy",
    kcpeResults: "N/A",
    cbcLevel: "Grade 5 complete",
    parentEmail: "leah.kiptoo@gmail.com",
    occupation: "Farmer",
    relationship: "Mother",
    allergies: "None",
    conditions: "None",
    emergencyContact: "+254 717 222 118",
    reviewNote: "Transport route assigned and welcome pack issued.",
  },
];

const baseStudents: StudentDirectoryEntry[] = [
  {
    id: "stu-001",
    fullName: "Brenda Atieno",
    admissionNumber: "ADM-G7-118",
    className: "Grade 7",
    streamName: "Hope",
    parentName: "Janet Atieno",
    parentPhone: "+254 712 300 401",
    status: "registered",
    registrationDate: "2026-05-04",
  },
  {
    id: "stu-002",
    fullName: "Mercy Chebet",
    admissionNumber: "ADM-G8-046",
    className: "Grade 8",
    streamName: "Imani",
    parentName: "Rose Chebet",
    parentPhone: "+254 711 441 099",
    status: "pending_allocation",
    registrationDate: "2026-05-03",
  },
  {
    id: "stu-003",
    fullName: "Daniel Kiptoo",
    admissionNumber: "ADM-G6-082",
    className: "Grade 6",
    streamName: "Baraka",
    parentName: "Leah Kiptoo",
    parentPhone: "+254 733 991 240",
    status: "registered",
    registrationDate: "2026-04-30",
  },
  {
    id: "stu-004",
    fullName: "Faith Muthoni",
    admissionNumber: "ADM-PP2-031",
    className: "PP2",
    streamName: "Tulip",
    parentName: "James Muthoni",
    parentPhone: "+254 720 112 211",
    status: "registered",
    registrationDate: "2026-04-28",
  },
  {
    id: "stu-005",
    fullName: "Allan Odhiambo",
    admissionNumber: "ADM-G5-067",
    className: "Grade 5",
    streamName: "Jasiri",
    parentName: "Dorothy Odhiambo",
    parentPhone: "+254 722 891 114",
    status: "registered",
    registrationDate: "2026-04-26",
  },
];

const baseParents: ParentDirectoryEntry[] = [
  {
    id: "par-001",
    parentName: "Janet Atieno",
    phone: "+254 712 300 401",
    email: "janet.atieno@gmail.com",
    occupation: "Clinical officer",
    relationship: "Mother",
    learners: "Brenda Atieno",
  },
  {
    id: "par-002",
    parentName: "Rose Chebet",
    phone: "+254 711 441 099",
    email: "rchebet@gmail.com",
    occupation: "Lecturer",
    relationship: "Mother",
    learners: "Mercy Chebet",
  },
  {
    id: "par-003",
    parentName: "Leah Kiptoo",
    phone: "+254 733 991 240",
    email: "leah.kiptoo@gmail.com",
    occupation: "Farmer",
    relationship: "Mother",
    learners: "Daniel Kiptoo",
  },
  {
    id: "par-004",
    parentName: "James Muthoni",
    phone: "+254 720 112 211",
    email: "j.muthoni@gmail.com",
    occupation: "Procurement officer",
    relationship: "Father",
    learners: "Faith Muthoni",
  },
  {
    id: "par-005",
    parentName: "Dorothy Odhiambo",
    phone: "+254 722 891 114",
    email: "dorothy.o@gmail.com",
    occupation: "Business owner",
    relationship: "Mother",
    learners: "Allan Odhiambo",
  },
];

const baseDocuments: AdmissionsDocument[] = [
  {
    id: "doc-001",
    learnerName: "Brenda Atieno",
    documentType: "Birth certificate",
    fileName: "brenda-birth-certificate.pdf",
    uploadedOn: "2026-05-04",
    verificationStatus: "verified",
    ownerType: "student",
  },
  {
    id: "doc-002",
    learnerName: "Brenda Atieno",
    documentType: "Passport photo",
    fileName: "brenda-passport.jpg",
    uploadedOn: "2026-05-04",
    verificationStatus: "verified",
    ownerType: "student",
  },
  {
    id: "doc-003",
    learnerName: "Mercy Chebet",
    documentType: "Previous report forms",
    fileName: "mercy-report-forms.pdf",
    uploadedOn: "2026-05-03",
    verificationStatus: "pending",
    ownerType: "application",
  },
  {
    id: "doc-004",
    learnerName: "Ian Mwangi",
    documentType: "Passport photo",
    fileName: "Not uploaded",
    uploadedOn: "-",
    verificationStatus: "missing",
    ownerType: "application",
  },
  {
    id: "doc-005",
    learnerName: "Hassan Noor",
    documentType: "Birth certificate",
    fileName: "hassan-bc.pdf",
    uploadedOn: "2026-05-02",
    verificationStatus: "pending",
    ownerType: "application",
  },
  {
    id: "doc-006",
    learnerName: "Daniel Kiptoo",
    documentType: "Previous report forms",
    fileName: "daniel-report.pdf",
    uploadedOn: "2026-04-30",
    verificationStatus: "verified",
    ownerType: "student",
  },
];

const baseAllocations: ClassAllocation[] = [
  {
    id: "alloc-001",
    studentId: "stu-001",
    studentName: "Brenda Atieno",
    admissionNumber: "ADM-G7-118",
    className: "Grade 7",
    streamName: "Hope",
    dormitoryName: "Mara House",
    transportRoute: "Eastern Bypass",
    effectiveFrom: "2026-05-04",
    status: "assigned",
  },
  {
    id: "alloc-002",
    studentId: "stu-002",
    studentName: "Mercy Chebet",
    admissionNumber: "ADM-G8-046",
    className: "Grade 8",
    streamName: "Pending",
    dormitoryName: "Pending",
    transportRoute: "Pending",
    effectiveFrom: "2026-05-03",
    status: "pending",
  },
  {
    id: "alloc-003",
    studentId: "stu-003",
    studentName: "Daniel Kiptoo",
    admissionNumber: "ADM-G6-082",
    className: "Grade 6",
    streamName: "Baraka",
    dormitoryName: "None",
    transportRoute: "Ngong Road",
    effectiveFrom: "2026-04-30",
    status: "assigned",
  },
];

const baseTransfers: AdmissionsTransfer[] = [
  {
    id: "trn-001",
    learnerName: "Mercy Chebet",
    admissionNumber: "ADM-G8-046",
    direction: "incoming",
    schoolName: "Kericho Hills School",
    reason: "Parent relocation to Nairobi",
    requestedOn: "2026-05-03",
    status: "pending",
  },
  {
    id: "trn-002",
    learnerName: "Allan Odhiambo",
    admissionNumber: "ADM-G5-067",
    direction: "outgoing",
    schoolName: "Kisumu Junior Academy",
    reason: "Family transfer to Kisumu",
    requestedOn: "2026-04-26",
    status: "completed",
  },
];

const baseProfiles: AdmissionsStudentProfile[] = [
  {
    id: "stu-001",
    fullName: "Brenda Atieno",
    admissionNumber: "ADM-G7-118",
    className: "Grade 7",
    streamName: "Hope",
    dormitoryName: "Mara House",
    transportRoute: "Eastern Bypass",
    gender: "Female",
    dateOfBirth: "2014-02-19",
    nationality: "Kenyan",
    parentName: "Janet Atieno",
    parentPhone: "+254 712 300 401",
    parentEmail: "janet.atieno@gmail.com",
    occupation: "Clinical officer",
    relationship: "Mother",
    previousSchool: "Lakeview Junior School",
    kcpeResults: "368 marks",
    cbcLevel: "Grade 6 complete",
    registrationDate: "2026-05-04",
    applicationStatus: "registered",
    feesBalance: 24500,
    lastPayment: "2026-05-02 M-PESA KES 15,000",
    billingPlan: "Tuition + lunch + transport",
    allergies: "Peanuts",
    conditions: "None",
    emergencyContact: "+254 722 911 404",
    academics: [
      {
        id: "acad-001",
        subject: "English",
        value: "Meeting expectation",
        note: "Strong oral communication and written summary skills.",
      },
      {
        id: "acad-002",
        subject: "Mathematics",
        value: "Approaching expectation",
        note: "Needs support on fractions baseline transition.",
      },
      {
        id: "acad-003",
        subject: "Science",
        value: "Meeting expectation",
        note: "Practical readiness confirmed during interview.",
      },
    ],
    attendance: [
      {
        id: "att-001",
        date: "2026-05-04",
        status: "Present",
        note: "Orientation day attendance confirmed.",
      },
      {
        id: "att-002",
        date: "2026-05-05",
        status: "Present",
        note: "Reported to class and transport pick-up logged.",
      },
    ],
    discipline: [
      {
        id: "disc-001",
        date: "2026-05-04",
        entry: "No disciplinary concern on file.",
        status: "Clear",
      },
    ],
    fees: [
      {
        id: "fee-001",
        item: "Admission fee",
        amount: 10000,
        status: "posted",
      },
      {
        id: "fee-002",
        item: "Tuition deposit",
        amount: 15000,
        status: "posted",
      },
      {
        id: "fee-003",
        item: "Transport setup",
        amount: 9500,
        status: "pending",
      },
    ],
    documents: [
      {
        id: "doc-prof-001",
        documentType: "Birth certificate",
        fileName: "brenda-birth-certificate.pdf",
        uploadedOn: "2026-05-04",
        verificationStatus: "verified",
      },
      {
        id: "doc-prof-002",
        documentType: "Passport photo",
        fileName: "brenda-passport.jpg",
        uploadedOn: "2026-05-04",
        verificationStatus: "verified",
      },
      {
        id: "doc-prof-003",
        documentType: "Previous report forms",
        fileName: "brenda-report-forms.pdf",
        uploadedOn: "2026-05-04",
        verificationStatus: "pending",
      },
    ],
  },
  {
    id: "stu-002",
    fullName: "Mercy Chebet",
    admissionNumber: "ADM-G8-046",
    className: "Grade 8",
    streamName: "Pending",
    dormitoryName: "Pending",
    transportRoute: "Pending",
    gender: "Female",
    dateOfBirth: "2012-11-09",
    nationality: "Kenyan",
    parentName: "Rose Chebet",
    parentPhone: "+254 711 441 099",
    parentEmail: "rchebet@gmail.com",
    occupation: "Lecturer",
    relationship: "Mother",
    previousSchool: "Kericho Hills School",
    kcpeResults: "380 marks",
    cbcLevel: "Grade 7 complete",
    registrationDate: "2026-05-03",
    applicationStatus: "approved",
    feesBalance: 40500,
    lastPayment: "No payment posted yet",
    billingPlan: "Admission fee pending confirmation",
    allergies: "None",
    conditions: "None",
    emergencyContact: "+254 701 440 203",
    academics: [
      {
        id: "acad-101",
        subject: "English",
        value: "Exceeding expectation",
        note: "High reading fluency from transfer records.",
      },
      {
        id: "acad-102",
        subject: "Mathematics",
        value: "Meeting expectation",
        note: "Strong KCPE transition baseline.",
      },
    ],
    attendance: [
      {
        id: "att-101",
        date: "2026-05-03",
        status: "Pending start",
        note: "Registration done, class allocation not complete.",
      },
    ],
    discipline: [
      {
        id: "disc-101",
        date: "2026-05-03",
        entry: "No record",
        status: "Clear",
      },
    ],
    fees: [
      {
        id: "fee-101",
        item: "Admission fee",
        amount: 12000,
        status: "pending",
      },
      {
        id: "fee-102",
        item: "Tuition deposit",
        amount: 28500,
        status: "pending",
      },
    ],
    documents: [
      {
        id: "doc-prof-101",
        documentType: "Previous report forms",
        fileName: "mercy-report-forms.pdf",
        uploadedOn: "2026-05-03",
        verificationStatus: "pending",
      },
      {
        id: "doc-prof-102",
        documentType: "Birth certificate",
        fileName: "mercy-birth-certificate.pdf",
        uploadedOn: "2026-05-03",
        verificationStatus: "verified",
      },
    ],
  },
  {
    id: "stu-003",
    fullName: "Daniel Kiptoo",
    admissionNumber: "ADM-G6-082",
    className: "Grade 6",
    streamName: "Baraka",
    dormitoryName: "None",
    transportRoute: "Ngong Road",
    gender: "Male",
    dateOfBirth: "2015-08-14",
    nationality: "Kenyan",
    parentName: "Leah Kiptoo",
    parentPhone: "+254 733 991 240",
    parentEmail: "leah.kiptoo@gmail.com",
    occupation: "Farmer",
    relationship: "Mother",
    previousSchool: "Hilltop Academy",
    kcpeResults: "N/A",
    cbcLevel: "Grade 5 complete",
    registrationDate: "2026-04-30",
    applicationStatus: "registered",
    feesBalance: 18000,
    lastPayment: "2026-05-01 Cash Office KES 12,000",
    billingPlan: "Tuition + lunch",
    allergies: "None",
    conditions: "None",
    emergencyContact: "+254 717 222 118",
    academics: [
      {
        id: "acad-201",
        subject: "Science",
        value: "Meeting expectation",
        note: "Strong participation during entry assessment.",
      },
    ],
    attendance: [
      {
        id: "att-201",
        date: "2026-05-02",
        status: "Present",
        note: "Reported on time.",
      },
    ],
    discipline: [
      {
        id: "disc-201",
        date: "2026-04-30",
        entry: "No record",
        status: "Clear",
      },
    ],
    fees: [
      {
        id: "fee-201",
        item: "Admission fee",
        amount: 8000,
        status: "posted",
      },
      {
        id: "fee-202",
        item: "Tuition deposit",
        amount: 22000,
        status: "pending",
      },
    ],
    documents: [
      {
        id: "doc-prof-201",
        documentType: "Birth certificate",
        fileName: "daniel-bc.pdf",
        uploadedOn: "2026-04-30",
        verificationStatus: "verified",
      },
    ],
  },
];

export function createAdmissionsDataset(): AdmissionsDataset {
  return {
    applications: baseApplications.map((item) => ({ ...item })),
    students: baseStudents.map((item) => ({ ...item })),
    parents: baseParents.map((item) => ({ ...item })),
    documents: baseDocuments.map((item) => ({ ...item })),
    allocations: baseAllocations.map((item) => ({ ...item })),
    transfers: baseTransfers.map((item) => ({ ...item })),
    studentProfiles: baseProfiles.map((profile) => ({
      ...profile,
      academics: profile.academics.map((item) => ({ ...item })),
      attendance: profile.attendance.map((item) => ({ ...item })),
      discipline: profile.discipline.map((item) => ({ ...item })),
      fees: profile.fees.map((item) => ({ ...item })),
      documents: profile.documents.map((item) => ({ ...item })),
    })),
  };
}

export function buildAdmissionsModuleSections(data: AdmissionsDataset): ModuleShellSectionData[] {
  const pendingApplications = data.applications.filter((item) => item.status === "pending").length;
  const missingDocs = data.documents.filter((item) => item.verificationStatus === "missing").length;
  const pendingAllocations = data.allocations.filter((item) => item.status === "pending").length;

  return [
    {
      id: "dashboard",
      label: "Admissions Dashboard",
      description: "Approvals, missing files, and daily front-office pressure.",
    },
    {
      id: "applications",
      label: "Applications",
      description: "Review status, parent contact, and admission readiness.",
      badge: `${data.applications.length}`,
    },
    {
      id: "new-registration",
      label: "New Registration",
      description: "Capture personal, academic, guardian, medical, and file data.",
    },
    {
      id: "student-directory",
      label: "Student Directory",
      description: "Registered learners and profile records from admissions.",
      badge: `${data.students.length}`,
    },
    {
      id: "parent-information",
      label: "Parent Information",
      description: "Guardian contacts, occupation, relationship, and learner links.",
      badge: `${data.parents.length}`,
    },
    {
      id: "documents",
      label: "Documents",
      description: "Uploaded files, missing items, and verification status.",
      badge: `${missingDocs} missing`,
      tone: missingDocs > 0 ? "critical" : "ok",
    },
    {
      id: "class-allocation",
      label: "Class Allocation",
      description: "Class, stream, dormitory, and route assignment.",
      badge: `${pendingAllocations} pending`,
      tone: pendingAllocations > 0 ? "warning" : "ok",
    },
    {
      id: "transfers",
      label: "Transfers",
      description: "Incoming, outgoing, and historical transfer control.",
      badge: `${data.transfers.length}`,
    },
    {
      id: "reports",
      label: "Reports",
      description: "Application mix, document compliance, and allocation completion.",
      badge: `${pendingApplications} queue`,
      tone: pendingApplications > 0 ? "warning" : "ok",
    },
  ];
}

export function buildAdmissionsStatStrip(data: AdmissionsDataset): StatStripDataItem[] {
  const newApplications = data.applications.filter((item) => item.dateApplied >= "2026-05-01").length;
  const approvedStudents = data.applications.filter((item) => item.status === "approved").length;
  const pendingReview = data.applications.filter(
    (item) => item.status === "pending" || item.status === "interview",
  ).length;
  const totalRegistered = data.students.length;

  return [
    {
      id: "new-applications",
      label: "New Applications",
      value: `${newApplications}`,
      helper: "Applications opened in the current admissions cycle.",
    },
    {
      id: "approved-students",
      label: "Approved Students",
      value: `${approvedStudents}`,
      helper: "Learners cleared for registration but not yet fully onboarded.",
      tone: approvedStudents > 0 ? "warning" : "ok",
    },
    {
      id: "pending-review",
      label: "Pending Review",
      value: `${pendingReview}`,
      helper: "Files waiting for interview, verification, or office action.",
      tone: pendingReview > 0 ? "warning" : "ok",
    },
    {
      id: "total-registered",
      label: "Total Registered",
      value: `${totalRegistered}`,
      helper: "Learners created into the student directory from this workflow.",
    },
  ];
}

export function getApplicationTone(status: ApplicationStatus): StatusTone {
  if (status === "rejected") {
    return "critical";
  }

  if (status === "pending" || status === "interview" || status === "approved") {
    return "warning";
  }

  return "ok";
}

export function formatApplicationStatus(status: ApplicationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatDocumentStatus(status: DocumentVerificationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getDocumentTone(status: DocumentVerificationStatus): StatusTone {
  if (status === "missing" || status === "rejected") {
    return "critical";
  }

  if (status === "pending") {
    return "warning";
  }

  return "ok";
}

export function formatAllocationStatus(status: AllocationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getAllocationTone(status: AllocationStatus): StatusTone {
  return status === "pending" ? "warning" : "ok";
}

export function formatTransferDirection(direction: TransferDirection) {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

export function getTransferTone(status: "pending" | "completed"): StatusTone {
  return status === "pending" ? "warning" : "ok";
}

export function buildAdmissionsTrend() {
  return [
    { id: "trend-jan", label: "Jan", applications: 11, registered: 8 },
    { id: "trend-feb", label: "Feb", applications: 15, registered: 10 },
    { id: "trend-mar", label: "Mar", applications: 18, registered: 12 },
    { id: "trend-apr", label: "Apr", applications: 22, registered: 15 },
    { id: "trend-may", label: "May", applications: 14, registered: 6 },
  ];
}

export function buildAdmissionsReports(data: AdmissionsDataset): AdmissionsReportCard[] {
  const applicationsRows = data.applications.map((application) => [
    application.applicantName,
    application.applicationNumber,
    application.classApplying,
    application.parentPhone,
    formatApplicationStatus(application.status),
  ]);

  const documentsRows = data.documents.map((document) => [
    document.learnerName,
    document.documentType,
    document.fileName,
    document.uploadedOn,
    formatDocumentStatus(document.verificationStatus),
  ]);

  const allocationRows = data.allocations.map((allocation) => [
    allocation.studentName,
    allocation.className,
    allocation.streamName,
    allocation.dormitoryName,
    allocation.transportRoute,
    formatAllocationStatus(allocation.status),
  ]);

  const transferRows = data.transfers.map((transfer) => [
    transfer.learnerName,
    transfer.admissionNumber,
    formatTransferDirection(transfer.direction),
    transfer.schoolName,
    transfer.requestedOn,
    transfer.status,
  ]);

  return [
    {
      id: "report-applications",
      title: "Applications register",
      description: "Applicant status mix and parent contact register.",
      filename: "admissions-applications.csv",
      headers: ["Applicant", "Application No", "Class", "Parent Phone", "Status"],
      rows: applicationsRows,
    },
    {
      id: "report-documents",
      title: "Document compliance",
      description: "Uploaded and missing admissions document trail.",
      filename: "admissions-documents.csv",
      headers: ["Learner", "Document", "File", "Uploaded On", "Verification"],
      rows: documentsRows,
    },
    {
      id: "report-allocations",
      title: "Allocation report",
      description: "Class, stream, boarding, and route allocation posture.",
      filename: "admissions-allocations.csv",
      headers: ["Student", "Class", "Stream", "Dormitory", "Route", "Status"],
      rows: allocationRows,
    },
    {
      id: "report-transfers",
      title: "Transfer history",
      description: "Incoming and outgoing transfer operational history.",
      filename: "admissions-transfers.csv",
      headers: ["Learner", "Admission No", "Direction", "School", "Date", "Status"],
      rows: transferRows,
    },
  ];
}

export function buildAdmissionsSearchItems(role: DashboardRole) {
  if (role === "storekeeper") {
    return [];
  }

  return baseStudents.map((student) => ({
    id: `student-search-${student.id}`,
    label: `${student.fullName} (${student.admissionNumber})`,
    description: `${student.className} ${student.streamName} · Parent ${student.parentPhone}`,
    href:
      role === "admissions"
        ? `/dashboard/admissions/admissions?view=student-directory&student=${student.id}`
        : `/dashboard/${role}/students/${student.id}`,
    kind: "student" as const,
  }));
}

export function buildFeesSummary(balance: number) {
  return formatCurrency(balance, false);
}
