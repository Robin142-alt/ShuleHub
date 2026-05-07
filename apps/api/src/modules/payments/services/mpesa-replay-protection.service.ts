import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../../infrastructure/redis/redis.service';

@Injectable()
export class MpesaReplayProtectionService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async registerDelivery(tenantId: string, deliveryId: string): Promise<boolean> {
    const ttlSeconds = Number(this.configService.get<number>('mpesa.replayWindowSeconds') ?? 86400);
    const result = await this.redisService
      .getClient()
      .set(this.buildReplayKey(tenantId, deliveryId), '1', 'EX', ttlSeconds, 'NX');

    return result === 'OK';
  }

  private buildReplayKey(tenantId: string, deliveryId: string): string {
    return `mpesa:replay:${tenantId}:${deliveryId}`;
  }
}
