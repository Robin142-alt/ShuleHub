import { Global, Module } from '@nestjs/common';

import { RedisModule } from '../../infrastructure/redis/redis.module';
import { ObservabilityModule } from '../observability/observability.module';
import { FraudDetectionService } from './fraud-detection.service';
import { PiiEncryptionService } from './pii-encryption.service';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [RedisModule, ObservabilityModule],
  providers: [PiiEncryptionService, RateLimitService, FraudDetectionService],
  exports: [PiiEncryptionService, RateLimitService, FraudDetectionService],
})
export class SecurityModule {}
