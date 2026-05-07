import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditLogService } from '../observability/audit-log.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { PiiEncryptionService } from './pii-encryption.service';

interface RecentPaymentSignalRow {
  phone_number: string;
  account_reference: string;
  amount_minor: string;
}

@Injectable()
export class FraudDetectionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly piiEncryptionService: PiiEncryptionService,
    private readonly auditLogService: AuditLogService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async inspectPaymentIntentCreation(input: {
    tenant_id: string;
    payment_intent_id: string;
    amount_minor: string;
    phone_number: string;
    account_reference: string;
    external_reference?: string | null;
  }): Promise<void> {
    const amountMinor = BigInt(input.amount_minor);
    const highValueThreshold = BigInt(
      this.configService.get<string>('security.fraudHighValueAmountMinor') ?? '5000000',
    );

    if (amountMinor >= highValueThreshold) {
      await this.emitAlert({
        tenant_id: input.tenant_id,
        action: 'fraud.payment.high_value_detected',
        resource_type: 'payment_intent',
        resource_id: input.payment_intent_id,
        metadata: {
          severity: 'high',
          amount_minor: input.amount_minor,
          account_reference: input.account_reference,
          external_reference: input.external_reference ?? null,
          phone_number_masked: this.piiEncryptionService.maskPhoneNumber(input.phone_number),
        },
      });
    }

    const velocityCount = await this.incrementCounter(
      `fraud:velocity:payment-intent:${input.tenant_id}:${input.phone_number}`,
      Number(this.configService.get<number>('security.fraudVelocityWindowSeconds') ?? 900),
    );
    const velocityThreshold = Number(
      this.configService.get<number>('security.fraudVelocityThreshold') ?? 5,
    );

    if (velocityCount >= velocityThreshold) {
      await this.emitAlert({
        tenant_id: input.tenant_id,
        action: 'fraud.payment.velocity_detected',
        resource_type: 'payment_intent',
        resource_id: input.payment_intent_id,
        metadata: {
          severity: 'medium',
          velocity_count: velocityCount,
          account_reference: input.account_reference,
          phone_number_masked: this.piiEncryptionService.maskPhoneNumber(input.phone_number),
        },
      });
    }

    const recentSignals = await this.loadRecentPaymentSignals(
      input.tenant_id,
      Number(this.configService.get<number>('security.fraudVelocityWindowSeconds') ?? 900),
    );
    const samePhoneSignals = recentSignals.filter(
      (signal) => signal.phone_number === input.phone_number,
    );
    const distinctAccountReferences = Array.from(
      new Set(samePhoneSignals.map((signal) => signal.account_reference)),
    ).sort();
    const crossAccountThreshold = Number(
      this.configService.get<number>('security.fraudCrossAccountThreshold') ?? 3,
    );

    if (distinctAccountReferences.length >= crossAccountThreshold) {
      await this.emitAlert({
        tenant_id: input.tenant_id,
        action: 'fraud.payment.phone_reused_across_accounts',
        resource_type: 'payment_intent',
        resource_id: input.payment_intent_id,
        metadata: {
          severity: 'medium',
          account_reference: input.account_reference,
          distinct_account_references: distinctAccountReferences.length,
          account_references: distinctAccountReferences,
          phone_number_masked: this.piiEncryptionService.maskPhoneNumber(input.phone_number),
        },
      });
    }

    const repeatedAmountThreshold = Number(
      this.configService.get<number>('security.fraudRepeatedAmountThreshold') ?? 3,
    );
    const sameAmountDistinctAccounts = Array.from(
      new Set(
        samePhoneSignals
          .filter((signal) => signal.amount_minor === input.amount_minor)
          .map((signal) => signal.account_reference),
      ),
    ).sort();

    if (sameAmountDistinctAccounts.length >= repeatedAmountThreshold) {
      await this.emitAlert({
        tenant_id: input.tenant_id,
        action: 'fraud.payment.suspicious_pattern_detected',
        resource_type: 'payment_intent',
        resource_id: input.payment_intent_id,
        metadata: {
          severity: 'high',
          reason: 'repeated_amount_across_accounts',
          amount_minor: input.amount_minor,
          distinct_account_references: sameAmountDistinctAccounts.length,
          account_references: sameAmountDistinctAccounts,
          phone_number_masked: this.piiEncryptionService.maskPhoneNumber(input.phone_number),
        },
      });
    }
  }

  async recordCallbackFailure(input: {
    tenant_id: string;
    payment_intent_id: string;
    checkout_request_id: string;
    reason: string;
    phone_number?: string | null;
  }): Promise<void> {
    const counter = await this.incrementCounter(
      `fraud:mpesa:callback-failure:${input.tenant_id}:${input.checkout_request_id}`,
      Number(this.configService.get<number>('security.fraudVelocityWindowSeconds') ?? 900),
    );
    const threshold = Number(
      this.configService.get<number>('security.fraudCallbackFailureThreshold') ?? 3,
    );

    if (counter >= threshold) {
      await this.emitAlert({
        tenant_id: input.tenant_id,
        action: 'fraud.mpesa.callback_failures_detected',
        resource_type: 'payment_intent',
        resource_id: input.payment_intent_id,
        metadata: {
          severity: 'medium',
          checkout_request_id: input.checkout_request_id,
          failure_reason: input.reason,
          failure_count: counter,
          phone_number_masked: this.piiEncryptionService.maskPhoneNumber(input.phone_number),
        },
      });
    }
  }

  async recordCallbackMismatch(input: {
    tenant_id: string;
    payment_intent_id: string;
    checkout_request_id: string;
    failure_type: 'amount_mismatch' | 'phone_mismatch';
    expected_amount_minor?: string;
    received_amount_minor?: string | null;
    expected_phone_number?: string | null;
    received_phone_number?: string | null;
  }): Promise<void> {
    await this.emitAlert({
      tenant_id: input.tenant_id,
      action: `fraud.mpesa.${input.failure_type}`,
      resource_type: 'payment_intent',
      resource_id: input.payment_intent_id,
      metadata: {
        severity: 'high',
        checkout_request_id: input.checkout_request_id,
        expected_amount_minor: input.expected_amount_minor,
        received_amount_minor: input.received_amount_minor ?? null,
        expected_phone_number_masked: this.piiEncryptionService.maskPhoneNumber(
          input.expected_phone_number,
        ),
        received_phone_number_masked: this.piiEncryptionService.maskPhoneNumber(
          input.received_phone_number,
        ),
      },
    });
  }

  private async emitAlert(input: {
    tenant_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.auditLogService.recordSecurityEvent(input);
    this.logger.warn(
      {
        event: 'fraud.alert',
        action: input.action,
        resource_type: input.resource_type,
        resource_id: input.resource_id,
        metadata: input.metadata,
      },
      FraudDetectionService.name,
    );
  }

  private async incrementCounter(key: string, ttlSeconds: number): Promise<number> {
    const redisClient = this.redisService.getClient();
    const total = await redisClient.incr(key);

    if (total === 1) {
      await redisClient.expire(key, ttlSeconds);
    }

    return total;
  }

  private async loadRecentPaymentSignals(
    tenantId: string,
    windowSeconds: number,
  ): Promise<RecentPaymentSignalRow[]> {
    const result = await this.databaseService.query<RecentPaymentSignalRow>(
      `
        SELECT
          phone_number,
          account_reference,
          amount_minor::text AS amount_minor
        FROM payment_intents
        WHERE tenant_id = $1
          AND created_at >= NOW() - ($2::integer * INTERVAL '1 second')
        ORDER BY created_at DESC
        LIMIT 250
      `,
      [tenantId, windowSeconds],
    );

    return result.rows.map((row) => ({
      phone_number: this.piiEncryptionService.decrypt(
        row.phone_number,
        this.phoneNumberAad(tenantId),
      ),
      account_reference: row.account_reference,
      amount_minor: row.amount_minor,
    }));
  }

  private phoneNumberAad(tenantId: string): string {
    return `payment_intents:${tenantId}:phone_number`;
  }
}
