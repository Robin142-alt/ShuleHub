import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { LibraryService } from './library.service';

test('LibraryService issues a book, decrements available stock, and logs activity', async () => {
  const requestContext = new RequestContextService();
  const stockUpdates: Array<Record<string, unknown>> = [];
  const activityLogs: Array<Record<string, unknown>> = [];

  const service = new LibraryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findMemberById: async () => ({
        id: '00000000-0000-0000-0000-000000000111',
        tenant_id: 'tenant-a',
        member_type: 'student',
        admission_or_staff_no: 'SH-24011',
        full_name: 'Akinyi Wanjiru',
        class_or_department: 'Grade 7 Hope',
        contact: '+254711111111',
        status: 'active',
      }),
      findBookById: async () => ({
        id: '00000000-0000-0000-0000-000000000222',
        tenant_id: 'tenant-a',
        accession_number: 'LIB-MATH-0007',
        isbn: '9789966561113',
        title: 'Spotlight Mathematics Grade 7',
        category: 'Mathematics',
        quantity_total: 18,
        quantity_available: 14,
        quantity_damaged: 1,
        quantity_lost: 0,
        status: 'available',
      }),
      findOpenBorrowingForBookAndMember: async () => null,
      createBorrowing: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000333',
        ...input,
        status: 'borrowed',
      }),
      updateBookQuantities: async (_tenantId: string, bookId: string, input: Record<string, unknown>) => {
        stockUpdates.push({ bookId, ...input });
      },
      logActivity: async (input: Record<string, unknown>) => {
        activityLogs.push(input);
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-library-issue-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'librarian',
      session_id: 'session-1',
      permissions: ['library:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/library/borrowings',
      started_at: '2026-05-07T08:00:00.000Z',
    },
    () =>
      service.issueBook({
        member_id: '00000000-0000-0000-0000-000000000111',
        book_id: '00000000-0000-0000-0000-000000000222',
        due_date: '2026-05-21',
        submission_id: 'borrow-001',
      }),
  );

  assert.match(response.receipt.reference, /^LIB-ISS-/);
  assert.equal(response.receipt.borrower, 'Akinyi Wanjiru');
  assert.equal(response.receipt.title, 'Spotlight Mathematics Grade 7');
  assert.deepEqual(stockUpdates, [
    {
      bookId: '00000000-0000-0000-0000-000000000222',
      quantity_available: 13,
      status: 'available',
    },
  ]);
  assert.equal(activityLogs.length, 1);
  assert.equal(activityLogs[0]?.action, 'issued book');
  assert.equal(activityLogs[0]?.affected_item, 'Spotlight Mathematics Grade 7');
});

test('LibraryService returns an overdue book, applies a pending fine, and restores stock', async () => {
  const requestContext = new RequestContextService();
  const createdFines: Array<Record<string, unknown>> = [];
  const stockUpdates: Array<Record<string, unknown>> = [];
  const closedBorrowings: Array<Record<string, unknown>> = [];

  const service = new LibraryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findBorrowingById: async () => ({
        id: '00000000-0000-0000-0000-000000000333',
        tenant_id: 'tenant-a',
        book_id: '00000000-0000-0000-0000-000000000222',
        member_id: '00000000-0000-0000-0000-000000000111',
        borrowed_at: '2026-04-24T08:00:00.000Z',
        due_date: '2026-05-01',
        returned_at: null,
        status: 'overdue',
        book_title: 'Blossoms of the Savannah',
        accession_number: 'LIB-LIT-0042',
        member_name: 'Akinyi Wanjiru',
        admission_or_staff_no: 'SH-24011',
        class_or_department: 'Grade 7 Hope',
      }),
      findBookById: async () => ({
        id: '00000000-0000-0000-0000-000000000222',
        tenant_id: 'tenant-a',
        accession_number: 'LIB-LIT-0042',
        title: 'Blossoms of the Savannah',
        category: 'Literature',
        quantity_total: 10,
        quantity_available: 6,
        quantity_damaged: 0,
        quantity_lost: 0,
        status: 'borrowed',
      }),
      createReturn: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000444',
        ...input,
      }),
      markBorrowingReturned: async (_tenantId: string, borrowingId: string, input: Record<string, unknown>) => {
        closedBorrowings.push({ borrowingId, ...input });
      },
      updateBookQuantities: async (_tenantId: string, bookId: string, input: Record<string, unknown>) => {
        stockUpdates.push({ bookId, ...input });
      },
      createFine: async (input: Record<string, unknown>) => {
        createdFines.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000555',
          ...input,
        };
      },
      logActivity: async () => undefined,
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-library-return-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'librarian',
      session_id: 'session-1',
      permissions: ['library:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/library/returns',
      started_at: '2026-05-07T10:00:00.000Z',
    },
    () =>
      service.returnBook({
        borrowing_id: '00000000-0000-0000-0000-000000000333',
        condition: 'good',
        returned_at: '2026-05-07',
        fine_per_overdue_day: 10,
      }),
  );

  assert.equal(response.receipt.overdue_days, 6);
  assert.equal(response.receipt.fine_amount, 60);
  assert.equal(createdFines.length, 1);
  assert.equal(createdFines[0]?.category, 'overdue');
  assert.equal(createdFines[0]?.amount, 60);
  assert.equal(createdFines[0]?.status, 'pending');
  assert.deepEqual(stockUpdates, [
    {
      bookId: '00000000-0000-0000-0000-000000000222',
      quantity_available: 7,
      quantity_damaged: 0,
      quantity_lost: 0,
      status: 'available',
    },
  ]);
  assert.deepEqual(closedBorrowings, [
    {
      borrowingId: '00000000-0000-0000-0000-000000000333',
      returned_at: '2026-05-07',
      status: 'returned',
    },
  ]);
});
