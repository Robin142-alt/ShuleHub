import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

export interface EnforceMfaLoginInput {
  userId: string;
  role: string;
  permissions: string[];
  mfaEnabled: boolean;
  mfaCode?: string;
  trustedDevice?: boolean;
}

export interface EnforceMfaLoginResult {
  status: 'not_required' | 'trusted_device' | 'verified';
}

const HIGH_PRIVILEGE_ROLES = new Set([
  'admin',
  'owner',
  'platform_owner',
  'principal',
  'support_lead',
  'superadmin',
]);

@Injectable()
export class MfaService {
  constructor(private readonly databaseService: DatabaseService) {}

  async enforceLoginChallenge(input: EnforceMfaLoginInput): Promise<EnforceMfaLoginResult> {
    if (!this.requiresChallenge(input.role, input.permissions)) {
      return { status: 'not_required' };
    }

    if (input.trustedDevice) {
      return { status: 'trusted_device' };
    }

    if (!input.mfaEnabled || !input.mfaCode?.trim()) {
      throw new UnauthorizedException('MFA challenge required for this role');
    }

    const result = await this.databaseService.query<{ verified: boolean }>(
      `
        UPDATE auth_mfa_challenges
        SET consumed_at = NOW()
        WHERE user_id = $1::uuid
          AND code_hash = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING TRUE AS verified
      `,
      [input.userId, this.hashSecret(input.mfaCode)],
    );

    if (!result.rows[0]?.verified) {
      throw new UnauthorizedException('MFA challenge is invalid or expired');
    }

    return { status: 'verified' };
  }

  requiresChallenge(role: string, permissions: string[]): boolean {
    return HIGH_PRIVILEGE_ROLES.has(role)
      || permissions.some((permission) =>
        permission === '*:*'
        || permission.endsWith(':write')
        || permission.endsWith(':manage')
        || permission.endsWith(':delete')
        || permission.endsWith(':*'),
      );
  }

  private hashSecret(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }
}
