import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";

export type LibraryPermission =
  | "library.view"
  | "library.catalog.manage"
  | "library.borrow"
  | "library.return"
  | "library.reports";

export const libraryPermissions: LibraryPermission[] = [
  "library.view",
  "library.catalog.manage",
  "library.borrow",
  "library.return",
  "library.reports",
];

export type LibrarySectionId =
  | "dashboard"
  | "catalog"
  | "borrowing"
  | "scan-issue"
  | "scan-return"
  | "returns"
  | "overdue"
  | "members"
  | "fines"
  | "reports"
  | "activity-log";

export const librarySections: LibrarySectionId[] = [
  "dashboard",
  "catalog",
  "borrowing",
  "scan-issue",
  "scan-return",
  "returns",
  "overdue",
  "members",
  "fines",
  "reports",
  "activity-log",
];

export const librarySidebarItems: Array<{
  id: LibrarySectionId;
  label: string;
  href: string;
}> = [
  { id: "dashboard", label: "Dashboard", href: "/library/dashboard" },
  { id: "catalog", label: "Catalog", href: "/library/catalog" },
  { id: "borrowing", label: "Borrowing", href: "/library/borrowing" },
  { id: "scan-issue", label: "Scan Issue", href: "/library/scan-issue" },
  { id: "scan-return", label: "Scan Return", href: "/library/scan-return" },
  { id: "returns", label: "Returns", href: "/library/returns" },
  { id: "overdue", label: "Overdue", href: "/library/overdue" },
  { id: "members", label: "Members", href: "/library/members" },
  { id: "fines", label: "Fines", href: "/library/fines" },
  { id: "reports", label: "Reports", href: "/library/reports" },
  { id: "activity-log", label: "Activity Log", href: "/library/activity-log" },
];

export const schoolLibraryCategories = [
  "Mathematics",
  "English",
  "Kiswahili",
  "Sciences",
  "CBC Resources",
  "Literature",
  "History",
  "Geography",
  "Revision Books",
  "Story Books",
  "Dictionaries",
] as const;

export type LibraryBookStatus =
  | "available"
  | "borrowed"
  | "overdue"
  | "damaged"
  | "lost"
  | "reserved";

export type LibraryMemberType = "student" | "teacher" | "staff";
export type LibraryBorrowingStatus = "borrowed" | "overdue" | "returned" | "lost";
export type LibraryFineStatus = "pending" | "paid" | "waived";
export type LibraryFineCategory = "overdue" | "lost" | "damaged";
export type LibraryReturnCondition = "good" | "damaged" | "lost";

export interface LibraryBook {
  id: string;
  accessionNumber: string;
  isbn: string;
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  category: string;
  subject: string;
  edition: string;
  shelfLocation: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityDamaged: number;
  quantityLost: number;
  unitValue: number;
  status: LibraryBookStatus;
  popularityScore: number;
  lastActivityAt: string;
}

export interface LibraryMember {
  id: string;
  memberType: LibraryMemberType;
  admissionOrStaffNo: string;
  fullName: string;
  className: string;
  contact: string;
  status: "active" | "suspended";
}

export interface LibraryBorrowing {
  id: string;
  reference: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  dueDate: string;
  returnedAt?: string;
  status: LibraryBorrowingStatus;
  issuedBy: string;
}

export interface LibraryReturn {
  id: string;
  borrowingId: string;
  bookId: string;
  memberId: string;
  returnedAt: string;
  condition: LibraryReturnCondition;
  overdueDays: number;
  fineAmount: number;
  receivedBy: string;
}

export interface LibraryFine {
  id: string;
  fineNumber: string;
  memberId: string;
  borrowingId?: string;
  category: LibraryFineCategory;
  amount: number;
  status: LibraryFineStatus;
  assessedAt: string;
  paidAt?: string;
  waivedAt?: string;
  notes: string;
}

export interface LibraryActivityLog {
  id: string;
  timestamp: string;
  librarian: string;
  action: string;
  affectedItem: string;
  detail: string;
}

export interface LibraryDataset {
  books: LibraryBook[];
  members: LibraryMember[];
  borrowings: LibraryBorrowing[];
  returns: LibraryReturn[];
  fines: LibraryFine[];
  activityLogs: LibraryActivityLog[];
  processedSubmissionIds: string[];
}

export interface LibraryBorrowInput {
  memberId: string;
  bookId: string;
  dueDate: string;
  issuedBy: string;
  submissionId?: string;
}

