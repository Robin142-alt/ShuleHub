import assert from 'node:assert/strict';
import test from 'node:test';

import { AdmissionsRepository } from './repositories/admissions.repository';

test('AdmissionsRepository summary treats three uploads as the complete admissions document set', async () => {
  const queries: string[] = [];
  const repository = new AdmissionsRepository({
    query: async (sql: string) => {
      queries.push(sql);

      if (sql.includes('COUNT(*)::text AS total')) {
        return { rows: [{ total: '0' }] };
      }

      return { rows: [] };
    },
  } as never);

  await repository.buildSummary('tenant-a');

  const missingDocumentsQuery = queries.find((sql) => sql.includes('COUNT(document.id)::int AS uploaded_documents'));
  assert.ok(missingDocumentsQuery);
  assert.match(missingDocumentsQuery, /HAVING COUNT\(document\.id\) < 3/);
});
