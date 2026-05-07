import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PaymentsQueueRuntimeModule } from '../modules/payments/queue/payments-queue.runtime.module';
import { PaymentsJobProducerService } from '../modules/payments/services/payments-job-producer.service';

async function main(): Promise<void> {
  const logger = new Logger('EnqueuePaymentJobScript');
  const app = await NestFactory.createApplicationContext(PaymentsQueueRuntimeModule, {
    bufferLogs: true,
  });

  try {
    const paymentsJobProducer = app.get(PaymentsJobProducerService);
    const tenantId = process.env.TEST_PAYMENT_TENANT_ID ?? 'tenant-demo';
    const checkoutRequestId = process.env.TEST_PAYMENT_CHECKOUT_REQUEST_ID;

    if (!checkoutRequestId) {
      throw new Error('TEST_PAYMENT_CHECKOUT_REQUEST_ID is required to enqueue a payment job');
    }

    const result = await paymentsJobProducer.enqueuePayment({
      tenant_id: tenantId,
      checkout_request_id: checkoutRequestId,
      callback_log_id: process.env.TEST_PAYMENT_CALLBACK_LOG_ID ?? null,
      request_id: process.env.TEST_PAYMENT_REQUEST_ID ?? `enqueue-payment:${checkoutRequestId}`,
      trace_id: process.env.TEST_PAYMENT_TRACE_ID,
      parent_span_id: process.env.TEST_PAYMENT_PARENT_SPAN_ID ?? null,
      user_id: process.env.TEST_PAYMENT_USER_ID,
      role: process.env.TEST_PAYMENT_ROLE ?? 'system',
      session_id: process.env.TEST_PAYMENT_SESSION_ID ?? null,
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    logger.error(
      `Failed to enqueue test payment job: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
