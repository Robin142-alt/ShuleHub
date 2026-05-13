/* ─── Auth & Tenant Type Definitions ─────────────────────────────── */

/** System-level access domains — completely isolated */
export type SystemDomain = "superadmin" | "school" | "portal";

/** Super admin roles */
export type SuperAdminRole = "platform_owner" | "support_agent" | "finance_admin" | "operations";

/** School ERP roles */
export type SchoolRole =
  | "principal"
  | "bursar"
  | "teacher"
  | "registrar"
  | "accountant"
  | "admin"
  | "storekeeper"
  | "librarian"
  | "admissions";

/** Portal roles */
export type PortalRole = "parent" | "student";

/** Union of all roles */
export type UserRole = SuperAdminRole | SchoolRole | PortalRole;

/** JWT token pair */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

/** Authenticated user */
export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  avatar?: string;
  domain: SystemDomain;
  role: UserRole;
  tenantId?: string;
  permissions: string[];
  lastLoginAt: string;
  mfaEnabled: boolean;
}

/** Session metadata */
export interface AuthSession {
  id: string;
  user: AuthUser;
  tokens: TokenPair;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  trustedDevice: boolean;
}

/** Tenant (school) resolution */
export interface TenantResolution {
  status: "resolved" | "fallback" | "unknown";
  tenantId: string;
  slug: string;
  name: string;
  logoUrl?: string;
  primaryColor: string;
  county: string;
  supportEmail: string;
  supportPhone: string;
  subscriptionStatus: "active" | "trial" | "grace" | "suspended";
}

/** Auth state for context */
export interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/** Login credentials by system */
export interface SuperAdminCredentials {
  email: string;
  password: string;
  verificationCode?: string;
  trustDevice?: boolean;
}

export interface SchoolCredentials {
  identifier: string; // email or phone
  password: string;
  rememberMe?: boolean;
  tenantSlug: string;
}

export interface PortalCredentials {
  identifier: string; // admission number or phone
  secret: string; // password or PIN
}

/** Route guard config */
export interface RouteGuardConfig {
  domain: SystemDomain;
  requiredRoles?: UserRole[];
  requireMfa?: boolean;
  requireTenant?: boolean;
}
