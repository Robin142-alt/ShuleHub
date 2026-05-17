import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderSecurityScanMarkdown,
  runSecurityScan,
} from './security-scan';
import { buildPassingSources } from './tenant-isolation-audit.test';

test('runSecurityScan passes when security and tenant evidence is present', () => {
  const sources = {
    ...buildPassingSources(),
    ...buildSecuritySources(),
  };
  const result = runSecurityScan({
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: sources,
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => check.status === 'pass'), true);
});

test('runSecurityScan fails when auth UI exposes demo credentials', () => {
  const sources = {
    ...buildPassingSources(),
    ...buildSecuritySources(),
    'apps/web/src/components/auth/school-login-view.tsx': 'demo credentials password=secret',
  };
  const result = runSecurityScan({
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: sources,
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'no-visible-demo-credentials')?.status, 'fail');
});

test('renderSecurityScanMarkdown includes tenant isolation section', () => {
  const result = runSecurityScan({
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: {
      ...buildPassingSources(),
      ...buildSecuritySources(),
    },
  });
  const markdown = renderSecurityScanMarkdown(result);

  assert.match(markdown, /Implementation 10 Security Scan/);
  assert.match(markdown, /Tenant Isolation/);
  assert.equal(markdown.includes('password=secret'), false);
});

function buildSecuritySources(): Record<string, string> {
  return {
    'apps/web/src/components/auth/superadmin-login-view.tsx': 'ShuleHub never asks users to share passwords',
    'apps/web/src/components/auth/school-login-view.tsx': 'Email address Password',
    'apps/web/src/components/auth/portal-login-view.tsx': 'Private records',
    'apps/web/src/components/auth/public-school-login-view.tsx': 'Secure session',
    'apps/api/src/auth/auth-recovery.service.ts': 'const tokenHash = this.hashToken(token);',
    'apps/api/src/auth/auth-schema.service.ts': 'input_token_hash text NOT NULL',
    'apps/api/src/auth/repositories/invitations.repository.ts': 'token_hash',
  };
}
