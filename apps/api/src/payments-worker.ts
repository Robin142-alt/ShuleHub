import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PaymentsWorkerModule } from './modules/payments/queue/payments-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('PaymentsWorkerBootstrap');

  try {
    const app = await NestFactory.createApplicationContext(PaymentsWorkerModule, {
      bufferLogs: true,
    });

    app.enableShutdownHooks();
    logger.log('Payments BullMQ worker is running');
  } catch (error) {
    logger.error(
      `Payments worker failed to start: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  }
}

void bootstrap();
