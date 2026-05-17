import test from 'node:test';
import assert from 'node:assert/strict';

import { runMaintainabilityScan } from './maintainability-scan';

test('runMaintainabilityScan fails internal UUID copy in production forms', () => {
  const result = runMaintainabilityScan({
    workspaceRoot: process.cwd(),
    sourceOverrides: {
      'apps/web/src/components/school/school-pages.tsx': 'placeholder="Student UUID"',
      'apps/web/src/components/discipline/discipline-workspace.tsx': 'Student record ID',
      'apps/web/src/components/library/library-workspace.tsx': 'Scan student ID',
      'apps/web/src/app/support/status/page.tsx': 'Live status unavailable',
      '.gitignore': 'apps/web/test-results/',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'no-internal-id-copy')?.status, 'fail');
});

test('runMaintainabilityScan passes practical production copy and artifact hygiene', () => {
  const result = runMaintainabilityScan({
    workspaceRoot: process.cwd(),
    sourceOverrides: {
      'apps/web/src/components/school/school-pages.tsx': 'Search learner by name or admission number',
      'apps/web/src/components/discipline/discipline-workspace.tsx': 'Search learner by name or admission number',
      'apps/web/src/components/library/library-workspace.tsx': 'Learner name or admission number',
      'apps/web/src/app/support/status/page.tsx': 'Live status temporarily unavailable',
      '.gitignore': 'apps/web/test-results/',
    },
  });

  assert.equal(result.ok, true);
});
