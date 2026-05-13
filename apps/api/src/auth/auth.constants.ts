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
export const DEFAULT_ROLE_PLATFORM_OWNER = 'platform_owner';
export const DEFAULT_ROLE_ADMIN = 'admin';
export const DEFAULT_ROLE_MEMBER = 'member';
export const DEFAULT_ROLE_PRINCIPAL = 'principal';
export const DEFAULT_ROLE_BURSAR = 'bursar';
export const DEFAULT_ROLE_TEACHER = 'teacher';
export const DEFAULT_ROLE_STOREKEEPER = 'storekeeper';
export const DEFAULT_ROLE_LIBRARIAN = 'librarian';
export const DEFAULT_ROLE_PARENT = 'parent';
export const DEFAULT_ROLE_SUPPORT_AGENT = 'support_agent';
export const DEFAULT_ROLE_SUPPORT_LEAD = 'support_lead';

const DEFAULT_ROLE_DASHBOARD_PATHS: Record<string, string> = {
  superadmin: '/superadmin/dashboard',
  [DEFAULT_ROLE_OWNER]: '/dashboard',
  [DEFAULT_ROLE_PLATFORM_OWNER]: '/superadmin/dashboard',
  [DEFAULT_ROLE_ADMIN]: '/dashboard',
  [DEFAULT_ROLE_MEMBER]: '/dashboard',
  [DEFAULT_ROLE_PRINCIPAL]: '/dashboard',
  [DEFAULT_ROLE_BURSAR]: '/finance/dashboard',
  [DEFAULT_ROLE_TEACHER]: '/academics/dashboard',
  [DEFAULT_ROLE_STOREKEEPER]: '/inventory/dashboard',
  [DEFAULT_ROLE_LIBRARIAN]: '/library/dashboard',
  [DEFAULT_ROLE_PARENT]: '/portal/dashboard',
  [DEFAULT_ROLE_SUPPORT_AGENT]: '/superadmin/support',
  [DEFAULT_ROLE_SUPPORT_LEAD]: '/superadmin/support',
};

export const getDefaultDashboardPathForRole = (role: string): string =>
  DEFAULT_ROLE_DASHBOARD_PATHS[role] ?? '/dashboard';

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
  { resource: 'library', action: 'view', description: 'View library workspace and records' },
  { resource: 'library', action: 'catalog.manage', description: 'Manage library catalog and members' },
  { resource: 'library', action: 'borrow', description: 'Issue books to borrowers' },
  { resource: 'library', action: 'return', description: 'Receive returns and manage fines' },
  { resource: 'library', action: 'reports', description: 'View and export library reports' },
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
  { resource: 'finance', action: 'read', description: 'View school finance dashboards' },
  { resource: 'finance', action: 'write', description: 'Manage school finance operations' },
  { resource: 'academics', action: 'read', description: 'View academic dashboards and classes' },
  { resource: 'academics', action: 'write', description: 'Manage lessons, marks, and class records' },
  { resource: 'reports', action: 'read', description: 'View operational reports' },
  { resource: 'portal', action: 'read', description: 'View linked parent or student portal data' },
  { resource: 'support', action: 'view', description: 'View tenant support tickets and support resources' },
  { resource: 'support', action: 'create', description: 'Create tenant support tickets' },
  { resource: 'support', action: 'reply', description: 'Reply to support ticket conversations and upload support attachments' },
  { resource: 'support', action: 'manage', description: 'Manage, assign, escalate, resolve, and analyze support tickets' },
] as const;

export const DEFAULT_ROLE_CATALOG = [
  {
    code: DEFAULT_ROLE_PLATFORM_OWNER,
    name: 'Platform Owner',
    description: 'Full platform control center access for SaaS operators',
    permissions: ['*:*'],
  },
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
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_MEMBER,
    name: 'Member',
    description: 'Standard tenant access',
    permissions: [
      'auth:read',
      'users:read',
      'students:read',
      'attendance:read',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_PRINCIPAL,
    name: 'Principal',
    description: 'Institution leader with full operational oversight for the school tenant',
    permissions: ['*:*'],
  },
  {
    code: DEFAULT_ROLE_BURSAR,
    name: 'Bursar',
    description: 'Finance operator for fee, payment, billing, and reporting workflows',
    permissions: [
      'auth:read',
      'users:read',
      'students:read',
      'finance:read',
      'finance:write',
      'billing:read',
      'billing:write',
      'reports:read',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_TEACHER,
    name: 'Teacher',
    description: 'Academic staff access for learners, attendance, classes, and assessment workflows',
    permissions: [
      'auth:read',
      'students:read',
      'attendance:read',
      'attendance:write',
      'academics:read',
      'academics:write',
      'reports:read',
      'support:view',
      'support:create',
      'support:reply',
    ],
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
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_LIBRARIAN,
    name: 'Librarian',
    description: 'Library-only catalog, borrowing, returns, fines, and reports access',
    permissions: [
      'auth:read',
      'library:view',
      'library:catalog.manage',
      'library:borrow',
      'library:return',
      'library:reports',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_SUPPORT_AGENT,
    name: 'Support Agent',
    description: 'Platform support operator who manages school tickets and customer conversations',
    permissions: [
      'auth:read',
      'support:view',
      'support:create',
      'support:reply',
      'support:manage',
      'reports:read',
    ],
  },
  {
    code: DEFAULT_ROLE_SUPPORT_LEAD,
    name: 'Support Lead',
    description: 'Platform support lead with full support queue, SLA, assignment, and analytics control',
    permissions: [
      'auth:read',
      'support:view',
      'support:create',
      'support:reply',
      'support:manage',
      'reports:read',
      'users:read',
    ],
  },
  {
    code: DEFAULT_ROLE_PARENT,
    name: 'Parent',
    description: 'Family portal access for linked learners, balances, messages, and reports',
    permissions: [
      'auth:read',
      'portal:read',
      'students:read',
      'attendance:read',
      'academics:read',
      'billing:read',
    ],
  },
] as const;
