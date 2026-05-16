import {
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import {
  SUPERADMIN_ROLE_OWNER,
} from './auth.constants';
import {
  AuthAudience,
  AuthRequestMetadata,
  AuthenticatedPrincipal,
  IssuedTokenPair,
} from './auth.interfaces';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  AuthenticatedUserDto,
  AuthTokensDto,
} from './dto/auth-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthorizationRepository } from './repositories/authorization.repository';
import { TenantMembershipsRepository } from './repositories/tenant-memberships.repository';
import { UsersRepository } from './repositories/users.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { TrustedDeviceService } from './trusted-device.service';
import { TenantMembershipEntity } from './entities/tenant-membership.entity';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly usersRepository: UsersRepository,
    private readonly tenantMembershipsRepository: TenantMembershipsRepository,
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    @Optional() private readonly mfaService?: MfaService,
    @Optional() private readonly trustedDeviceService?: TrustedDeviceService,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  extractBearerToken(request: Request): string | null {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      return null;
    }

    const normalizedValue = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    if (!normalizedValue?.startsWith('Bearer ')) {
      return null;
    }

    const token = normalizedValue.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  async authenticateAccessToken(
    accessToken: string,
    expectedTenantId: string | null,
    expectedAudience: AuthAudience,
  ): Promise<AuthenticatedPrincipal> {
    const payload = await this.tokenService.verifyAccessToken(accessToken);

    if (payload.audience !== expectedAudience) {
      throw new UnauthorizedException('Access token does not belong to this audience');
    }

    if (payload.tenant_id !== expectedTenantId) {
      throw new UnauthorizedException('Access token does not belong to this tenant');
    }

    const session = await this.sessionService.getSession(payload.session_id);

    if (!session) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (
      session.user_id !== payload.user_id ||
      session.tenant_id !== payload.tenant_id ||
      session.role !== payload.role ||
      session.audience !== payload.audience
    ) {
      throw new UnauthorizedException('Access token is out of sync with the active session');
    }

    await this.assertEmailVerifiedForSensitiveSession(session);

    return this.sessionService.toPrincipal(session);
  }

  async register(dto: RegisterDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    void dto;
    void metadata;
    throw new ForbiddenException('Account creation requires a valid invitation.');
  }

  async login(dto: LoginDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    if (dto.audience === 'superadmin') {
      return this.loginPlatformOwner(dto, metadata);
    }

    const audience = this.requireTenantScopedAudience(dto.audience);
    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.compare(dto.password, user.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.resolveLoginMembership(user.id);
    const tenantId = membership.tenant_id;

    await this.activateResolvedTenantContext(tenantId);
    await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);

    const permissions = this.resolveEmailVerificationPermissions(
      user,
      await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id),
    );
    await this.enforceLoginSecurity(user, membership.role_code, permissions, dto, metadata);

    return this.createAuthResponse(user, membership, permissions, audience, metadata);
  }

  async refresh(dto: RefreshTokenDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    const payload = await this.tokenService.verifyRefreshToken(dto.refresh_token);

    if (payload.audience === 'superadmin') {
      return this.refreshPlatformOwner(dto.refresh_token, metadata);
    }

    const tenantId = this.requireTenantId();
    const audience = this.requireTenantScopedAudience(payload.audience);

    if (payload.tenant_id !== tenantId) {
      throw new UnauthorizedException('Refresh token does not belong to this tenant');
    }

    const session = await this.sessionService.getSession(payload.session_id);

    if (!session) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (
      session.user_id !== payload.user_id ||
      session.tenant_id !== payload.tenant_id ||
      session.refresh_token_id !== payload.token_id
    ) {
      await this.sessionService.invalidateSession(payload.session_id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.usersRepository.findById(payload.user_id);

    if (!user || user.status !== 'active') {
      await this.sessionService.invalidateSession(payload.session_id);
      throw new UnauthorizedException('User account is no longer active');
    }

    const membership = await this.tenantMembershipsRepository.findActiveMembership(user.id, tenantId);

    if (!membership) {
      await this.sessionService.invalidateSession(payload.session_id);
      throw new UnauthorizedException('User no longer has access to this tenant');
    }

    const permissions = this.resolveEmailVerificationPermissions(
      user,
      await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id),
    );
    const tokenPair = await this.tokenService.issueTokenPair({
      user_id: user.id,
      tenant_id: tenantId,
      role: membership.role_code,
      audience,
      session_id: payload.session_id,
    });

    await this.sessionService.rotateRefreshToken({
      session_id: payload.session_id,
      current_refresh_token_id: payload.token_id,
      next_refresh_token_id: tokenPair.refresh_token_id,
      role: membership.role_code,
      permissions,
      email_verified_at: this.formatEmailVerifiedAt(user),
      refresh_expires_at: tokenPair.refresh_expires_at,
    });

    return this.buildAuthResponse(user, membership, permissions, tokenPair, audience);
  }

  async logout(): Promise<LogoutResponseDto> {
    const requestContext = this.requestContext.requireStore();

    if (!requestContext.session_id) {
      throw new UnauthorizedException('No active session found');
    }

    await this.sessionService.invalidateSession(requestContext.session_id);

    return { success: true };
  }

  async me(): Promise<MeResponseDto> {
    const requestContext = this.requestContext.requireStore();

    if (!requestContext.is_authenticated || !requestContext.session_id) {
      throw new UnauthorizedException('No authenticated user found');
    }

    if (requestContext.audience === 'superadmin') {
      const user = await this.usersRepository.findById(requestContext.user_id);

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('User account is no longer active');
      }

      return {
        user: this.buildPlatformUserDto(
          user,
          requestContext.session_id,
          this.resolveEmailVerificationPermissions(user, ['*:*']),
        ),
      };
    }

    const tenantId = this.requireTenantId();

    const user = await this.usersRepository.findById(requestContext.user_id);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User account is no longer active');
    }

    const membership = await this.tenantMembershipsRepository.findActiveMembership(user.id, tenantId);

    if (!membership) {
      throw new UnauthorizedException('User no longer has access to this tenant');
    }

    const permissions = this.resolveEmailVerificationPermissions(
      user,
      await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id),
    );

    return {
      user: this.buildUserDto(
        user,
        membership,
        permissions,
        requestContext.session_id,
        this.requireTenantScopedAudience(requestContext.audience ?? 'school'),
      ),
    };
  }

  private requireTenantScopedAudience(requestedAudience: AuthAudience | undefined): AuthAudience {
    const audience = requestedAudience ?? 'school';

    if (audience === 'superadmin') {
      throw new UnauthorizedException('Requested audience is not allowed for this tenant');
    }

    return audience;
  }

  private async createAuthResponse(
    user: UserEntity,
    membership: TenantMembershipEntity,
    permissions: string[],
    audience: AuthAudience,
    metadata: AuthRequestMetadata,
  ): Promise<AuthResponseDto> {
    const tokenPair = await this.tokenService.issueTokenPair({
      user_id: user.id,
      tenant_id: membership.tenant_id,
      role: membership.role_code,
      audience,
      session_id: randomUUID(),
    });

    await this.sessionService.createSession({
      user_id: user.id,
      tenant_id: membership.tenant_id,
      role: membership.role_code,
      audience,
      permissions,
      session_id: tokenPair.session_id,
      is_authenticated: true,
      email_verified_at: this.formatEmailVerifiedAt(user),
      refresh_token_id: tokenPair.refresh_token_id,
      refresh_expires_at: tokenPair.refresh_expires_at,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent,
    });

    return this.buildAuthResponse(user, membership, permissions, tokenPair, audience);
  }

  private async loginPlatformOwner(
    dto: LoginDto,
    metadata: AuthRequestMetadata,
  ): Promise<AuthResponseDto> {
    const configuredOwnerEmail = this.configService.get<string>('auth.systemOwnerEmail')?.trim().toLowerCase();

    if (!configuredOwnerEmail) {
      throw new UnauthorizedException('System owner is not configured');
    }

    if (dto.email.trim().toLowerCase() !== configuredOwnerEmail) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.usersRepository.findPlatformOwnerByEmail(dto.email);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.compare(dto.password, user.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const permissions = this.resolveEmailVerificationPermissions(user, ['*:*']);
    await this.enforceLoginSecurity(user, SUPERADMIN_ROLE_OWNER, permissions, dto, metadata);

    return this.createPlatformAuthResponse(user, metadata);
  }

  private async refreshPlatformOwner(
    refreshToken: string,
    metadata: AuthRequestMetadata,
  ): Promise<AuthResponseDto> {
    void metadata;
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);

    if (payload.tenant_id !== null || payload.audience !== 'superadmin') {
      throw new UnauthorizedException('Refresh token does not belong to a platform session');
    }

    const session = await this.sessionService.getSession(payload.session_id);

    if (!session) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (
      session.user_id !== payload.user_id ||
      session.tenant_id !== null ||
      session.refresh_token_id !== payload.token_id ||
      session.audience !== 'superadmin'
    ) {
      await this.sessionService.invalidateSession(payload.session_id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.usersRepository.findPlatformOwnerById(payload.user_id);

    if (!user || user.status !== 'active') {
      await this.sessionService.invalidateSession(payload.session_id);
      throw new UnauthorizedException('User account is no longer active');
    }

    const tokenPair = await this.tokenService.issueTokenPair({
      user_id: user.id,
      tenant_id: null,
      role: SUPERADMIN_ROLE_OWNER,
      audience: 'superadmin',
      session_id: payload.session_id,
    });

    const permissions = this.resolveEmailVerificationPermissions(user, ['*:*']);

    await this.sessionService.rotateRefreshToken({
      session_id: payload.session_id,
      current_refresh_token_id: payload.token_id,
      next_refresh_token_id: tokenPair.refresh_token_id,
      role: SUPERADMIN_ROLE_OWNER,
      permissions,
      email_verified_at: this.formatEmailVerifiedAt(user),
      refresh_expires_at: tokenPair.refresh_expires_at,
    });

    return this.buildPlatformAuthResponse(user, tokenPair, permissions);
  }

  private async createPlatformAuthResponse(
    user: UserEntity,
    metadata: AuthRequestMetadata,
  ): Promise<AuthResponseDto> {
    const permissions = this.resolveEmailVerificationPermissions(user, ['*:*']);
    const tokenPair = await this.tokenService.issueTokenPair({
      user_id: user.id,
      tenant_id: null,
      role: SUPERADMIN_ROLE_OWNER,
      audience: 'superadmin',
      session_id: randomUUID(),
    });

    await this.sessionService.createSession({
      user_id: user.id,
      tenant_id: null,
      role: SUPERADMIN_ROLE_OWNER,
      audience: 'superadmin',
      permissions,
      session_id: tokenPair.session_id,
      is_authenticated: true,
      email_verified_at: this.formatEmailVerifiedAt(user),
      refresh_token_id: tokenPair.refresh_token_id,
      refresh_expires_at: tokenPair.refresh_expires_at,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent,
    });

    return this.buildPlatformAuthResponse(user, tokenPair, permissions);
  }

  private async enforceLoginSecurity(
    user: UserEntity,
    role: string,
    permissions: string[],
    dto: LoginDto,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    if (!this.mfaService) {
      return;
    }

    const trustedDevice = dto.trusted_device_token && this.trustedDeviceService
      ? await this.trustedDeviceService.isTrustedDevice({
        userId: user.id,
        rawToken: dto.trusted_device_token,
      })
      : false;
    const result = await this.mfaService.enforceLoginChallenge({
      userId: user.id,
      role,
      permissions,
      mfaEnabled: Boolean(user.mfa_enabled),
      mfaCode: dto.mfa_code,
      trustedDevice,
    });

    if (
      result.status === 'verified'
      && dto.trust_device
      && dto.trusted_device_token
      && this.trustedDeviceService
    ) {
      await this.trustedDeviceService.trustDevice({
        userId: user.id,
        rawToken: dto.trusted_device_token,
        ipAddress: metadata.ip_address,
        userAgent: metadata.user_agent,
      });
    }
  }

  private buildAuthResponse(
    user: UserEntity,
    membership: TenantMembershipEntity,
    permissions: string[],
    tokenPair: IssuedTokenPair,
    audience: AuthAudience,
  ): AuthResponseDto {
    const tokens: AuthTokensDto = {
      access_token: tokenPair.access_token,
      refresh_token: tokenPair.refresh_token,
      token_type: tokenPair.token_type,
      access_expires_in: tokenPair.access_expires_in,
      refresh_expires_in: tokenPair.refresh_expires_in,
      access_expires_at: tokenPair.access_expires_at,
      refresh_expires_at: tokenPair.refresh_expires_at,
    };

    return {
      tokens,
      user: this.buildUserDto(user, membership, permissions, tokenPair.session_id, audience),
    };
  }

  private buildUserDto(
    user: UserEntity,
    membership: TenantMembershipEntity,
    permissions: string[],
    sessionId: string,
    audience: AuthAudience,
  ): AuthenticatedUserDto {
    return {
      user_id: user.id,
      tenant_id: membership.tenant_id,
      role: membership.role_code,
      audience,
      email: user.email,
      display_name: user.display_name,
      email_verified: this.isEmailVerified(user),
      email_verified_at: this.formatEmailVerifiedAt(user),
      permissions,
      session_id: sessionId,
    };
  }

  private buildPlatformAuthResponse(
    user: UserEntity,
    tokenPair: IssuedTokenPair,
    permissions: string[],
  ): AuthResponseDto {
    const tokens: AuthTokensDto = {
      access_token: tokenPair.access_token,
      refresh_token: tokenPair.refresh_token,
      token_type: tokenPair.token_type,
      access_expires_in: tokenPair.access_expires_in,
      refresh_expires_in: tokenPair.refresh_expires_in,
      access_expires_at: tokenPair.access_expires_at,
      refresh_expires_at: tokenPair.refresh_expires_at,
    };

    return {
      tokens,
      user: this.buildPlatformUserDto(user, tokenPair.session_id, permissions),
    };
  }

  private buildPlatformUserDto(
    user: UserEntity,
    sessionId: string,
    permissions: string[],
  ): AuthenticatedUserDto {
    return {
      user_id: user.id,
      tenant_id: null,
      role: SUPERADMIN_ROLE_OWNER,
      audience: 'superadmin',
      email: user.email,
      display_name: user.display_name,
      email_verified: this.isEmailVerified(user),
      email_verified_at: this.formatEmailVerifiedAt(user),
      permissions,
      session_id: sessionId,
    };
  }

  private resolveEmailVerificationPermissions(
    user: UserEntity,
    permissions: string[],
  ): string[] {
    if (!this.hasSensitivePermission(permissions) || this.isEmailVerified(user)) {
      return permissions;
    }

    return ['auth:read'];
  }

  private async assertEmailVerifiedForSensitiveSession(
    session: { permissions: string[]; session_id: string; email_verified_at?: string | null },
  ): Promise<void> {
    if (!this.hasSensitivePermission(session.permissions)) {
      return;
    }

    if (!session.email_verified_at) {
      await this.sessionService.invalidateSession(session.session_id);
      throw new UnauthorizedException('Verify your email before accessing sensitive workspace actions');
    }
  }

  private hasSensitivePermission(permissions: string[]): boolean {
    return permissions.some((permission) =>
      permission === '*:*'
      || permission.endsWith(':write')
      || permission.endsWith(':manage')
      || permission.endsWith(':create')
      || permission.endsWith(':delete')
      || permission.endsWith(':*'),
    );
  }

  private isEmailVerified(user: UserEntity): boolean {
    return Boolean(user.email_verified_at);
  }

  private formatEmailVerifiedAt(user: UserEntity): string | null {
    if (!user.email_verified_at) {
      return null;
    }

    return user.email_verified_at instanceof Date
      ? user.email_verified_at.toISOString()
      : user.email_verified_at;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    return tenantId;
  }

  private async resolveLoginMembership(userId: string): Promise<TenantMembershipEntity> {
    const currentTenantId = this.requestContext.getStore()?.tenant_id;

    if (currentTenantId) {
      const currentMembership = await this.tenantMembershipsRepository.findActiveMembership(
        userId,
        currentTenantId,
      );

      if (currentMembership) {
        return currentMembership;
      }
    }

    const memberships = await this.tenantMembershipsRepository.findActiveMembershipsByUser(userId);

    if (memberships.length === 1) {
      return memberships[0];
    }

    if (memberships.length > 1) {
      throw new UnauthorizedException('Multiple school workspaces are linked to this account. Choose a school after sign-in.');
    }

    throw new UnauthorizedException('User does not have access to an active school workspace');
  }

  private async activateResolvedTenantContext(tenantId: string): Promise<void> {
    this.requestContext.setTenantId(tenantId);

    const store = this.requestContext.requireStore();
    await this.databaseService?.synchronizeRequestSession(store);
  }
}
