import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import {
  DEFAULT_ROLE_MEMBER,
  DEFAULT_ROLE_OWNER,
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

    return this.sessionService.toPrincipal(session);
  }

  async register(dto: RegisterDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    const tenantId = this.requireTenantId();
    const audience = this.requireTenantAudience('school');

    await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);

    let user = await this.usersRepository.findByEmail(dto.email);

    if (!user) {
      user = await this.usersRepository.ensureGlobalUserForRegistration({
        email: dto.email,
        password_hash: await this.passwordService.hash(dto.password),
        display_name: dto.display_name,
      });
    } else {
      if (user.status !== 'active') {
        throw new ForbiddenException('User account is disabled');
      }

      const passwordMatches = await this.passwordService.compare(dto.password, user.password_hash);

      if (!passwordMatches) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const existingMembership = await this.tenantMembershipsRepository.findMembershipByUserAndTenant(user.id, tenantId);

    if (existingMembership?.status === 'active') {
      throw new ConflictException('User is already registered in this tenant');
    }

    const activeMembershipCount = await this.tenantMembershipsRepository.countActiveMembershipsByTenant(tenantId);
    const roleCode = activeMembershipCount === 0 ? DEFAULT_ROLE_OWNER : DEFAULT_ROLE_MEMBER;
    const role = await this.authorizationRepository.getRoleByCode(tenantId, roleCode);
    const membership = await this.tenantMembershipsRepository.createOrActivateMembership({
      tenant_id: tenantId,
      user_id: user.id,
      role_id: role.id,
    });
    const permissions = await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id);

    return this.createAuthResponse(user, membership, permissions, audience, metadata);
  }

  async login(dto: LoginDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    const tenantId = this.requireTenantId();
    const audience = this.requireTenantAudience(dto.audience);

    await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);

    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.compare(dto.password, user.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.tenantMembershipsRepository.findActiveMembership(user.id, tenantId);

    if (!membership) {
      throw new UnauthorizedException('User does not have access to this tenant');
    }

    const permissions = await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id);

    return this.createAuthResponse(user, membership, permissions, audience, metadata);
  }

  async refresh(dto: RefreshTokenDto, metadata: AuthRequestMetadata): Promise<AuthResponseDto> {
    const tenantId = this.requireTenantId();
    const payload = await this.tokenService.verifyRefreshToken(dto.refresh_token);
    const audience = this.requireTenantAudience(payload.audience);

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

    const permissions = await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id);
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
    const tenantId = this.requireTenantId();

    if (!requestContext.is_authenticated || !requestContext.session_id) {
      throw new UnauthorizedException('No authenticated user found');
    }

    const user = await this.usersRepository.findById(requestContext.user_id);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User account is no longer active');
    }

    const membership = await this.tenantMembershipsRepository.findActiveMembership(user.id, tenantId);

    if (!membership) {
      throw new UnauthorizedException('User no longer has access to this tenant');
    }

    const permissions = await this.authorizationRepository.getPermissionsByRoleId(tenantId, membership.role_id);

    return {
      user: this.buildUserDto(
        user,
        membership,
        permissions,
        requestContext.session_id,
        this.requireTenantAudience(requestContext.audience ?? 'school'),
      ),
    };
  }

  private requireTenantAudience(requestedAudience: AuthAudience | undefined): AuthAudience {
    const audience = requestedAudience ?? 'school';

    if (audience !== 'school') {
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
      refresh_token_id: tokenPair.refresh_token_id,
      refresh_expires_at: tokenPair.refresh_expires_at,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent,
    });

    return this.buildAuthResponse(user, membership, permissions, tokenPair, audience);
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
      permissions,
      session_id: sessionId,
    };
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    return tenantId;
  }
}
