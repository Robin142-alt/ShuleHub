import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AUTH_ANONYMOUS_USER_ID } from '../auth/auth.constants';
import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { PaymentsQueueVerificationModule } from '../modules/payments/queue/payments-queue.verification.module';

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

async function main(): Promise<void> {
  const logger = new Logger('VerifyPaymentProcessingScript');
  const app = await NestFactory.createApplicationContext(PaymentsQueueVerificationModule, {
    bufferLogs: true,
  });

  try {
    const requestContext = app.get(RequestContextService);
    const databaseService = app.get(DatabaseService);
    const tenantId = process.env.TEST_PAYMENT_TENANT_ID;
    const checkoutRequestId = process.env.TEST_PAYMENT_CHECKOUT_REQUEST_ID;
    const timeoutMs = Number(process.env.TEST_PAYMENT_VERIFY_TIMEOUT_MS ?? 30000);
    const pollIntervalMs = Number(process.env.TEST_PAYMENT_VERIFY_POLL_MS ?? 1000);

    if (!checkoutRequestId) {
      throw new Error('TEST_PAYMENT_CHECKOUT_REQUEST_ID is required to verify a payment job');
    }
    if (!tenantId) {
      throw new Error('TEST_PAYMENT_TENANT_ID is required to verify a payment job');
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const result = await requestContext.run(
        {
          request_id: `verify-payment:${checkoutRequestId}`,
          tenant_id: tenantId,
          user_id: AUTH_ANONYMOUS_USER_ID,
          role: 'system',
          session_id: null,
          permissions: ['*:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'verify-payment-processing-script',
          method: 'TEST',
          path: '/scripts/verify-payment-processing',
          started_at: new Date().toISOString(),
        },
        async () => {
          const paymentIntentResult = await databaseService.query<{
            id: string;
            status: string;
            ledger_transaction_id: string | null;
            completed_at: Date | null;
          }>(
            `
              SELECT
                id,
                status,
                ledger_transaction_id,
                completed_at
              FROM payment_intents
              WHERE tenant_id = $1
                AND checkout_request_id = $2
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [tenantId, checkoutRequestId],
          );

          if (!paymentIntentResult.rows[0]) {
            return null;
          }

          const paymentIntent = paymentIntentResult.rows[0];
          const mpesaTransactionResult = await databaseService.query<{
            id: string;
            status: string;
            ledger_transaction_id: string | null;
            mpesa_receipt_number: string | null;
          }>(
            `
              SELECT
                id,
                status,
                ledger_transaction_id,
                mpesa_receipt_number
              FROM mpesa_transactions
              WHERE tenant_id = $1
                AND checkout_request_id = $2
              LIMIT 1
            `,
            [tenantId, checkoutRequestId],
          );
          const mpesaTransaction = mpesaTransactionResult.rows[0] ?? null;

          const ledgerTransactionId =
            paymentIntent.ledger_transaction_id ?? mpesaTransaction?.ledger_transaction_id ?? null;
          const ledgerTransactionResult = ledgerTransactionId
            ? await databaseService.query<{
                id: string;
                reference: string;
                total_amount_minor: string;
              }>(
                `
                  SELECT
                    id,
                    reference,
                    total_amount_minor::text
                  FROM transactions
                  WHERE tenant_id = $1
                    AND id = $2::uuid
                  LIMIT 1
                `,
                [tenantId, ledgerTransactionId],
              )
            : { rows: [] };

          if (paymentIntent.status !== 'completed' || ledgerTransactionResult.rows.length === 0) {
            return null;
          }

          return {
            payment_intent: {
              id: paymentIntent.id,
              status: paymentIntent.status,
              ledger_transaction_id: ledgerTransactionId,
              completed_at: paymentIntent.completed_at?.toISOString() ?? null,
            },
            mpesa_transaction: mpesaTransaction,
            ledger_transaction: ledgerTransactionResult.rows[0],
          };
        },
      );

      if (result) {
        process.stdout.write(
          `${JSON.stringify(
            {
              verified: true,
              latency_ms: Date.now() - startedAt,
              result,
            },
            null,
            2,
          )}\n`,
        );
        return;
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(
      `Payment job for tenant "${tenantId}" and checkout request "${checkoutRequestId}" was not processed within ${timeoutMs}ms`,
    );
  } catch (error) {
    logger.error(
      `Failed to verify payment processing: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