export interface LibraryReturnInput {
  borrowingId: string;
  condition: LibraryReturnCondition;
  returnedAt: string;
  receivedBy: string;
  notes?: string;
}

export interface LibraryBorrowReceipt {
  reference: string;
  borrower: string;
  admissionOrStaffNo: string;
  className: string;
  title: string;
  accessionNumber: string;
  issuedAt: string;
  dueDate: string;
  issuedBy: string;
}

export interface LibraryReturnReceipt {
  reference: string;
  borrower: string;
  title: string;
  accessionNumber: string;
  returnedAt: string;
  overdueDays: number;
  fineAmount: number;
  receivedBy: string;
}

export interface LibraryReport {
  id: string;
  title: string;
  description: string;
  filename: string;
  headers: string[];
  rows: string[][];
}

const currentTimestamp = "2026-05-07 10:20";
const defaultFinePerDay = 10;
const damagedBookPenalty = 300;

const baseBooks: LibraryBook[] = [
  {
    id: "book-math-g7",
    accessionNumber: "LIB-MATH-0007",
    isbn: "9789966561113",
    title: "Spotlight Mathematics Grade 7",
    subtitle: "CBC Learner's Book",
    author: "KLB Mathematics Panel",
    publisher: "Kenya Literature Bureau",
    category: "Mathematics",
    subject: "Mathematics",
    edition: "2024 CBC Edition",
    shelfLocation: "Math Bay M2 - Shelf 3",
    quantityTotal: 18,
    quantityAvailable: 14,
    quantityDamaged: 1,
    quantityLost: 0,
    unitValue: 740,
    status: "available",
    popularityScore: 42,
    lastActivityAt: "2026-05-07 08:10",
  },
  {
    id: "book-blossoms",
    accessionNumber: "LIB-LIT-0042",
    isbn: "9789966257283",
    title: "Blossoms of the Savannah",
    subtitle: "KCSE Set Text",
    author: "H. R. Ole Kulet",
    publisher: "Longhorn Publishers",
    category: "Literature",
    subject: "English Literature",
    edition: "Revised school edition",
    shelfLocation: "Literature Bay L1 - Shelf 2",
    quantityTotal: 12,
    quantityAvailable: 6,
    quantityDamaged: 0,
    quantityLost: 1,
    unitValue: 520,
    status: "borrowed",
    popularityScore: 58,
    lastActivityAt: "2026-05-06 15:25",
  },
  {
    id: "book-kiswahili-g8",
    accessionNumber: "LIB-KIS-0019",
    isbn: "9789966002197",
    title: "Kiswahili Fasaha Grade 8",
    subtitle: "Kitabu cha Mwanafunzi",
    author: "Mwalimu Wafula",
    publisher: "Moran Publishers",
    category: "Kiswahili",
    subject: "Kiswahili",
    edition: "CBC 2025",
    shelfLocation: "Languages Bay K2 - Shelf 1",
    quantityTotal: 16,
    quantityAvailable: 10,
    quantityDamaged: 2,
    quantityLost: 0,
    unitValue: 680,
    status: "available",
    popularityScore: 34,
    lastActivityAt: "2026-05-07 09:05",
  },
  {
    id: "book-integrated-science",
    accessionNumber: "LIB-SCI-0028",
    isbn: "9789966519015",
    title: "Top Scholar Integrated Science Grade 7",
    subtitle: "CBC Practical Activities",
    author: "Science Teachers Association",
    publisher: "Spotlight Publishers",
    category: "Sciences",
    subject: "Integrated Science",
    edition: "2025 Edition",
    shelfLocation: "Science Bay S1 - Shelf 4",
    quantityTotal: 20,
    quantityAvailable: 15,
    quantityDamaged: 0,
    quantityLost: 0,
    unitValue: 790,
    status: "available",
    popularityScore: 50,
    lastActivityAt: "2026-05-07 07:45",
  },
  {
    id: "book-cbc-art",
    accessionNumber: "LIB-CBC-0014",
    isbn: "9789966100442",
    title: "Creative Arts and Sports Grade 6",
    subtitle: "Project Resource Pack",
    author: "CBC Resource Team",
    publisher: "Jomo Kenyatta Foundation",
    category: "CBC Resources",
    subject: "Creative Arts",
    edition: "Term 2 Resource Edition",
    shelfLocation: "CBC Bay C1 - Shelf 5",
    quantityTotal: 9,
    quantityAvailable: 5,
    quantityDamaged: 1,
    quantityLost: 0,
    unitValue: 640,
    status: "available",
    popularityScore: 21,
    lastActivityAt: "2026-05-06 11:40",
  },
  {
    id: "book-history-form2",
    accessionNumber: "LIB-HIS-0031",
    isbn: "9789966223134",
    title: "History and Government Form 2",
    subtitle: "Secondary Course Book",
    author: "M. Ochieng",
    publisher: "East African Educational Publishers",
    category: "History",
    subject: "History",
    edition: "Fourth Edition",
    shelfLocation: "Humanities Bay H1 - Shelf 1",
    quantityTotal: 14,
    quantityAvailable: 8,
    quantityDamaged: 0,
    quantityLost: 1,
    unitValue: 830,
    status: "available",
    popularityScore: 28,
    lastActivityAt: "2026-05-05 14:00",
  },
  {
    id: "book-kamusi",
    accessionNumber: "LIB-DIC-0003",
    isbn: "9789966462502",
    title: "Kamusi ya Karne ya 21",
    subtitle: "Kiswahili Dictionary",
    author: "TUKI",
    publisher: "Longhorn Publishers",
    category: "Dictionaries",
    subject: "Reference",
    edition: "School library edition",
    shelfLocation: "Reference Desk R1",
    quantityTotal: 4,
    quantityAvailable: 0,
    quantityDamaged: 0,
    quantityLost: 0,
    unitValue: 1450,
    status: "reserved",
    popularityScore: 19,
    lastActivityAt: "2026-05-07 09:50",
  },
  {
    id: "book-story-sungura",
    accessionNumber: "LIB-STO-0064",
    isbn: "9789966024113",
    title: "Sungura na Marafiki",
    subtitle: "Junior Story Book",
    author: "Wangari Muthoni",
    publisher: "Phoenix Publishers",
    category: "Story Books",
    subject: "Reading",
    edition: "Illustrated edition",
    shelfLocation: "Junior Reading Corner J3",
    quantityTotal: 25,
    quantityAvailable: 18,
    quantityDamaged: 1,
    quantityLost: 0,
    unitValue: 360,
    status: "available",
    popularityScore: 47,
    lastActivityAt: "2026-05-07 09:40",
  },
  {
    id: "book-revision-kcse",
    accessionNumber: "LIB-REV-0088",
    isbn: "9789966147119",
    title: "KCSE Topical Revision Mathematics",
    subtitle: "Form 1-4 Practice Questions",
    author: "Peak Revision Team",
    publisher: "Oxford University Press East Africa",
    category: "Revision Books",
    subject: "Mathematics",
    edition: "2026 Exam Edition",
    shelfLocation: "Revision Bay R2 - Shelf 3",
    quantityTotal: 18,
    quantityAvailable: 3,
    quantityDamaged: 0,
    quantityLost: 2,
    unitValue: 890,
    status: "available",
    popularityScore: 65,
    lastActivityAt: "2026-05-07 06:55",
  },
];

