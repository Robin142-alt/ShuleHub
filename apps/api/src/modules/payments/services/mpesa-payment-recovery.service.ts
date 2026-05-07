import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import { PaymentIntentEntity } from '../entities/payment-intent.entity';
import { MPESA_EXPIRED_PAYMENT_FAILURE_REASON } from '../payments.constants';
import { PaymentIntentsRepository } from '../repositories/payment-intents.repository';

export interface ExpireStaleMpesaPaymentIntentsResult {
  tenant_id: string;
  expired_count: number;
  expired_payment_intent_ids: string[];
}

@Injectable()
export class MpesaPaymentRecoveryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly paymentIntentsRepository: PaymentIntentsRepository,
  ) {}

  async expireStalePaymentIntents(): Promise<ExpireStaleMpesaPaymentIntentsResult> {
    const tenantId = this.requireTenantId();

    return this.databaseService.withRequestTransaction(async () => {
      const expiredIntents = await this.paymentIntentsRepository.expireStalePendingIntents(
        tenantId,
        {
          batch_size: Number(
            this.configService.get<number>('mpesa.staleIntentSweepBatchSize') ?? 100,
          ),
          failure_reason: MPESA_EXPIRED_PAYMENT_FAILURE_REASON,
        },
      );

      return {
        tenant_id: tenantId,
        expired_count: expiredIntents.length,
        expired_payment_intent_ids: expiredIntents.map(
          (paymentIntent: PaymentIntentEntity) => paymentIntent.id,
        ),
      };
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for MPESA payment recovery');
    }

    return tenantId;
  }
}
