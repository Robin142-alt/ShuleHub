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
export const DEFAULT_ROLE_TEACHER = 'teacher';
export const DEFAULT_ROLE_ACCOUNTANT = 'accountant';
export const DEFAULT_ROLE_STAFF = 'staff';
export const DEFAULT_ROLE_PARENT = 'parent';
export const DEFAULT_ROLE_STUDENT = 'student';
export const DEFAULT_ROLE_LIBRARIAN = 'librarian';
export const DEFAULT_ROLE_SUPPORT_AGENT = 'support_agent';
export const DEFAULT_ROLE_SUPPORT_LEAD = 'support_lead';
export const SUPERADMIN_ROLE_OWNER = 'platform_owner';

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
  { resource: 'finance', action: 'read', description: 'View financial operations' },
  { resource: 'finance', action: 'write', description: 'Manage financial operations' },
  { resource: 'reports', action: 'read', description: 'View generated report export jobs and snapshots' },
  { resource: 'library', action: 'read', description: 'View library operations' },
  { resource: 'library', action: 'write', description: 'Manage library operations' },
  { resource: 'students', action: 'read', description: 'View student records' },
  { resource: 'students', action: 'write', description: 'Manage student records' },
  { resource: 'inventory', action: 'read', description: 'View inventory records' },
  { resource: 'inventory', action: 'write', description: 'Manage inventory records' },
  { resource: 'academics', action: 'read', description: 'View academic years, terms, classes, subjects, and assignments' },
  { resource: 'academics', action: 'write', description: 'Manage academic setup records' },
  { resource: 'academics', action: 'assign-teachers', description: 'Manage teacher subject and class assignments' },
  { resource: 'exams', action: 'read', description: 'View exam series, marks, and report cards' },
  { resource: 'exams', action: 'write', description: 'Manage exam setup and assessments' },
  { resource: 'exams', action: 'enter-marks', description: 'Enter marks for assigned subject and class scopes' },
  { resource: 'exams', action: 'review', description: 'Review exam progress across subjects' },
  { resource: 'exams', action: 'approve', description: 'Lock, correct, and publish exam results' },
  { resource: 'hr', action: 'read', description: 'View staff management records' },
  { resource: 'hr', action: 'write', description: 'Manage staff profiles, contracts, leave, and documents' },
  { resource: 'timetable', action: 'read', description: 'View timetable planning and published schedules' },
  { resource: 'timetable', action: 'write', description: 'Manage timetable drafts and published versions' },
  { resource: 'procurement', action: 'read', description: 'View procurement workflows' },
  { resource: 'procurement', action: 'write', description: 'Manage procurement workflows' },
  { resource: 'payments', action: 'create', description: 'Initiate tenant payment requests' },
  { resource: 'admissions', action: 'read', description: 'View admissions workflows' },
  { resource: 'admissions', action: 'write', description: 'Manage admissions workflows' },
  { resource: 'documents', action: 'read', description: 'View document records' },
  { resource: 'documents', action: 'write', description: 'Manage document records' },
  { resource: 'transfers', action: 'read', description: 'View transfer workflows' },
  { resource: 'transfers', action: 'write', description: 'Manage transfer workflows' },
  { resource: 'billing', action: 'read', description: 'View SaaS billing state' },
  { resource: 'billing', action: 'write', description: 'Manage SaaS billing state' },
  { resource: 'support', action: 'view', description: 'View tenant support tickets and support resources' },
  { resource: 'support', action: 'create', description: 'Create tenant support tickets' },
  { resource: 'support', action: 'reply', description: 'Reply to support ticket conversations and upload support attachments' },
  { resource: 'support', action: 'manage', description: 'Manage, assign, escalate, resolve, and analyze support tickets' },
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
      'reports:read',
      'inventory:read',
      'inventory:write',
      'academics:read',
      'academics:write',
      'academics:assign-teachers',
      'exams:read',
      'exams:write',
      'exams:enter-marks',
      'exams:review',
      'exams:approve',
      'library:read',
      'library:write',
      'hr:read',
      'hr:write',
      'timetable:read',
      'timetable:write',
      'procurement:read',
      'procurement:write',
      'payments:create',
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
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_TEACHER,
    name: 'Teacher',
    description: 'Academic classroom access for teachers',
    permissions: [
      'auth:read',
      'students:read',
      'academics:read',
      'exams:read',
      'exams:enter-marks',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_ACCOUNTANT,
    name: 'Accountant',
    description: 'Finance and billing operations access',
    permissions: [
      'auth:read',
      'finance:read',
      'finance:write',
      'billing:read',
      'billing:write',
      'payments:create',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_STAFF,
    name: 'Staff',
    description: 'General school staff access',
    permissions: [
      'auth:read',
      'students:read',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_PARENT,
    name: 'Parent',
    description: 'Parent portal access for invited guardians',
    permissions: [
      'auth:read',
      'payments:create',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_STUDENT,
    name: 'Student',
    description: 'Student portal access for invited learners',
    permissions: [
      'auth:read',
      'support:view',
      'support:create',
      'support:reply',
    ],
  },
  {
    code: DEFAULT_ROLE_LIBRARIAN,
    name: 'Librarian',
    description: 'Library operations access',
    permissions: [
      'auth:read',
      'library:read',
      'library:write',
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
    code: DEFAULT_ROLE_SUPPORT_AGENT,
    name: 'Support Agent',
    description: 'Platform support operator who manages school tickets and customer conversations',
    permissions: [
      'auth:read',
      'support:view',
      'support:create',
      'support:reply',
      'support:manage',
      'billing:read',
      'reports:read',
    ],
  },
  {
    code: DEFAULT_ROLE_SUPPORT_LEAD,
    name: 'Support Lead',
    description: 'Platform support lead with queue, SLA, assignment, and analytics control',
    permissions: [
      'auth:read',
      'support:view',
      'support:create',
      'support:reply',
      'support:manage',
      'users:read',
      'billing:read',
      'reports:read',
    ],
  },
] as const;
