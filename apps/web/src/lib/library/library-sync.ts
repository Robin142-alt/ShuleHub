import type {
  LibraryBorrowInput,
  LibraryReturnInput,
} from "@/lib/library/library-data";
import { getCsrfToken } from "@/lib/auth/csrf-client";

export interface LibrarySyncResult {
  synced: boolean;
  message: string;
  upstream?: unknown;
}

export function buildLibraryBorrowSyncPayload(input: LibraryBorrowInput) {
  return {
    member_id: input.memberId,
    book_id: input.bookId,
    due_date: input.dueDate,
    submission_id: input.submissionId,
    notes: `Issued by ${input.issuedBy}`,
  };
}

export function buildLibraryReturnSyncPayload(input: LibraryReturnInput) {
  return {
    borrowing_id: input.borrowingId,
    condition: input.condition,
    returned_at: input.returnedAt,
    notes: [input.notes?.trim(), `Received by ${input.receivedBy}`]
      .filter(Boolean)
      .join(" | "),
  };
}

async function postLibrarySync(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-shulehub-csrf": await getCsrfToken(),
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as LibrarySyncResult | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Live library API sync failed.");
  }

  return body ?? {
    synced: false,
    message: "Live library API did not return a sync response.",
  };
}

export function syncLibraryBorrowing(input: LibraryBorrowInput) {
  return postLibrarySync(
    "/api/library/borrowings",
    buildLibraryBorrowSyncPayload(input),
  );
}

export function syncLibraryReturn(input: LibraryReturnInput) {
  return postLibrarySync(
    "/api/library/returns",
    buildLibraryReturnSyncPayload(input),
  );
}
