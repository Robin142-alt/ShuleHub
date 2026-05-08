import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';

import { TenantService } from './tenant.service';

function createTenantService(defaultTenantId = 'default-school') {
  return new TenantService({
    get: (key: string) => {
      if (key === 'app.baseDomain') return 'shulehub.test';
      if (key === 'app.defaultTenantId') return defaultTenantId;
      return undefined;
    },
  } as never);
}

test('TenantService prefers a validated forwarded tenant id for single-domain deployments', () => {
  const service = createTenantService();

  assert.equal(
    service.resolveTenantId('shulehub-production.up.railway.app', 'barakaacademy'),
    'barakaacademy',
  );
});

test('TenantService rejects malformed forwarded tenant ids', () => {
  const service = createTenantService();

  assert.throws(
    () => service.resolveTenantId('shulehub-production.up.railway.app', '../admin'),
    BadRequestException,
  );
});
