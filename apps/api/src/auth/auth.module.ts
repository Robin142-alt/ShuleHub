import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthSchemaService } from './auth-schema.service';
import { AuthService } from './auth.service';
import { AuthorizationRepository } from './repositories/authorization.repository';
import { TenantMembershipsRepository } from './repositories/tenant-memberships.repository';
import { UsersRepository } from './repositories/users.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { AbacPolicyEngine } from './policies/abac-policy.engine';

@Global()
@Module({
  imports: [CommonModule, DatabaseModule, RedisModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthSchemaService,
    AuthService,
    UsersRepository,
    TenantMembershipsRepository,
    AuthorizationRepository,
    PasswordService,
    TokenService,
    SessionService,
    AbacPolicyEngine,
  ],
  exports: [
    AuthSchemaService,
    AuthService,
    SessionService,
    TokenService,
    AbacPolicyEngine,
    UsersRepository,
    TenantMembershipsRepository,
    AuthorizationRepository,
    PasswordService,
  ],
})
export class AuthModule {}
