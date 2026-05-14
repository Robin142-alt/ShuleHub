import assert from 'node:assert/strict';
import test from 'node:test';

import { PATH_METADATA } from '@nestjs/common/constants';

import { PERMISSIONS_KEY } from '../../auth/auth.constants';
import { LibraryController } from './library.controller';
import { LibrarySchemaService } from './library-schema.service';
import { LibraryService } from './library.service';

test('LibrarySchemaService creates tenant-scoped circulation tables with forced RLS', async () => {
  let schemaSql = '';
  const service = new LibrarySchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS library_catalog_items/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS library_circulation_ledger/);
  assert.match(schemaSql, /ALTER TABLE library_copies FORCE ROW LEVEL SECURITY/);
});

test('LibraryService prevents issuing an already issued copy', async () => {
  const service = new LibraryService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      findCopyForUpdate: async () => ({ id: 'copy-1', status: 'issued' }),
      issueCopy: async () => {
        throw new Error('issued copy must not be issued again');
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.issueCopy({
        copy_id: 'copy-1',
        borrower_id: 'borrower-1',
        due_on: '2026-05-30',
      }),
    /copy is not available/,
  );
});

test('LibraryService preserves reservation order when reserving unavailable copies', async () => {
  const service = new LibraryService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      createReservation: async () => ({
        id: 'reservation-1',
        queue_position: 3,
      }),
      appendLedger: async () => undefined,
    } as never,
    {} as never,
  );

  const reservation = await service.reserveCopy({
    catalog_item_id: 'catalog-1',
    borrower_id: 'borrower-1',
  });

  assert.equal(reservation.queue_position, 3);
});

test('LibraryService creates billing handoff for overdue fines during return', async () => {
  const calls: string[] = [];
  const service = new LibraryService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      findLoanForReturn: async () => ({
        id: 'loan-1',
        copy_id: 'copy-1',
        borrower_id: 'borrower-1',
        due_on: '2026-05-01',
      }),
      returnCopy: async () => {
        calls.push('return');
        return { id: 'loan-1', status: 'returned' };
      },
      createFine: async () => {
        calls.push('fine');
        return { id: 'fine-1', amount_minor: 5000 };
      },
      appendLedger: async () => {
        calls.push('ledger');
      },
    } as never,
    {
      createLibraryFineCharge: async () => {
        calls.push('billing');
      },
    } as never,
  );

  const returned = await service.returnCopy({
    loan_id: 'loan-1',
    returned_on: '2026-05-06',
    daily_fine_minor: 1000,
  });

  assert.equal(returned.status, 'returned');
  assert.deepEqual(calls, ['return', 'fine', 'billing', 'ledger']);
});

test('LibraryController exposes circulation ledger as a read endpoint', () => {
  const handler = LibraryController.prototype.listCirculation as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'circulation');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), ['library:read']);
});

test('LibraryService lists circulation ledger for the current tenant', async () => {
  let capturedInput: Record<string, unknown> | null = null;
  const service = new LibraryService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      listCirculation: async (input: Record<string, unknown>) => {
        capturedInput = input;
        return [
          {
            id: 'ledger-1',
            borrower_id: 'borrower-1',
            action: 'issue',
            copy_id: 'copy-1',
          },
        ];
      },
    } as never,
    {} as never,
  );

  const rows = await (service as unknown as {
    listCirculation: (query: Record<string, string | undefined>) => Promise<Array<Record<string, unknown>>>;
  }).listCirculation({
    borrower_id: ' borrower-1 ',
    action: 'issue',
  });

  assert.deepEqual(capturedInput, {
    tenant_id: 'tenant-a',
    borrower_id: 'borrower-1',
    action: 'issue',
  });
  assert.equal(rows[0]?.id, 'ledger-1');
});
