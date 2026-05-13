import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

export interface ValidInvitationToken {
  invitation_id: string;
  tenant_id: string;
  email: string;
  role: string;
}

export interface CreatedInvitationRow {
  invitation_id: string;
}

@Injectable()
export class InvitationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createInvitation(input: {
    tenant_id: string;
    email: string;
    display_name: string;
    role: string;
    created_by_user_id: string | null;
    expires_at: string;
    token_hash: string;
  }): Promise<CreatedInvitationRow> {
    const result = await this.databaseService.query<CreatedInvitationRow>(
      `
        WITH invitation AS (
          INSERT INTO user_invitations (
            tenant_id,
            email,
            display_name,
            role,
            status,
            expires_at,
            created_by_user_id
          )
          VALUES ($1, lower($2), $3, $4, 'pending', $5, $6)
          RETURNING id
        )
        INSERT INTO invitation_tokens (tenant_id, invitation_id, token_hash, expires_at)
        SELECT $1, invitation.id, $7, $5
        FROM invitation
        RETURNING invitation_id
      `,
      [
        input.tenant_id,
        input.email,
        input.display_name,
        input.role,
        input.expires_at,
        input.created_by_user_id,
        input.token_hash,
      ],
    );

    return result.rows[0];
  }

  async findValidToken(tokenHash: string): Promise<ValidInvitationToken | null> {
    const result = await this.databaseService.query<ValidInvitationToken>(
      `
        SELECT
          ui.id AS invitation_id,
          ui.tenant_id,
          ui.email,
          ui.role
        FROM invitation_tokens it
        INNER JOIN user_invitations ui
          ON ui.id = it.invitation_id
         AND ui.tenant_id = it.tenant_id
        WHERE it.token_hash = $1
          AND it.used_at IS NULL
          AND it.expires_at > NOW()
          AND ui.status = 'pending'
          AND ui.revoked_at IS NULL
          AND ui.accepted_at IS NULL
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0] ?? null;
  }

  async markAccepted(input: {
    invitation_id: string;
    accepted_user_id: string;
  }): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE user_invitations
        SET
          status = 'accepted',
          accepted_at = NOW(),
          accepted_user_id = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.invitation_id, input.accepted_user_id],
    );
    await this.databaseService.query(
      `
        UPDATE invitation_tokens
        SET used_at = NOW(), updated_at = NOW()
        WHERE invitation_id = $1
      `,
      [input.invitation_id],
    );
  }
}
