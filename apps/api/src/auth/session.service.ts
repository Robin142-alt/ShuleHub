import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';

import { RedisService } from '../infrastructure/redis/redis.service';
import { AUTH_SESSION_PREFIX } from './auth.constants';
import { AuthSessionRecord, AuthenticatedPrincipal } from './auth.interfaces';

const AUTH_USER_SESSION_PREFIX = 'auth:user-sessions';

interface CreateSessionInput extends AuthenticatedPrincipal {
  email_verified_at: string | null;
  refresh_token_id: string;
  refresh_expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

@Injectable()
export class SessionService {
  constructor(private readonly redisService: RedisService) {}

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const now = new Date().toISOString();
    const session: AuthSessionRecord = {
      user_id: input.user_id,
      tenant_id: input.tenant_id,
      role: input.role,
      audience: input.audience,
      permissions: input.permissions,
      session_id: input.session_id,
      is_authenticated: true,
      email_verified_at: input.email_verified_at,
      refresh_token_id: input.refresh_token_id,
      created_at: now,
      updated_at: now,
      refresh_expires_at: input.refresh_expires_at,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
    };

    await this.persistSession(session);
    return session;
  }

  async getSession(sessionId: string): Promise<AuthSessionRecord | null> {
    const rawSession = await this.redisService.getClient().get(this.getSessionKey(sessionId));

    if (!rawSession) {
      return null;
    }

    return JSON.parse(rawSession) as AuthSessionRecord;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const session = await this.getSession(sessionId);

    await redis.del(this.getSessionKey(sessionId));

    if (session) {
      await redis.srem(this.getUserSessionKey(session.user_id), sessionId);
    }
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const sessionIds = await redis.smembers(this.getUserSessionKey(userId));

    for (const sessionId of sessionIds) {
      await redis.del(this.getSessionKey(sessionId));
    }

    await redis.del(this.getUserSessionKey(userId));
  }

  async rotateRefreshToken(input: {
    session_id: string;
    current_refresh_token_id: string;
    next_refresh_token_id: string;
    role: string;
    permissions: string[];
    email_verified_at: string | null;
    refresh_expires_at: string;
  }): Promise<AuthSessionRecord> {
    const redis = this.redisService.getClient();
    const sessionKey = this.getSessionKey(input.session_id);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await redis.watch(sessionKey);

      const rawSession = await redis.get(sessionKey);

      if (!rawSession) {
        await redis.unwatch();
        throw new UnauthorizedException('Session has expired');
      }

      const currentSession = JSON.parse(rawSession) as AuthSessionRecord;

      if (currentSession.refresh_token_id !== input.current_refresh_token_id) {
        await redis.unwatch();
        await this.invalidateSession(input.session_id);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      const nextSession: AuthSessionRecord = {
        ...currentSession,
        role: input.role,
        permissions: input.permissions,
        email_verified_at: input.email_verified_at,
        refresh_token_id: input.next_refresh_token_id,
        refresh_expires_at: input.refresh_expires_at,
        updated_at: new Date().toISOString(),
      };

      const ttlSeconds = this.getSessionTtlSeconds(nextSession.refresh_expires_at);
      const result = await redis
        .multi()
        .set(sessionKey, JSON.stringify(nextSession), 'EX', ttlSeconds)
        .exec();

      if (result) {
        return nextSession;
      }
    }

    throw new ConflictException('Session rotation failed due to a concurrent update');
  }

  toPrincipal(session: AuthSessionRecord): AuthenticatedPrincipal {
    return {
      user_id: session.user_id,
      tenant_id: session.tenant_id,
      role: session.role,
      audience: session.audience,
      permissions: session.permissions,
      session_id: session.session_id,
      is_authenticated: session.is_authenticated,
    };
  }

  private async persistSession(session: AuthSessionRecord): Promise<void> {
    const ttlSeconds = this.getSessionTtlSeconds(session.refresh_expires_at);
    const redis = this.redisService.getClient();
    await redis.set(this.getSessionKey(session.session_id), JSON.stringify(session), 'EX', ttlSeconds);
    await redis.sadd(this.getUserSessionKey(session.user_id), session.session_id);
  }

  private getSessionTtlSeconds(refreshExpiresAt: string): number {
    const millisecondsUntilExpiry = new Date(refreshExpiresAt).getTime() - Date.now();
    return Math.max(1, Math.ceil(millisecondsUntilExpiry / 1000));
  }

  private getSessionKey(sessionId: string): string {
    return `${AUTH_SESSION_PREFIX}:${sessionId}`;
  }

  private getUserSessionKey(userId: string): string {
    return `${AUTH_USER_SESSION_PREFIX}:${userId}`;
  }
}
