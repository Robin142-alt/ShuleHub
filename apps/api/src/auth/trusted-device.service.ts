import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

export interface TrustedDeviceTokenInput {
  userId: string;
  rawToken: string;
}

export interface TrustDeviceInput extends TrustedDeviceTokenInput {
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt?: string;
}

@Injectable()
export class TrustedDeviceService {
  constructor(private readonly databaseService: Pick<DatabaseService, 'query'>) {}

  async trustDevice(input: TrustDeviceInput): Promise<{ trusted: boolean }> {
    const result = await this.databaseService.query<{ trusted: boolean }>(
      `
        INSERT INTO auth_trusted_devices (
          user_id,
          device_token_hash,
          user_agent,
          ip_address,
          expires_at,
          trusted_at
        )
        VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, NOW())
        ON CONFLICT (user_id, device_token_hash)
        DO UPDATE SET
          user_agent = EXCLUDED.user_agent,
          ip_address = EXCLUDED.ip_address,
          expires_at = EXCLUDED.expires_at,
          revoked_at = NULL,
          trusted_at = NOW(),
          updated_at = NOW()
        RETURNING TRUE AS trusted
      `,
      [
        input.userId,
        this.hashToken(input.rawToken),
        input.userAgent ?? null,
        input.ipAddress ?? null,
        input.expiresAt ?? this.defaultExpiry(),
      ],
    );

    return { trusted: Boolean(result.rows[0]?.trusted) };
  }

  async isTrustedDevice(input: TrustedDeviceTokenInput): Promise<boolean> {
    const result = await this.databaseService.query<{ trusted: boolean }>(
      `
        SELECT TRUE AS trusted
        FROM auth_trusted_devices
        WHERE user_id = $1::uuid
          AND device_token_hash = $2
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [input.userId, this.hashToken(input.rawToken)],
    );

    return Boolean(result.rows[0]?.trusted);
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }

  private defaultExpiry(): string {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  }
}
