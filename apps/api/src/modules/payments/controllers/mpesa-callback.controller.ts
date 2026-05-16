import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { performance } from 'node:perf_hooks';

import { Public } from '../../../auth/decorators/public.decorator';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import { SloMetricsService } from '../../observability/slo-metrics.service';
import { StructuredLoggerService } from '../../observability/structured-logger.service';
import { TenantFinanceConfigService } from '../../tenant-finance/tenant-finance-config.service';
import { DarajaIntegrationService } from '../../integrations/daraja-integration.service';
import { MpesaCallbackResponseDto } from '../dto/mpesa-callback-response.dto';
import {
  PAYMENTS_PROCESS_JOB,
  PAYMENTS_QUEUE_NAME,
} from '../payments.constants';
import { CallbackLogsRepository } from '../repositories/callback-logs.repository';
import { PaymentsJobProducerService } from '../services/payments-job-producer.service';
import { MpesaReplayProtectionService } from '../services/mpesa-replay-protection.service';
import { MpesaService } from '../services/mpesa.service';
import { MpesaSignatureService } from '../services/mpesa-signature.service';

@Public()
@Controller(['payments/mpesa', 'mpesa'])
export class MpesaCallbackController {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly callbackLogsRepository: CallbackLogsRepository,
    private readonly mpesaService: MpesaService,
    private readonly mpesaSignatureService: MpesaSignatureService,
    private readonly mpesaReplayProtectionService: MpesaReplayProtectionService,
    private readonly paymentsJobProducerService: PaymentsJobProducerService,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
    @Optional() private readonly tenantFinanceConfigService?: TenantFinanceConfigService,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly darajaIntegrationService?: DarajaIntegrationService,
  ) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Req() request: Request): Promise<MpesaCallbackResponseDto> {
    return this.handleCallbackInternal(request, null);
  }

  @Post('callback/:integrationId')
  @HttpCode(HttpStatus.OK)
  async handleIntegrationCallback(
    @Param('integrationId') integrationId: string,
    @Req() request: Request,
  ): Promise<MpesaCallbackResponseDto> {
    return this.handleCallbackInternal(request, integrationId);
  }

  private async handleCallbackInternal(
    request: Request,
    integrationId: string | null,
  ): Promise<MpesaCallbackResponseDto> {
    const requestContext = this.requestContext.requireStore();
    const rawBody = this.getRawBody(request);
    const inspection = this.mpesaSignatureService.inspectCallback(rawBody, request.headers);

    let parsedCallback:
      | ReturnType<MpesaService['parseCallbackPayload']>
      | null = null;
    let payloadError: Error | null = null;
    let signatureError: Error | null = null;

    try {
      parsedCallback = this.mpesaService.parseCallbackPayload(request.body);
    } catch (error) {
      payloadError = error as Error;
    }

    try {
      this.mpesaSignatureService.verifyCallback(rawBody, request.headers, inspection);
    } catch (error) {
      signatureError = error as Error;
    }

    const resolvedTenant = await this.resolveCallbackTenant(
      request.body,
      parsedCallback,
      requestContext.tenant_id,
      integrationId,
    );
    const tenantId = resolvedTenant.tenant_id;

    if (requestContext.tenant_id !== tenantId) {
      this.requestContext.setTenantId(tenantId);
      await this.databaseService?.synchronizeRequestSession(this.requestContext.requireStore());
    }

    const callbackLog = await this.callbackLogsRepository.createLog({
      tenant_id: tenantId,
      merchant_request_id: parsedCallback?.merchant_request_id ?? null,
      checkout_request_id: parsedCallback?.checkout_request_id ?? null,
      mpesa_short_code: resolvedTenant.shortcode,
      delivery_id: inspection.delivery_id,
      request_fingerprint: inspection.request_fingerprint,
      event_timestamp: inspection.event_timestamp,
      signature: inspection.signature,
      signature_verified: !signatureError,
      headers: request.headers as Record<string, unknown>,
      raw_body: rawBody,
      raw_payload:
        request.body && typeof request.body === 'object'
          ? (request.body as Record<string, unknown>)
          : null,
      source_ip: this.getSourceIp(request),
    });

    if (payloadError) {
      await this.callbackLogsRepository.markRejected(tenantId, callbackLog.id, payloadError.message);
      throw new BadRequestException(payloadError.message);
    }

    if (signatureError) {
      await this.callbackLogsRepository.markRejected(
        tenantId,
        callbackLog.id,
        signatureError.message,
      );
      throw signatureError;
    }

    if (!parsedCallback) {
      throw new BadRequestException('MPESA callback is missing required fields');
    }

    if (!integrationId) {
      try {
        await this.tenantFinanceConfigService?.assertCallbackBelongsToTenant({
          tenant_id: tenantId,
          payload: request.body,
          checkout_request_id: parsedCallback.checkout_request_id,
          merchant_request_id: parsedCallback.merchant_request_id,
        });
      } catch (error) {
        await this.callbackLogsRepository.markRejected(
          tenantId,
          callbackLog.id,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }

    const accepted = await this.mpesaReplayProtectionService.registerDelivery(
      tenantId,
      inspection.delivery_id,
    );

    if (!accepted) {
      await this.callbackLogsRepository.markReplayed(tenantId, callbackLog.id);
      return Object.assign(new MpesaCallbackResponseDto(), {
        accepted: true,
        duplicate: true,
        callback_log_id: callbackLog.id,
        checkout_request_id: parsedCallback?.checkout_request_id ?? null,
      });
    }

    const enqueueStartedAt = performance.now();
    let enqueueResult;

    try {
      enqueueResult = await this.paymentsJobProducerService.enqueuePayment({
        tenant_id: tenantId,
        checkout_request_id: parsedCallback.checkout_request_id,
        callback_log_id: callbackLog.id,
        request_id: requestContext.request_id,
        trace_id: requestContext.trace_id,
        parent_span_id: requestContext.span_id,
        user_id: requestContext.user_id,
        role: requestContext.role,
        session_id: requestContext.session_id,
      });
      this.sloMetrics?.recordQueueEnqueue({
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: PAYMENTS_PROCESS_JOB,
        outcome: 'success',
        duration_ms: performance.now() - enqueueStartedAt,
      });
      this.structuredLogger?.logEvent('queue.job.enqueued', {
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: PAYMENTS_PROCESS_JOB,
        job_id: enqueueResult.job_id,
        callback_log_id: callbackLog.id,
        checkout_request_id: parsedCallback.checkout_request_id,
        queue_lag_ms: 0,
      });
    } catch (error) {
      await this.callbackLogsRepository.markFailed(
        tenantId,
        callbackLog.id,
        error instanceof Error ? error.message : String(error),
      );
      this.sloMetrics?.recordQueueEnqueue({
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: PAYMENTS_PROCESS_JOB,
        outcome: 'failure',
        duration_ms: performance.now() - enqueueStartedAt,
        error_message: error instanceof Error ? error.message : String(error),
      });
      this.structuredLogger?.logEvent(
        'queue.job.enqueue_failed',
        {
          queue_name: PAYMENTS_QUEUE_NAME,
          job_name: PAYMENTS_PROCESS_JOB,
          callback_log_id: callbackLog.id,
          checkout_request_id: parsedCallback.checkout_request_id,
          error_message: error instanceof Error ? error.message : String(error),
        },
        'error',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    if (enqueueResult.deduplicated && enqueueResult.state === 'completed') {
      await this.callbackLogsRepository.markProcessed(tenantId, callbackLog.id);
    } else {
      await this.callbackLogsRepository.markQueued(
        tenantId,
        callbackLog.id,
        enqueueResult.job_id,
      );
    }

    return Object.assign(new MpesaCallbackResponseDto(), {
      accepted: true,
      duplicate: enqueueResult.deduplicated,
      callback_log_id: callbackLog.id,
      checkout_request_id: parsedCallback?.checkout_request_id ?? null,
    });
  }

  private getRawBody(request: Request): string {
    if (request.rawBody) {
      return request.rawBody.toString('utf8');
    }

    if (typeof request.body === 'string') {
      return request.body;
    }

    return JSON.stringify(request.body ?? {});
  }

  private getSourceIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0] ?? null;
    }

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]?.trim() ?? null;
    }

    return request.ip || null;
  }

  private async resolveCallbackTenant(
    payload: unknown,
    parsedCallback:
      | ReturnType<MpesaService['parseCallbackPayload']>
      | null,
    fallbackTenantId: string | null,
    integrationId: string | null,
  ): Promise<{ tenant_id: string; shortcode: string | null }> {
    if (integrationId && this.darajaIntegrationService) {
      const integration = await this.darajaIntegrationService.getCredentialsForCallback(integrationId);

      if (!integration) {
        throw new UnauthorizedException('Daraja integration is not active');
      }

      return {
        tenant_id: integration.tenant_id,
        shortcode: integration.shortcode ?? integration.paybill_number ?? integration.till_number,
      };
    }

    if (this.tenantFinanceConfigService) {
      return this.tenantFinanceConfigService.resolveTenantForMpesaCallback({
        payload,
        checkout_request_id: parsedCallback?.checkout_request_id ?? null,
        merchant_request_id: parsedCallback?.merchant_request_id ?? null,
        fallback_tenant_id: fallbackTenantId,
      });
    }

    if (!fallbackTenantId) {
      throw new UnauthorizedException('Tenant context is required for MPESA callbacks');
    }

    return { tenant_id: fallbackTenantId, shortcode: null };
  }
}
