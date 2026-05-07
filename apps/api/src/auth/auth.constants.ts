export const AUTH_ANONYMOUS_USER_ID = 'anonymous';
export const AUTH_GUEST_ROLE = 'guest';
export const AUTH_SYSTEM_ROLE = 'system';
export const AUTH_GLOBAL_TENANT_ID = 'global';
export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';
export const AUTH_SESSION_PREFIX = 'auth:session';
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const POLICY_KEY = 'policy';
export const DEFAULT_ROLE_OWNER = 'owner';
export const DEFAULT_ROLE_ADMIN = 'admin';
export const DEFAULT_ROLE_MEMBER = 'member';
export const DEFAULT_ROLE_STOREKEEPER = 'storekeeper';

export const DEFAULT_PERMISSION_CATALOG = [
  { resource: '*', action: '*', description: 'Full tenant access' },
  { resource: 'auth', action: 'read', description: 'Read authenticated identity context' },
  { resource: 'users', action: 'read', description: 'View tenant users' },
  { resource: 'users', action: 'write', description: 'Manage tenant users' },
  { resource: 'roles', action: 'read', description: 'View tenant roles' },
  { resource: 'roles', action: 'write', description: 'Manage tenant roles' },
  { resource: 'permissions', action: 'read', description: 'View tenant permissions' },
  { resource: 'permissions', action: 'write', description: 'Manage tenant permissions' },
  { resource: 'tenant_memberships', action: 'read', description: 'View tenant memberships' },
  { resource: 'tenant_memberships', action: 'write', description: 'Manage tenant memberships' },
  { resource: 'students', action: 'read', description: 'View student records' },
  { resource: 'students', action: 'write', description: 'Manage student records' },
  { resource: 'attendance', action: 'read', description: 'View attendance records' },
  { resource: 'attendance', action: 'write', description: 'Manage attendance records' },
  { resource: 'inventory', action: 'read', description: 'View inventory records' },
  { resource: 'inventory', action: 'write', description: 'Manage inventory records' },
  { resource: 'procurement', action: 'read', description: 'View procurement workflows' },
  { resource: 'procurement', action: 'write', description: 'Manage procurement workflows' },
  { resource: 'admissions', action: 'read', description: 'View admissions workflows' },
  { resource: 'admissions', action: 'write', description: 'Manage admissions workflows' },
  { resource: 'documents', action: 'read', description: 'View document records' },
  { resource: 'documents', action: 'write', description: 'Manage document records' },
  { resource: 'transfers', action: 'read', description: 'View transfer workflows' },
  { resource: 'transfers', action: 'write', description: 'Manage transfer workflows' },
  { resource: 'billing', action: 'read', description: 'View SaaS billing state' },
  { resource: 'billing', action: 'write', description: 'Manage SaaS billing state' },
] as const;

export const DEFAULT_ROLE_CATALOG = [
  {
    code: DEFAULT_ROLE_OWNER,
    name: 'Owner',
    description: 'Full access to tenant resources',
    permissions: ['*:*'],
  },
  {
    code: DEFAULT_ROLE_ADMIN,
    name: 'Administrator',
    description: 'Operational access for tenant administration',
    permissions: [
      'auth:read',
      'users:read',
      'users:write',
      'roles:read',
      'roles:write',
      'permissions:read',
      'permissions:write',
      'tenant_memberships:read',
      'tenant_memberships:write',
      'students:read',
      'students:write',
      'attendance:read',
      'attendance:write',
      'inventory:read',
      'inventory:write',
      'procurement:read',
      'procurement:write',
      'admissions:read',
      'admissions:write',
      'documents:read',
      'documents:write',
      'transfers:read',
      'transfers:write',
      'billing:read',
      'billing:write',
    ],
  },
  {
    code: DEFAULT_ROLE_MEMBER,
    name: 'Member',
    description: 'Standard tenant access',
    permissions: ['auth:read', 'users:read', 'students:read', 'attendance:read'],
  },
  {
    code: DEFAULT_ROLE_STOREKEEPER,
    name: 'Storekeeper',
    description: 'Inventory-only stock receiving, issuing, transfers, and reports',
    permissions: [
      'auth:read',
      'inventory:read',
      'inventory:write',
      'procurement:read',
      'procurement:write',
      'transfers:read',
      'transfers:write',
    ],
  },
] as const;
