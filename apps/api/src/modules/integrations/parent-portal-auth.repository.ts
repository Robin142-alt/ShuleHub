import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type {
  ParentAuthSubject,
  ParentOtpChallengeRecord,
} from './integrations.types';

@Injectable()
export class ParentPortalAuthRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findParentAuthSubject(input: {
    identifier: string;
    phone_hash: string | null;
  }): Promise<ParentAuthSubject | null> {
    const result = await this.databaseService.query<ParentAuthSubject>(
      `
        SELECT user_id::text, tenant_id, role_id::text, role_code, email,
               display_name, phone_number_hash, phone_number_last4
        FROM app.find_parent_auth_subject_for_otp($1, $2)
      `,
      [input.identifier, input.phone_hash],
    );

    return result.rows[0] ?? null;
  }

  async createOtpChallenge(input: {
    tenant_id: string;
    user_id: string;
    email: string | null;
    phone_hash: string | null;
    phone_last4: string | null;
    otp_hash: string;
    expires_at: string;
  }): Promise<ParentOtpChallengeRecord> {
    const result = await this.databaseService.query<ParentOtpChallengeRecord>(
      `
        INSERT INTO parent_otp_challenges (
          tenant_id,
          user_id,
          email,
          phone_hash,
          phone_last4,
          otp_hash,
          expires_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::timestamptz)
        RETURNING id::text, tenant_id, user_id::text, email, phone_hash, phone_last4,
                  otp_hash, expires_at, consumed_at, attempts
      `,
      [
        input.tenant_id,
        input.user_id,
        input.email,
        input.phone_hash,
        input.phone_last4,
        input.otp_hash,
        input.expires_at,
      ],
    );

    return result.rows[0];
  }

  async findChallengeForVerify(challengeId: string): Promise<ParentOtpChallengeRecord | null> {
    const result = await this.databaseService.query<ParentOtpChallengeRecord>(
      `
        SELECT id::text, tenant_id, user_id::text, email, phone_hash, phone_last4,
               otp_hash, expires_at, consumed_at, attempts
        FROM app.find_parent_otp_challenge_for_verify($1::uuid)
      `,
      [challengeId],
    );

    return result.rows[0] ?? null;
  }

  async consumeChallenge(tenantId: string, challengeId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        UPDATE parent_otp_challenges
        SET consumed_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id::text
      `,
      [tenantId, challengeId],
    );

    return Boolean(result.rows[0]);
  }

  async incrementAttempts(tenantId: string, challengeId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE parent_otp_challenges
        SET attempts = attempts + 1
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, challengeId],
    );
  }
}
