import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { AUTH_ANONYMOUS_USER_ID } from '../../../auth/auth.constants';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { FraudDetectionService } from '../../security/fraud-detection.service';
import { SloMetricsService } from '../../observability/slo-metrics.service';
import { TenantFinanceConfigService } from '../../tenant-finance/tenant-finance-config.service';
import { ResolvedTenantMpesaConfig } from '../../tenant-finance/tenant-finance.types';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { PaymentIntentResponseDto } from '../dto/payment-intent-response.dto';
import { PaymentIntentEntity } from '../entities/payment-intent.entity';
import {
  MPESA_ACCESS_TOKEN_CACHE_KEY,
  MPESA_DEFAULT_CURRENCY_CODE,
  MPESA_PAYMENT_INTENT_REQUEST_METHOD,
  MPESA_PAYMENT_INTENT_REQUEST_PATH,
  MPESA_PAYMENT_INTENT_SCOPE,
} from '../payments.constants';
import {
  MpesaCallbackMetadataItem,
  MpesaCallbackPayload,
  ParsedMpesaCallback,
  PaymentIntentResponse,
  StkPushRequest,
  StkPushResponse,
} from '../payments.types';
import { PaymentIntentIdempotencyRepository } from '../repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from '../repositories/payment-intents.repository';

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: string | number;
}

interface CreatePaymentIntentOptions {
  payment_owner?: 'tenant' | 'platform';
}