const baseMembers: LibraryMember[] = [
  {
    id: "member-sh-24011",
    memberType: "student",
    admissionOrStaffNo: "SH-24011",
    fullName: "Akinyi Wanjiru",
    className: "Grade 7 Hope",
    contact: "+254 711 438 221",
    status: "active",
  },
  {
    id: "member-sh-23104",
    memberType: "student",
    admissionOrStaffNo: "SH-23104",
    fullName: "Brian Otieno",
    className: "Form 2 East",
    contact: "+254 724 118 904",
    status: "active",
  },
  {
    id: "member-staff-019",
    memberType: "teacher",
    admissionOrStaffNo: "TSC-614822",
    fullName: "Beatrice Wanjiku",
    className: "English Department",
    contact: "+254 733 640 117",
    status: "active",
  },
  {
    id: "member-staff-044",
    memberType: "staff",
    admissionOrStaffNo: "STF-044",
    fullName: "Peter Mwangi",
    className: "Boarding Office",
    contact: "+254 720 001 009",
    status: "active",
  },
];

const baseBorrowings: LibraryBorrowing[] = [
  {
    id: "borrow-overdue-blossoms",
    reference: "LIB-ISS-20260424-002",
    bookId: "book-blossoms",
    memberId: "member-sh-24011",
    borrowedAt: "2026-04-24 08:00",
    dueDate: "2026-05-01",
    status: "overdue",
    issuedBy: "Librarian Amani Prep",
  },
  {
    id: "borrow-science-teacher",
    reference: "LIB-ISS-20260506-006",
    bookId: "book-integrated-science",
    memberId: "member-staff-019",
    borrowedAt: "2026-05-06 14:30",
    dueDate: "2026-05-20",
    status: "borrowed",
    issuedBy: "Librarian Amani Prep",
  },
  {
    id: "borrow-revision-brian",
    reference: "LIB-ISS-20260503-004",
    bookId: "book-revision-kcse",
    memberId: "member-sh-23104",
    borrowedAt: "2026-05-03 16:05",
    dueDate: "2026-05-10",
    status: "borrowed",
    issuedBy: "Librarian Amani Prep",
  },
];

