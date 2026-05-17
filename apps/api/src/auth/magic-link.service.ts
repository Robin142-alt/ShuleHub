import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

export interface ConsumedMagicLink {
  user_id: string;
  tenant_id: string | null;
  email: string;
  consumed_at: string;
}

@Injectable()
export class MagicLinkService {
  constructor(private readonly databaseService: DatabaseService) {}

  async consumeLoginLink(input: {
    token: string;
    now?: string;
  }): Promise<ConsumedMagicLink> {
    const now = input.now ?? new Date().toISOString();
    const result = await this.databaseService.query<ConsumedMagicLink>(
      `
        WITH auth_operation AS (
          SELECT set_config('app.auth_action_token_operation', 'magic_login_consume', true)
        )
        UPDATE auth_action_tokens
        SET consumed_at = $2::timestamptz,
            updated_at = NOW()
        FROM auth_operation
        WHERE token_hash = $1
          AND purpose = 'magic_login'
          AND consumed_at IS NULL
          AND expires_at > $2::timestamptz
        RETURNING
          user_id::text,
          tenant_id,
          email,
          consumed_at::text
      `,
      [this.hashToken(input.token), now],
    );

    const consumed = result.rows[0];

    if (!consumed) {
      throw new UnauthorizedException('Magic link is invalid or expired');
    }

    return consumed;
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }
}