@Injectable()
export class MpesaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly paymentIntentsRepository: PaymentIntentsRepository,
    private readonly paymentIntentIdempotencyRepository: PaymentIntentIdempotencyRepository,
    @Optional() private readonly sloMetrics?: SloMetricsService,
    @Optional() private readonly tenantFinanceConfigService?: TenantFinanceConfigService,
  ) {}

  async createPaymentIntent(
    dto: CreatePaymentIntentDto,
    options: CreatePaymentIntentOptions = {},
  ): Promise<PaymentIntentResponseDto> {
    return this.databaseService.withRequestTransaction(async () => {
      const requestContext = this.requestContext.requireStore();
      const tenantId = this.requireTenantId();
      const normalizedPhoneNumber = this.normalizePhoneNumber(dto.phone_number);
      const amountMinor = this.normalizeMinorAmount(dto.amount_minor);
      const paymentOwner = options.payment_owner ?? 'tenant';
      const mpesaConfig = await this.resolveMpesaConfig(tenantId, paymentOwner);
      const idempotencyRecord = await this.paymentIntentIdempotencyRepository.lockRequest({
        tenant_id: tenantId,
        user_id:
          requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
            ? requestContext.user_id
            : null,
        scope: MPESA_PAYMENT_INTENT_SCOPE,
        idempotency_key: dto.idempotency_key.trim(),
        request_hash: this.buildIdempotencyHash({
          ...dto,
          phone_number: normalizedPhoneNumber,
          amount_minor: amountMinor,
        }),
        request_method: MPESA_PAYMENT_INTENT_REQUEST_METHOD,
        request_path: MPESA_PAYMENT_INTENT_REQUEST_PATH,
        ttl_seconds: Number(
          this.configService.get<number>('finance.idempotencyTtlSeconds') ?? 86400,
        ),
      });

      if (idempotencyRecord.status === 'completed' && idempotencyRecord.response_body) {
        return this.mapPaymentIntentResponse(idempotencyRecord.response_body);
      }

      const paymentIntent = await this.paymentIntentsRepository.createPending({
        tenant_id: tenantId,
        idempotency_key_id: idempotencyRecord.id,
        user_id:
          requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
            ? requestContext.user_id
            : null,
        student_id: dto.student_id ?? null,
        request_id: requestContext.request_id,
        external_reference: dto.external_reference?.trim() || null,
        account_reference: dto.account_reference.trim(),
        transaction_desc: dto.transaction_desc.trim(),
        phone_number: normalizedPhoneNumber,
        amount_minor: amountMinor,
        currency_code: MPESA_DEFAULT_CURRENCY_CODE,
        payment_owner: paymentOwner,
        mpesa_config_id: mpesaConfig.mpesa_config_id,
        payment_channel_id: mpesaConfig.payment_channel_id,
        mpesa_short_code: mpesaConfig.shortcode,
        payment_channel_type: mpesaConfig.till_number ? 'mpesa_till' : 'mpesa_paybill',
        ledger_debit_account_code: mpesaConfig.ledger_debit_account_code,
        ledger_credit_account_code: mpesaConfig.ledger_credit_account_code,
        metadata: dto.metadata ?? {},
      });
      await this.fraudDetectionService.inspectPaymentIntentCreation({
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        amount_minor: amountMinor,
        phone_number: normalizedPhoneNumber,
        account_reference: paymentIntent.account_reference,
        external_reference: paymentIntent.external_reference,
      });
      const stkStartedAt = performance.now();
      let stkResponse: StkPushResponse;

      try {
        stkResponse = await this.sendStkPush(paymentIntent, mpesaConfig);
        this.sloMetrics?.recordMpesaStkPush({
          outcome: 'success',
          duration_ms: performance.now() - stkStartedAt,
          tenant_id: tenantId,
          payment_intent_id: paymentIntent.id,
        });
      } catch (error) {
        this.sloMetrics?.recordMpesaStkPush({
          outcome: 'failure',
          duration_ms: performance.now() - stkStartedAt,
          tenant_id: tenantId,
          payment_intent_id: paymentIntent.id,
          error_message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const updatedPaymentIntent = await this.paymentIntentsRepository.markStkRequested(
        tenantId,
        paymentIntent.id,
        {
          merchant_request_id: stkResponse.MerchantRequestID,
          checkout_request_id: stkResponse.CheckoutRequestID,
          response_code: stkResponse.ResponseCode,
          response_description: stkResponse.ResponseDescription,
          customer_message: stkResponse.CustomerMessage,
        },
        Number(this.configService.get<number>('mpesa.paymentIntentExpirySeconds') ?? 1800),
      );
      const response = this.toPaymentIntentResponse(updatedPaymentIntent);

      await this.paymentIntentIdempotencyRepository.markCompleted(
        tenantId,
        idempotencyRecord.id,
        201,
        response,
      );

      return this.mapPaymentIntentResponse(response);
    });
  }

  async createPlatformPaymentIntent(dto: CreatePaymentIntentDto): Promise<PaymentIntentResponseDto> {
    return this.createPaymentIntent(dto, { payment_owner: 'platform' });
  }

  parseCallbackPayload(payload: unknown): ParsedMpesaCallback {
    const callbackPayload = payload as MpesaCallbackPayload;
    const stkCallback = callbackPayload?.Body?.stkCallback;

    if (!stkCallback?.MerchantRequestID || !stkCallback.CheckoutRequestID) {
      throw new BadRequestException('MPESA callback is missing request identifiers');
    }

    if (typeof stkCallback.ResultCode !== 'number' || !stkCallback.ResultDesc) {
      throw new BadRequestException('MPESA callback is missing result information');
    }

    const metadataItems = stkCallback.CallbackMetadata?.Item ?? [];
    const metadata = this.toMetadataMap(metadataItems);
    const amountValue = metadata.Amount;
    const transactionDateValue = metadata.TransactionDate;
    const phoneNumberValue = metadata.PhoneNumber;

    return {
      merchant_request_id: stkCallback.MerchantRequestID,
      checkout_request_id: stkCallback.CheckoutRequestID,
      result_code: stkCallback.ResultCode,
      result_desc: stkCallback.ResultDesc,
      status: stkCallback.ResultCode === 0 ? 'succeeded' : 'failed',
      amount_minor: amountValue == null ? null : this.convertMajorToMinor(String(amountValue)),
      mpesa_receipt_number:
        metadata.MpesaReceiptNumber == null ? null : String(metadata.MpesaReceiptNumber),
      transaction_occurred_at:
        transactionDateValue == null ? null : this.parseTransactionDate(String(transactionDateValue)),
      phone_number: phoneNumberValue == null ? null : this.normalizePhoneNumber(String(phoneNumberValue)),
      metadata,
    };
  }

  private async sendStkPush(
    paymentIntent: PaymentIntentEntity,
    mpesaConfig: ResolvedTenantMpesaConfig,
  ): Promise<StkPushResponse> {
    const accessToken = await this.getAccessToken(mpesaConfig);
    const request = this.buildStkPushRequest(paymentIntent, mpesaConfig);
    const response = await fetch(
      new URL('/mpesa/stkpush/v1/processrequest', mpesaConfig.base_url).toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(
          Number(this.configService.get<number>('mpesa.requestTimeoutMs') ?? 15000),
        ),
      },
    );

    const responseText = await response.text();
    const responseBody = this.tryParseJson(responseText) as StkPushResponse | null;

    if (!response.ok || !responseBody) {
      throw new BadGatewayException(
        `M-PESA STK push request failed: ${response.status} ${responseText}`,
      );
    }

    if (
      !responseBody.MerchantRequestID ||
      !responseBody.CheckoutRequestID ||
      responseBody.ResponseCode == null
    ) {
      throw new BadGatewayException('M-PESA STK push response was incomplete');
    }

    if (responseBody.ResponseCode !== '0') {
      throw new BadGatewayException(
        `M-PESA STK push was rejected: ${responseBody.ResponseDescription}`,
      );
    }

    return responseBody;
  }

  private async getAccessToken(mpesaConfig: ResolvedTenantMpesaConfig): Promise<string> {
    const redisClient = this.redisService.getClient();
    const cacheKey = [
      MPESA_ACCESS_TOKEN_CACHE_KEY,
      mpesaConfig.owner,
      mpesaConfig.tenant_id,
      mpesaConfig.environment,
      mpesaConfig.shortcode,
    ].join(':');
    const cachedToken = await redisClient.get(cacheKey);

    if (cachedToken) {
      return cachedToken;
    }

    const basicCredentials = Buffer.from(
      `${mpesaConfig.consumer_key}:${mpesaConfig.consumer_secret}`,
    ).toString('base64');
    const response = await fetch(
      new URL('/oauth/v1/generate?grant_type=client_credentials', mpesaConfig.base_url).toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicCredentials}`,
        },
        signal: AbortSignal.timeout(
          Number(this.configService.get<number>('mpesa.requestTimeoutMs') ?? 15000),
        ),
      },
    );
    const responseText = await response.text();
    const responseBody = this.tryParseJson(responseText) as OAuthTokenResponse | null;

    if (!response.ok || !responseBody?.access_token) {
      throw new BadGatewayException(
        `Unable to obtain M-PESA OAuth token: ${response.status} ${responseText}`,
      );
    }

    const expiresInSeconds = Number(responseBody.expires_in ?? 3599);
    const ttlSeconds = Math.max(60, expiresInSeconds - 60);
    await redisClient.set(cacheKey, responseBody.access_token, 'EX', ttlSeconds);

    return responseBody.access_token;
  }

  private buildStkPushRequest(
    paymentIntent: PaymentIntentEntity,
    mpesaConfig: ResolvedTenantMpesaConfig,
  ): StkPushRequest {
    const timestamp = this.buildNairobiTimestamp();
    const shortCode = mpesaConfig.shortcode;
    const password = Buffer.from(`${shortCode}${mpesaConfig.passkey}${timestamp}`).toString(
      'base64',
    );

    return {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: mpesaConfig.transaction_type,
      Amount: this.convertMinorToStkAmount(paymentIntent.amount_minor),
      PartyA: paymentIntent.phone_number,
      PartyB: shortCode,
      PhoneNumber: paymentIntent.phone_number,
      CallBackURL: mpesaConfig.callback_url,
      AccountReference: paymentIntent.account_reference,
      TransactionDesc: paymentIntent.transaction_desc,
    };
  }

  private convertMinorToStkAmount(amountMinor: string): string {
    const amount = BigInt(amountMinor);

    if (amount <= 0n) {
      throw new BadRequestException('M-PESA payment amounts must be positive');
    }

    if (amount % 100n !== 0n) {
      throw new BadRequestException('M-PESA STK push only supports whole KES amounts');
    }

    return (amount / 100n).toString();
  }

  private convertMajorToMinor(amount: string): string {
    const normalizedAmount = amount.trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)) {
      throw new BadRequestException(`Invalid M-PESA amount "${amount}"`);
    }

    const [wholePart, decimalPart = ''] = normalizedAmount.split('.');
    const paddedDecimals = `${decimalPart}00`.slice(0, 2);

    return `${wholePart}${paddedDecimals}`.replace(/^0+(?=\d)/, '');
  }

  private parseTransactionDate(value: string): string {
    if (!/^\d{14}$/.test(value)) {
      throw new BadRequestException(`Invalid M-PESA transaction date "${value}"`);
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    const parsed = new Date(Date.UTC(year, month, day, hour - 3, minute, second));

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid M-PESA transaction date "${value}"`);
    }

    return parsed.toISOString();
  }

  private toMetadataMap(items: MpesaCallbackMetadataItem[]): Record<string, unknown> {
    return items.reduce<Record<string, unknown>>((accumulator, item) => {
      if (item?.Name) {
        accumulator[item.Name] = item.Value ?? null;
      }

      return accumulator;
    }, {});
  }

  private buildNairobiTimestamp(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const partsMap = new Map(parts.map((part) => [part.type, part.value]));

    return `${partsMap.get('year')}${partsMap.get('month')}${partsMap.get('day')}${partsMap.get('hour')}${partsMap.get('minute')}${partsMap.get('second')}`;
  }

  private normalizePhoneNumber(value: string): string {
    const digitsOnly = value.replace(/\D/g, '');

    if (/^254\d{9}$/.test(digitsOnly)) {
      return digitsOnly;
    }

    if (/^0\d{9}$/.test(digitsOnly)) {
      return `254${digitsOnly.slice(1)}`;
    }

    if (/^[17]\d{8}$/.test(digitsOnly)) {
      return `254${digitsOnly}`;
    }

    throw new BadRequestException(`Invalid Kenyan phone number "${value}"`);
  }

  private normalizeMinorAmount(value: string): string {
    const normalizedValue = value.trim();

    if (!/^[1-9][0-9]*$/.test(normalizedValue)) {
      throw new BadRequestException('M-PESA amount must be a positive integer in minor units');
    }

    return normalizedValue;
  }

  private buildIdempotencyHash(payload: CreatePaymentIntentDto): string {
    return createHash('sha256')
      .update(
        this.stableSerialize({
          idempotency_key: payload.idempotency_key.trim(),
          amount_minor: payload.amount_minor.trim(),
          phone_number: payload.phone_number.trim(),
          account_reference: payload.account_reference.trim(),
          transaction_desc: payload.transaction_desc.trim(),
          student_id: payload.student_id ?? null,
          external_reference: payload.external_reference?.trim() ?? null,
          metadata: payload.metadata ?? {},
        }),
      )
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      const keys = Object.keys(objectValue).sort();
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${this.stableSerialize(objectValue[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for M-PESA payments');
    }

    return tenantId;
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key) ?? '';

    if (value.trim().length === 0) {
      throw new BadGatewayException(`Missing MPESA configuration value "${key}"`);
    }

    return value;
  }

  private getBaseUrl(): string {
    return this.requireConfig('mpesa.baseUrl');
  }

  private async resolveMpesaConfig(
    tenantId: string,
    paymentOwner: 'tenant' | 'platform',
  ): Promise<ResolvedTenantMpesaConfig> {
    if (paymentOwner === 'platform') {
      return this.requireTenantFinanceConfigService().resolvePlatformMpesaConfig(tenantId);
    }

    return this.requireTenantFinanceConfigService().resolveMpesaConfigForTenant(tenantId);
  }

  private requireTenantFinanceConfigService(): TenantFinanceConfigService {
    if (!this.tenantFinanceConfigService) {
      throw new BadGatewayException('Tenant finance configuration service is not available');
    }

    return this.tenantFinanceConfigService;
  }

  private toPaymentIntentResponse(paymentIntent: PaymentIntentEntity): PaymentIntentResponse {
    return {
      payment_intent_id: paymentIntent.id,
      tenant_id: paymentIntent.tenant_id,
      student_id: paymentIntent.student_id,
      status: paymentIntent.status,
      amount_minor: paymentIntent.amount_minor,
      currency_code: paymentIntent.currency_code,
      payment_owner: paymentIntent.payment_owner,
      mpesa_short_code: paymentIntent.mpesa_short_code,
      payment_channel_type: paymentIntent.payment_channel_type,
      phone_number: paymentIntent.phone_number,
      account_reference: paymentIntent.account_reference,
      external_reference: paymentIntent.external_reference,
      merchant_request_id: paymentIntent.merchant_request_id,
      checkout_request_id: paymentIntent.checkout_request_id,
      response_code: paymentIntent.response_code,
      response_description: paymentIntent.response_description,
      customer_message: paymentIntent.customer_message,
      created_at: paymentIntent.created_at.toISOString(),
      updated_at: paymentIntent.updated_at.toISOString(),
    };
  }

  private mapPaymentIntentResponse(response: PaymentIntentResponse): PaymentIntentResponseDto {
    return Object.assign(new PaymentIntentResponseDto(), response);
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