const baseReturns: LibraryReturn[] = [
  {
    id: "return-story-001",
    borrowingId: "borrow-story-returned",
    bookId: "book-story-sungura",
    memberId: "member-sh-24011",
    returnedAt: "2026-05-07 09:40",
    condition: "good",
    overdueDays: 0,
    fineAmount: 0,
    receivedBy: "Librarian Amani Prep",
  },
  {
    id: "return-kis-002",
    borrowingId: "borrow-kis-returned",
    bookId: "book-kiswahili-g8",
    memberId: "member-sh-23104",
    returnedAt: "2026-05-07 08:55",
    condition: "damaged",
    overdueDays: 0,
    fineAmount: damagedBookPenalty,
    receivedBy: "Librarian Amani Prep",
  },
];

const baseFines: LibraryFine[] = [
  {
    id: "fine-damaged-kis-002",
    fineNumber: "LIB-FINE-20260507-002",
    memberId: "member-sh-23104",
    borrowingId: "borrow-kis-returned",
    category: "damaged",
    amount: damagedBookPenalty,
    status: "pending",
    assessedAt: "2026-05-07 08:55",
    notes: "Kiswahili textbook returned with water-damaged back pages.",
  },
  {
    id: "fine-lost-history-001",
    fineNumber: "LIB-FINE-20260505-001",
    memberId: "member-staff-044",
    category: "lost",
    amount: 830,
    status: "paid",
    assessedAt: "2026-05-05 12:20",
    paidAt: "2026-05-06 09:10",
    notes: "Lost History Form 2 copy replaced through cash office receipt.",
  },
];

const baseActivityLogs: LibraryActivityLog[] = [
  {
    id: "log-issue-science",
    timestamp: "2026-05-07 10:05",
    librarian: "Librarian Amani Prep",
    action: "issued book",
    affectedItem: "Top Scholar Integrated Science Grade 7",
    detail: "Issued to Beatrice Wanjiku, due 2026-05-20.",
  },
  {
    id: "log-return-story",
    timestamp: "2026-05-07 09:40",
    librarian: "Librarian Amani Prep",
    action: "returned book",
    affectedItem: "Sungura na Marafiki",
    detail: "Returned by Akinyi Wanjiru in good condition.",
  },
  {
    id: "log-fine-damaged",
    timestamp: "2026-05-07 08:55",
    librarian: "Librarian Amani Prep",
    action: "fine assessed",
    affectedItem: "Kiswahili Fasaha Grade 8",
    detail: "Damage fine KES 300 applied to Brian Otieno.",
  },
  {
    id: "log-catalog-edit",
    timestamp: "2026-05-06 16:20",
    librarian: "Librarian Amani Prep",
    action: "catalog updated",
    affectedItem: "KCSE Topical Revision Mathematics",
    detail: "Shelf moved to Revision Bay R2 - Shelf 3.",
  },
];

function cloneDataset(dataset: LibraryDataset): LibraryDataset {
  return {
    books: dataset.books.map((book) => ({ ...book })),
    members: dataset.members.map((member) => ({ ...member })),
    borrowings: dataset.borrowings.map((borrowing) => ({ ...borrowing })),
    returns: dataset.returns.map((returnRecord) => ({ ...returnRecord })),
    fines: dataset.fines.map((fine) => ({ ...fine })),
    activityLogs: dataset.activityLogs.map((log) => ({ ...log })),
    processedSubmissionIds: [...dataset.processedSubmissionIds],
  };
}

function nextReference(prefix: "LIB-ISS" | "LIB-RET" | "LIB-FINE", existingCount: number) {
  return `${prefix}-20260507-${String(existingCount + 1).padStart(3, "0")}`;
}

