import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { ACCESS_TOKEN_TYPE } from '../src/auth/auth.constants';
import { JwtTokenPayload } from '../src/auth/auth.interfaces';
import { InMemoryRedis } from './support/in-memory-redis';
import { AuthSecurityTestModule } from './support/auth-security-test.module';

jest.setTimeout(180000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  role: string;
  session_id: string;
  access_token: string;
  refresh_token: string;
};

const ensureIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-integration-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-integration-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'integration-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for auth security integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-auth-security-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

describe('Authentication and authorization hardening', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let jwtService: JwtService;
  let pool: Pool;
  let tenantOwner: RegisteredTenantUser;
  let tenantMember: RegisteredTenantUser;
  let otherTenantOwner: RegisteredTenantUser;

  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [AuthSecurityTestModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(new InMemoryRedis())
      .compile();

    jwtService = testingModule.get(JwtService);

    app = testingModule.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    tenantOwner = await registerTenantUser(
      app,
      `autha-${suffix}`,
      `owner+a-${suffix}@example.test`,
    );
    tenantMember = await registerTenantUser(
      app,
      tenantOwner.tenant_id,
      `member+a-${suffix}@example.test`,
    );
    otherTenantOwner = await registerTenantUser(
      app,
      `authb-${suffix}`,
      `owner+b-${suffix}@example.test`,
    );
  });

  afterAll(async () => {
    await cleanupSeedData(
      pool,
      [tenantOwner, tenantMember, otherTenantOwner].filter(Boolean),
    );
    await app?.close();
    await pool?.end();
  });

  test('blocks tampered JWTs', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tamperJwtPayloadClaim(tenantOwner.access_token, 'role', 'owner-admin')}`)
      .expect(401);

    expect(response.body.message).toContain('Token validation failed');
  });

  test('rejects expired access tokens', async () => {
    const expiredToken = await signAccessToken(jwtService, {
      user_id: tenantOwner.user_id,
      tenant_id: tenantOwner.tenant_id,
      role: tenantOwner.role,
      session_id: tenantOwner.session_id,
      token_id: randomUUID(),
      expires_in: -60,
    });

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.message).toContain('Token validation failed');
  });

  test('blocks role-escalation tokens and enforces RBAC owner routes', async () => {
    await request(app.getHttpServer())
      .get('/security-probe/owner-only')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantMember.access_token}`)
      .expect(403);

    const escalatedToken = await signAccessToken(jwtService, {
      user_id: tenantMember.user_id,
      tenant_id: tenantMember.tenant_id,
      role: 'owner',
      session_id: tenantMember.session_id,
      token_id: randomUUID(),
      expires_in: 900,
    });

    const response = await request(app.getHttpServer())
      .get('/security-probe/owner-only')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${escalatedToken}`)
      .expect(401);

    expect(response.body.message).toContain('out of sync with the active session');
  });

  test('denies tenant login when the user has no membership in that tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('host', otherTenantOwner.host)
      .send({
        email: tenantMember.email,
        password: tenantMember.password,
      })
      .expect(401);

    expect(response.body.message).toContain('does not have access to this tenant');
  });

  test('blocks cross-tenant token reuse on another tenant host', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', otherTenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(401);

    expect(response.body.message).toContain('does not belong to this tenant');
  });

  test('enforces ABAC ownership rules even when RBAC permissions allow the route', async () => {
    await request(app.getHttpServer())
      .get(`/security-probe/users/${tenantMember.user_id}`)
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantMember.access_token}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/security-probe/users/${tenantOwner.user_id}`)
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantMember.access_token}`)
      .expect(403);

    expect(response.body.message).toContain('Attribute-based access denied');
  });
});

const registerTenantUser = async (
  app: INestApplication,
  tenantId: string,
  email: string,
): Promise<RegisteredTenantUser> => {
  const password = `SecurePass!${tenantId.slice(-4)}`;
  const host = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;

  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .set('host', host)
    .send({
      email,
      password,
      display_name: `User ${tenantId}`,
    })
    .expect(201);

  return {
    tenant_id: tenantId,
    host,
    email,
    password,
    user_id: response.body.user.user_id,
    role: response.body.user.role,
    session_id: response.body.user.session_id,
    access_token: response.body.tokens.access_token,
    refresh_token: response.body.tokens.refresh_token,
  };
};

const signAccessToken = async (
  jwtService: JwtService,
  input: {
    user_id: string;
    tenant_id: string;
    role: string;
    session_id: string;
    token_id: string;
    expires_in: number;
  },
): Promise<string> => {
  const payload: JwtTokenPayload = {
    sub: input.user_id,
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    role: input.role,
    audience: 'school',
    session_id: input.session_id,
    token_id: input.token_id,
    type: ACCESS_TOKEN_TYPE,
  };

  return jwtService.signAsync(payload, {
    secret: process.env.JWT_ACCESS_TOKEN_SECRET,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    expiresIn: input.expires_in,
  });
};

const tamperJwtPayloadClaim = (
  token: string,
  claim: string,
  nextValue: string,
): string => {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    throw new Error('Invalid JWT shape');
  }

  const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  decodedPayload[claim] = nextValue;

  return `${header}.${Buffer.from(JSON.stringify(decodedPayload)).toString('base64url')}.${signature}`;
};

const cleanupSeedData = async (
  pool: Pool,
  tenantUsers: RegisteredTenantUser[],
): Promise<void> => {
  if (tenantUsers.length === 0) {
    return;
  }

  const tenantIds = [...new Set(tenantUsers.map((tenantUser) => tenantUser.tenant_id))];
  const emails = tenantUsers.map((tenantUser) => tenantUser.email.toLowerCase());
  const ownerClient = await pool.connect();

  try {
    await ownerClient.query('BEGIN');
    await ownerClient.query(`DELETE FROM students WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM role_permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM roles WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
    await ownerClient.query('COMMIT');
  } catch (error) {
    await ownerClient.query('ROLLBACK');
    throw error;
  } finally {
    ownerClient.release();
  }
};
