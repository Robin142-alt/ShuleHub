import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CommonModule } from '../../../common/common.module';
import configuration from '../../../config/configuration';
import { DatabaseModule } from '../../../database/database.module';
import { validatePaymentsQueueVerificationEnv } from './payments-queue.env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      load: [configuration],
      validate: validatePaymentsQueueVerificationEnv,
    }),
    CommonModule,
    DatabaseModule,
  ],
})
export class PaymentsQueueVerificationModule {}