function assertSubmissionIsNew(dataset: LibraryDataset, submissionId?: string) {
  if (submissionId && dataset.processedSubmissionIds.includes(submissionId)) {
    throw new Error("This library transaction has already been submitted.");
  }
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000+03:00`);
}

export function calculateOverdueDays(dueDate: string, returnedAt: string) {
  const due = parseDate(dueDate);
  const returned = parseDate(returnedAt);
  const diff = returned.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function createLibraryDataset(): LibraryDataset {
  return cloneDataset({
    books: baseBooks,
    members: baseMembers,
    borrowings: baseBorrowings,
    returns: baseReturns,
    fines: baseFines,
    activityLogs: baseActivityLogs,
    processedSubmissionIds: [],
  });
}

export function isLibrarySection(value: string): value is LibrarySectionId {
  return librarySections.includes(value as LibrarySectionId);
}

export function getLibraryStatusTone(status: LibraryBookStatus | LibraryBorrowingStatus | LibraryFineStatus): StatusTone {
  if (status === "lost" || status === "damaged" || status === "overdue" || status === "pending") {
    return "critical";
  }

  if (status === "borrowed" || status === "reserved" || status === "waived") {
    return "warning";
  }

  return "ok";
}

export function getMemberBorrowings(dataset: LibraryDataset, memberId: string) {
  return dataset.borrowings.filter((borrowing) => borrowing.memberId === memberId);
}

export function getBookById(dataset: LibraryDataset, bookId: string) {
  return dataset.books.find((book) => book.id === bookId);
}

export function getMemberById(dataset: LibraryDataset, memberId: string) {
  return dataset.members.find((member) => member.id === memberId);
}

export function getOpenBorrowings(dataset: LibraryDataset) {
  return dataset.borrowings.filter((borrowing) => borrowing.status !== "returned");
}

export function getOverdueBorrowings(dataset: LibraryDataset) {
  return dataset.borrowings.filter((borrowing) => borrowing.status === "overdue");
}

export function buildLibraryDashboard(dataset: LibraryDataset) {
  const issuedToday = dataset.borrowings.filter((borrowing) => borrowing.borrowedAt.startsWith("2026-05-07"));
  const overdueBorrowings = getOverdueBorrowings(dataset);
  const availableBooks = dataset.books.reduce((sum, book) => sum + book.quantityAvailable, 0);
  const missingBooks = dataset.books.reduce((sum, book) => sum + book.quantityLost, 0);
  const damagedBooks = dataset.books.reduce((sum, book) => sum + book.quantityDamaged, 0);
  const activeBorrowers = new Set(getOpenBorrowings(dataset).map((borrowing) => borrowing.memberId));
  const popularBooks = [...dataset.books]
    .sort((first, second) => second.popularityScore - first.popularityScore)
    .slice(0, 5);
  const recentlyReturnedBooks = dataset.returns
    .map((returnRecord) => ({
      ...returnRecord,
      book: getBookById(dataset, returnRecord.bookId),
      member: getMemberById(dataset, returnRecord.memberId),
    }))
    .slice(0, 5);

  return {
    issuedToday,
    overdueBorrowings,
    availableBooks,
    missingBooks,
    damagedBooks,
    activeBorrowers: activeBorrowers.size,
    popularBooks,
    recentlyReturnedBooks,
  };
}

export function buildLibraryAlerts(dataset: LibraryDataset) {
  const overdue = getOverdueBorrowings(dataset);
  const zeroAvailable = dataset.books.find((book) => book.quantityAvailable === 0);
  const pendingFine = dataset.fines.find((fine) => fine.status === "pending");

  return [
    overdue[0]
      ? {
          id: "overdue-warning",
          title: "Overdue book needs follow-up",
          detail: `${getBookById(dataset, overdue[0].bookId)?.title ?? "Book"} is overdue for ${getMemberById(dataset, overdue[0].memberId)?.fullName ?? "borrower"}.`,
          tone: "critical" as StatusTone,
          actionLabel: "Open overdue",
        }
      : null,
    zeroAvailable
      ? {
          id: "zero-available",
          title: "No copies available",
          detail: `${zeroAvailable.title} has no loanable copies on shelf.`,
          tone: "warning" as StatusTone,
          actionLabel: "Open catalog",
        }
      : null,
    pendingFine
      ? {
          id: "pending-fine",
          title: "Pending library fine",
          detail: `${formatCurrency(pendingFine.amount, false)} pending for ${getMemberById(dataset, pendingFine.memberId)?.fullName ?? "member"}.`,
          tone: "warning" as StatusTone,
          actionLabel: "Open fines",
        }
      : null,
  ].filter((alert): alert is { id: string; title: string; detail: string; tone: StatusTone; actionLabel: string } => Boolean(alert));
}

export function buildLibraryStats(dataset: LibraryDataset) {
  const dashboard = buildLibraryDashboard(dataset);

  return [
    {
      id: "issued-today",
      label: "Books issued today",
      value: `${dashboard.issuedToday.length}`,
      helper: "Borrow receipts generated",
      tone: "ok" as StatusTone,
    },
    {
      id: "overdue",
      label: "Overdue books",
      value: `${dashboard.overdueBorrowings.length}`,
      helper: "Need reminders",
      tone: dashboard.overdueBorrowings.length > 0 ? "critical" as StatusTone : "ok" as StatusTone,
    },
    {
      id: "available",
      label: "Available books",
      value: `${dashboard.availableBooks}`,
      helper: "Loanable copies",
      tone: "ok" as StatusTone,
    },
    {
      id: "missing",
      label: "Missing books",
      value: `${dashboard.missingBooks}`,
      helper: "Lost or unresolved",
      tone: dashboard.missingBooks > 0 ? "warning" as StatusTone : "ok" as StatusTone,
    },
    {
      id: "damaged",
      label: "Damaged books",
      value: `${dashboard.damagedBooks}`,
      helper: "Repair or replacement",
      tone: dashboard.damagedBooks > 0 ? "warning" as StatusTone : "ok" as StatusTone,
    },
    {
      id: "active-borrowers",
      label: "Active borrowers",
      value: `${dashboard.activeBorrowers}`,
      helper: "Students and staff",
      tone: "ok" as StatusTone,
    },
  ];
}

export function issueLibraryBook(dataset: LibraryDataset, input: LibraryBorrowInput) {
  assertSubmissionIsNew(dataset, input.submissionId);

  if (!input.memberId) {
    throw new Error("Select a student, teacher, or staff borrower.");
  }

  if (!input.bookId) {
    throw new Error("Select a book from the catalog.");
  }

  if (!input.dueDate) {
    throw new Error("Assign a due date before issuing the book.");
  }

  const nextDataset = cloneDataset(dataset);
  const member = nextDataset.members.find((item) => item.id === input.memberId);
  const bookIndex = nextDataset.books.findIndex((item) => item.id === input.bookId);
  const book = nextDataset.books[bookIndex];

  if (!member) {
    throw new Error("Select a valid library member.");
  }

  if (member.status !== "active") {
    throw new Error(`${member.fullName} is not active for borrowing.`);
  }

  if (!book) {
    throw new Error("Select a valid catalog item.");
  }

  if (book.quantityAvailable <= 0) {
    throw new Error(`No available copies for ${book.title}.`);
  }

  const existingOpenBorrowing = nextDataset.borrowings.find(
    (borrowing) =>
      borrowing.memberId === member.id &&
      borrowing.bookId === book.id &&
      borrowing.status !== "returned",
  );

  if (existingOpenBorrowing) {
    throw new Error(`${member.fullName} already has ${book.title} on loan.`);
  }

  const reference = nextReference("LIB-ISS", nextDataset.borrowings.length);
  const borrowing: LibraryBorrowing = {
    id: `borrow-${reference.toLowerCase()}`,
    reference,
    bookId: book.id,
    memberId: member.id,
    borrowedAt: currentTimestamp,
    dueDate: input.dueDate,
    status: "borrowed",
    issuedBy: input.issuedBy,
  };
  const nextQuantity = book.quantityAvailable - 1;

  nextDataset.books[bookIndex] = {
    ...book,
    quantityAvailable: nextQuantity,
    status: nextQuantity > 0 ? "available" : "borrowed",
    popularityScore: book.popularityScore + 1,
    lastActivityAt: currentTimestamp,
  };
  nextDataset.borrowings = [borrowing, ...nextDataset.borrowings];
  nextDataset.activityLogs = [
    {
      id: `log-${borrowing.id}`,
      timestamp: currentTimestamp,
      librarian: input.issuedBy,
      action: "issued book",
      affectedItem: book.title,
      detail: `Issued to ${member.fullName}, due ${input.dueDate}.`,
    },
    ...nextDataset.activityLogs,
  ];

  if (input.submissionId) {
    nextDataset.processedSubmissionIds = [...nextDataset.processedSubmissionIds, input.submissionId];
  }

  return {
    dataset: nextDataset,
    borrowReceipt: {
      reference,
      borrower: member.fullName,
      admissionOrStaffNo: member.admissionOrStaffNo,
      className: member.className,
      title: book.title,
      accessionNumber: book.accessionNumber,
      issuedAt: currentTimestamp,
      dueDate: input.dueDate,
      issuedBy: input.issuedBy,
    } satisfies LibraryBorrowReceipt,
  };
}

export function returnLibraryBook(dataset: LibraryDataset, input: LibraryReturnInput) {
  if (!input.borrowingId) {
    throw new Error("Select the borrowed book being returned.");
  }

  const nextDataset = cloneDataset(dataset);
  const borrowingIndex = nextDataset.borrowings.findIndex((item) => item.id === input.borrowingId);
  const borrowing = nextDataset.borrowings[borrowingIndex];

  if (!borrowing) {
    throw new Error("Select a valid borrowing record.");
  }

  if (borrowing.status === "returned") {
    throw new Error("This book has already been returned.");
  }

  const bookIndex = nextDataset.books.findIndex((item) => item.id === borrowing.bookId);
  const book = nextDataset.books[bookIndex];
  const member = nextDataset.members.find((item) => item.id === borrowing.memberId);

  if (!book || !member) {
    throw new Error("Borrowing record is missing book or borrower details.");
  }

  const overdueDays = calculateOverdueDays(borrowing.dueDate, input.returnedAt);
  const overdueFine = overdueDays * defaultFinePerDay;
  const conditionFine =
    input.condition === "damaged"
      ? damagedBookPenalty
      : input.condition === "lost"
        ? book.unitValue
        : 0;
  const fineAmount = overdueFine + conditionFine;
  const returnReference = nextReference("LIB-RET", nextDataset.returns.length);
  const returnRecord: LibraryReturn = {
    id: `return-${returnReference.toLowerCase()}`,
    borrowingId: borrowing.id,
    bookId: book.id,
    memberId: member.id,
    returnedAt: input.returnedAt,
    condition: input.condition,
    overdueDays,
    fineAmount,
    receivedBy: input.receivedBy,
  };
  const availableDelta = input.condition === "lost" ? 0 : 1;

  nextDataset.borrowings[borrowingIndex] = {
    ...borrowing,
    returnedAt: input.returnedAt,
    status: input.condition === "lost" ? "lost" : "returned",
  };
  nextDataset.books[bookIndex] = {
    ...book,
    quantityAvailable: book.quantityAvailable + availableDelta,
    quantityDamaged: book.quantityDamaged + (input.condition === "damaged" ? 1 : 0),
    quantityLost: book.quantityLost + (input.condition === "lost" ? 1 : 0),
    status:
      input.condition === "lost"
        ? "lost"
        : input.condition === "damaged"
          ? "damaged"
          : "available",
    lastActivityAt: input.returnedAt,
  };
  nextDataset.returns = [returnRecord, ...nextDataset.returns];

  if (fineAmount > 0) {
    const fineReference = nextReference("LIB-FINE", nextDataset.fines.length);
    nextDataset.fines = [
      {
        id: `fine-${fineReference.toLowerCase()}`,
        fineNumber: fineReference,
        memberId: member.id,
        borrowingId: borrowing.id,
        category: input.condition === "lost" ? "lost" : input.condition === "damaged" ? "damaged" : "overdue",
        amount: fineAmount,
        status: "pending",
        assessedAt: input.returnedAt,
        notes:
          input.notes?.trim()
          || `${overdueDays} overdue day(s), return condition ${input.condition}.`,
      },
      ...nextDataset.fines,
    ];
  }

  nextDataset.activityLogs = [
    {
      id: `log-${returnRecord.id}`,
      timestamp: input.returnedAt,
      librarian: input.receivedBy,
      action: "returned book",
      affectedItem: book.title,
      detail: `${member.fullName} returned ${book.accessionNumber}; fine ${formatCurrency(fineAmount, false)}.`,
    },
    ...nextDataset.activityLogs,
  ];

  return {
    dataset: nextDataset,
    returnReceipt: {
      reference: returnReference,
      borrower: member.fullName,
      title: book.title,
      accessionNumber: book.accessionNumber,
      returnedAt: input.returnedAt,
      overdueDays,
      fineAmount,
      receivedBy: input.receivedBy,
    } satisfies LibraryReturnReceipt,
  };
}

export function buildLibraryReports(dataset: LibraryDataset): LibraryReport[] {
  const borrowedRows = getOpenBorrowings(dataset).map((borrowing) => {
    const book = getBookById(dataset, borrowing.bookId);
    const member = getMemberById(dataset, borrowing.memberId);

    return [
      borrowing.reference,
      borrowing.borrowedAt,
      member?.fullName ?? "",
      member?.admissionOrStaffNo ?? "",
      member?.className ?? "",
      book?.accessionNumber ?? "",
      book?.title ?? "",
      borrowing.dueDate,
      borrowing.status,
    ];
  });
  const overdueRows = getOverdueBorrowings(dataset).map((borrowing) => {
    const book = getBookById(dataset, borrowing.bookId);
    const member = getMemberById(dataset, borrowing.memberId);

    return [
      `${calculateOverdueDays(borrowing.dueDate, "2026-05-07")}`,
      member?.fullName ?? "",
      member?.className ?? "",
      member?.contact ?? "",
      book?.title ?? "",
      book?.accessionNumber ?? "",
      borrowing.dueDate,
    ];
  });
  const popularRows = [...dataset.books]
    .sort((first, second) => second.popularityScore - first.popularityScore)
    .map((book) => [
      book.accessionNumber,
      book.title,
      book.category,
      `${book.popularityScore}`,
      `${book.quantityAvailable}`,
      book.shelfLocation,
    ]);
  const lostRows = dataset.books
    .filter((book) => book.quantityLost > 0 || book.status === "lost")
    .map((book) => [
      book.accessionNumber,
      book.title,
      book.category,
      `${book.quantityLost}`,
      formatCurrency(book.quantityLost * book.unitValue, false),
    ]);
  const damagedRows = dataset.books
    .filter((book) => book.quantityDamaged > 0 || book.status === "damaged")
    .map((book) => [
      book.accessionNumber,
      book.title,
      book.category,
      `${book.quantityDamaged}`,
      book.shelfLocation,
    ]);
  const historyRows = dataset.borrowings
    .filter((borrowing) => {
      const member = getMemberById(dataset, borrowing.memberId);
      return member?.memberType === "student";
    })
    .map((borrowing) => {
      const member = getMemberById(dataset, borrowing.memberId);
      const book = getBookById(dataset, borrowing.bookId);

      return [
        member?.admissionOrStaffNo ?? "",
        member?.fullName ?? "",
        member?.className ?? "",
        book?.title ?? "",
        borrowing.borrowedAt,
        borrowing.dueDate,
        borrowing.status,
      ];
    });
  const valuationRows = dataset.books.map((book) => [
    book.accessionNumber,
    book.title,
    book.category,
    `${book.quantityTotal}`,
    `${book.quantityAvailable}`,
    `${book.quantityDamaged}`,
    `${book.quantityLost}`,
    formatCurrency(book.unitValue, false),
    formatCurrency(book.quantityTotal * book.unitValue, false),
  ]);

  return [
    {
      id: "borrowed",
      title: "Borrowed books report",
      description: "All open loans with borrower, class, due date, and accession number.",
      filename: "library-borrowed-books.csv",
      headers: ["Reference", "Issued At", "Borrower", "Admission/Staff No", "Class/Dept", "Accession", "Title", "Due Date", "Status"],
      rows: borrowedRows,
    },
    {
      id: "overdue",
      title: "Overdue report",
      description: "Overdue days, borrower contacts, class, and book details for reminders.",
      filename: "library-overdue-books.csv",
      headers: ["Overdue Days", "Borrower", "Class/Dept", "Contact", "Title", "Accession", "Due Date"],
      rows: overdueRows,
    },
    {
      id: "popular",
      title: "Popular books report",
      description: "Most borrowed and most requested resources by title and category.",
      filename: "library-popular-books.csv",
      headers: ["Accession", "Title", "Category", "Popularity Score", "Available", "Shelf"],
      rows: popularRows,
    },
    {
      id: "lost",
      title: "Lost books report",
      description: "Lost quantities and replacement value for stock recovery.",
      filename: "library-lost-books.csv",
      headers: ["Accession", "Title", "Category", "Lost Qty", "Replacement Value"],
      rows: lostRows,
    },
    {
      id: "damaged",
      title: "Damaged books report",
      description: "Damaged copies requiring repair, replacement, or fine follow-up.",
      filename: "library-damaged-books.csv",
      headers: ["Accession", "Title", "Category", "Damaged Qty", "Shelf"],
      rows: damagedRows,
    },
    {
      id: "student-history",
      title: "Student borrowing history",
      description: "Borrowing trail by student, class, title, issue date, and status.",
      filename: "library-student-borrowing-history.csv",
      headers: ["Admission No", "Student", "Class", "Title", "Issued At", "Due Date", "Status"],
      rows: historyRows,
    },
    {
      id: "valuation",
      title: "Inventory valuation",
      description: "Book stock quantities, condition counts, unit value, and total value.",
      filename: "library-inventory-valuation.csv",
      headers: ["Accession", "Title", "Category", "Total", "Available", "Damaged", "Lost", "Unit Value", "Total Value"],
      rows: valuationRows,
    },
  ];
}
