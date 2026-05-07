import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { SeedRuntimeContext } from '../modules/seeder/seeder.types';

@Injectable()
export class TenantSeeder {
  constructor(private readonly databaseService: DatabaseService) {}

  async seed(context: SeedRuntimeContext): Promise<void> {
    await this.databaseService.withRequestTransaction(async () => {
      const tenantSettings = {
        timezone: 'Africa/Nairobi',
        currency_code: 'KES',
        education_system: 'CBC',
        country_code: 'KE',
      };

      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO tenants (
            tenant_id,
            name,
            subdomain,
            status,
            settings,
            metadata
          )
          VALUES ($1, $2, $3, 'demo', $4::jsonb, $5::jsonb)
          ON CONFLICT (tenant_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            subdomain = EXCLUDED.subdomain,
            status = EXCLUDED.status,
            settings = EXCLUDED.settings,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          context.options.school_name,
          context.options.tenant,
          JSON.stringify(tenantSettings),
          JSON.stringify({
            seed_key: context.seed_key,
            seeded_at: context.now.toISOString(),
          }),
        ],
      );

      context.registries.tenant_record_id = result.rows[0]?.id;
      context.summary.counts.tenants = 1;
    });
  }
}
