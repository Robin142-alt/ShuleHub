import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { LibraryWorkspace } from "@/components/library/library-workspace";
import {
  buildLibraryReports,
  createLibraryDataset,
  issueLibraryBook,
  libraryPermissions,
  librarySidebarItems,
  returnLibraryBook,
} from "@/lib/library/library-data";
import {
  buildLibraryBorrowSyncPayload,
  buildLibraryReturnSyncPayload,
} from "@/lib/library/library-sync";

import { renderWithProviders } from "./test-utils";

describe("librarian library workspace", () => {
  it("exposes only school library permissions and navigation", () => {
    expect(libraryPermissions).toEqual([
      "library.view",
      "library.catalog.manage",
      "library.borrow",
      "library.return",
      "library.reports",
    ]);

    expect(librarySidebarItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Catalog",
      "Borrowing",
      "Scan Issue",
      "Scan Return",
      "Returns",
      "Overdue",
      "Members",
      "Fines",
      "Reports",
      "Activity Log",
    ]);
  });

  it("issues a book with a receipt and updates inventory immediately", () => {
    const dataset = createLibraryDataset();
    const book = dataset.books.find((item) => item.accessionNumber === "LIB-MATH-0007");

    expect(book?.quantityAvailable).toBe(14);

    const result = issueLibraryBook(dataset, {
      memberId: "member-sh-24011",
      bookId: "book-math-g7",
      dueDate: "2026-05-21",
      issuedBy: "Librarian Amani Prep",
      submissionId: "borrow-001",
    });

    const updatedBook = result.dataset.books.find((item) => item.id === "book-math-g7");
    expect(updatedBook?.quantityAvailable).toBe(13);
    expect(result.borrowReceipt.reference).toMatch(/^LIB-ISS-/);
    expect(result.borrowReceipt).toMatchObject({
      borrower: "Akinyi Wanjiru",
      admissionOrStaffNo: "SH-24011",
      className: "Grade 7 Hope",
      title: "Spotlight Mathematics Grade 7",
      accessionNumber: "LIB-MATH-0007",
      dueDate: "2026-05-21",
      issuedBy: "Librarian Amani Prep",
    });
    expect(result.dataset.borrowings[0]).toMatchObject({
      bookId: "book-math-g7",
      memberId: "member-sh-24011",
      status: "borrowed",
      dueDate: "2026-05-21",
    });
    expect(result.dataset.activityLogs[0]).toMatchObject({
      action: "issued book",
      affectedItem: "Spotlight Mathematics Grade 7",
    });
  });

  it("blocks borrowing when a title has no available copies", () => {
    const dataset = createLibraryDataset();

    expect(() =>
      issueLibraryBook(dataset, {
        memberId: "member-sh-24011",
        bookId: "book-kamusi",
        dueDate: "2026-05-21",
        issuedBy: "Librarian Amani Prep",
      }),
    ).toThrow("No available copies for Kamusi ya Karne ya 21.");
  });

  it("returns overdue books, applies pending fines, and restores stock", () => {
    const dataset = createLibraryDataset();

    const result = returnLibraryBook(dataset, {
      borrowingId: "borrow-overdue-blossoms",
      condition: "good",
      returnedAt: "2026-05-07",
      receivedBy: "Librarian Amani Prep",
    });

    const returnedBorrowing = result.dataset.borrowings.find(
      (borrowing) => borrowing.id === "borrow-overdue-blossoms",
    );
    const blossoms = result.dataset.books.find((book) => book.id === "book-blossoms");

    expect(returnedBorrowing?.status).toBe("returned");
    expect(blossoms?.quantityAvailable).toBe(7);
    expect(result.returnReceipt.overdueDays).toBe(6);
    expect(result.returnReceipt.fineAmount).toBe(60);
    expect(result.dataset.fines[0]).toMatchObject({
      memberId: "member-sh-24011",
      borrowingId: "borrow-overdue-blossoms",
      category: "overdue",
      status: "pending",
      amount: 60,
    });
    expect(result.dataset.activityLogs[0]).toMatchObject({
      action: "returned book",
      affectedItem: "Blossoms of the Savannah",
    });
  });

  it("generates the required operational report set", () => {
    const reports = buildLibraryReports(createLibraryDataset());

    expect(reports.map((report) => report.title)).toEqual([
      "Borrowed books report",
      "Overdue report",
      "Popular books report",
      "Lost books report",
      "Damaged books report",
      "Student borrowing history",
      "Inventory valuation",
    ]);
  });

  it("maps local borrow and return workflows to backend sync payloads", () => {
    expect(
      buildLibraryBorrowSyncPayload({
        memberId: "00000000-0000-0000-0000-000000000111",
        bookId: "00000000-0000-0000-0000-000000000222",
        dueDate: "2026-05-21",
        issuedBy: "Librarian Amani Prep",
        submissionId: "borrow-001",
      }),
    ).toEqual({
      member_id: "00000000-0000-0000-0000-000000000111",
      book_id: "00000000-0000-0000-0000-000000000222",
      due_date: "2026-05-21",
      submission_id: "borrow-001",
      notes: "Issued by Librarian Amani Prep",
    });

    expect(
      buildLibraryReturnSyncPayload({
        borrowingId: "00000000-0000-0000-0000-000000000333",
        condition: "damaged",
        returnedAt: "2026-05-07",
        receivedBy: "Librarian Amani Prep",
        notes: "Cover torn",
      }),
    ).toEqual({
      borrowing_id: "00000000-0000-0000-0000-000000000333",
      condition: "damaged",
      returned_at: "2026-05-07",
      notes: "Cover torn | Received by Librarian Amani Prep",
    });
  });

  it("renders a dense librarian dashboard without finance, payroll, or admin exposure", async () => {
    renderWithProviders(createElement(LibraryWorkspace, { section: "dashboard" }));

    expect(screen.getByRole("heading", { name: /librarian dashboard/i })).toBeVisible();
    expect(screen.getByText(/Books issued today/i)).toBeVisible();
    expect(screen.getByText(/Overdue books/i)).toBeVisible();
    expect(screen.getByText(/Available books/i)).toBeVisible();
    expect(screen.getByText(/Missing books/i)).toBeVisible();
    expect(screen.getByText(/Damaged books/i)).toBeVisible();
    expect(screen.getByText(/Active borrowers/i)).toBeVisible();
    expect(screen.getByText(/Popular books/i)).toBeVisible();
    expect(screen.getByText(/Recently returned books/i)).toBeVisible();
    expect(screen.queryByText(/Finance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Payroll/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Billing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/System configuration/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Issue book/i }));
    expect(screen.getByRole("heading", { name: /Issue library book/i })).toBeVisible();
  });
});
