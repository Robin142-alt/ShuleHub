import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { performance } from 'node:perf_hooks';

import { Public } from '../../../auth/decorators/public.decorator';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import { SloMetricsService } from '../../observability/slo-metrics.service';
import { StructuredLoggerService } from '../../observability/structured-logger.service';
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
  ) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Req() request: Request): Promise<MpesaCallbackResponseDto> {
    const requestContext = this.requestContext.requireStore();
    const tenantId = requestContext.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for MPESA callbacks');
    }

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

    const callbackLog = await this.callbackLogsRepository.createLog({
      tenant_id: tenantId,
      merchant_request_id: parsedCallback?.merchant_request_id ?? null,
      checkout_request_id: parsedCallback?.checkout_request_id ?? null,
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
}
