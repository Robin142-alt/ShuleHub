import { Injectable } from '@nestjs/common';

import { SeederModuleName, SeedRunOptions, SeedSummary } from './seeder.types';

const DISABLED_SEEDING_MESSAGE =
  'Production data seeding is disabled. Use the system-owner onboarding and invitation flows.';

@Injectable()
export class SeederService {
  async runAll(_options: SeedRunOptions): Promise<SeedSummary> {
    throw new Error(DISABLED_SEEDING_MESSAGE);
  }

  async runByModule(
    _name: SeederModuleName,
    _options: SeedRunOptions,
  ): Promise<SeedSummary> {
    throw new Error(DISABLED_SEEDING_MESSAGE);
  }
}
