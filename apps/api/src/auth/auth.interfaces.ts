import type { Request } from 'express';

export type AuthAudience = 'superadmin' | 'school' | 'portal';

export interface JwtTokenPayload {
  sub: string;
  user_id: string;
  tenant_id: string | null;
  role: string;
  audience: AuthAudience;
  session_id: string;
  token_id: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedPrincipal {
  user_id: string;
  tenant_id: string | null;
  role: string;
  audience: AuthAudience;
  permissions: string[];
  session_id: string;
  is_authenticated: boolean;
}

export interface AuthSessionRecord extends AuthenticatedPrincipal {
  email_verified_at: string | null;
  refresh_token_id: string;
  created_at: string;
  updated_at: string;
  refresh_expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuthRequestMetadata {
  ip_address: string | null;
  user_agent: string | null;
}

export interface IssuedTokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  access_expires_in: number;
  refresh_expires_in: number;
  access_expires_at: string;
  refresh_expires_at: string;
  access_token_id: string;
  refresh_token_id: string;
  session_id: string;
}

export interface PolicyContext {
  tenant_id?: string;
  owner_user_id?: string;
  require_ownership?: boolean;
  attributes?: Record<string, unknown>;
  request?: Request;
}

export interface PolicyMetadata {
  resource: string;
  action: string;
  contextFactory?: (request: Request) => PolicyContext;
}
