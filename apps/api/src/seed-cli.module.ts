import { Module } from '@nestjs/common';

import { AppModule } from './app.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
  imports: [AppModule, SeederModule],
})
export class SeedCliModule {}
