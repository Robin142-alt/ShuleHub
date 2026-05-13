import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

export interface ValidPasswordResetToken {
  tenant_id: string;
  user_id: string;
  email: string;
}

@Injectable()
export class PasswordResetsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createReset(input: {
    tenant_id: string;
    user_id: string;
    email: string;
    token_hash: string;
    expires_at: string;
    requested_ip: string | null;
    requested_user_agent: string | null;
  }): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO password_resets (
          tenant_id,
          user_id,
          email,
          token_hash,
          status,
          expires_at,
          requested_ip,
          requested_user_agent
        )
        VALUES ($1, $2, lower($3), $4, 'pending', $5, NULLIF($6, '')::inet, $7)
      `,
      [
        input.tenant_id,
        input.user_id,
        input.email,
        input.token_hash,
        input.expires_at,
        input.requested_ip,
        input.requested_user_agent,
      ],
    );
  }

  async findValidToken(tokenHash: string): Promise<ValidPasswordResetToken | null> {
    const result = await this.databaseService.query<ValidPasswordResetToken>(
      `
        SELECT tenant_id, user_id, email
        FROM password_resets
        WHERE token_hash = $1
          AND status = 'pending'
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0] ?? null;
  }

  async markUsed(input: {
    tenant_id: string;
    user_id: string;
    token_hash: string;
  }): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE password_resets
        SET status = 'used', used_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
          AND user_id = $2
          AND token_hash = $3
      `,
      [input.tenant_id, input.user_id, input.token_hash],
    );
  }
}
