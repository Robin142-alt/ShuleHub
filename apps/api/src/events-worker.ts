import 'reflect-metadata';

process.env.APP_RUNTIME = process.env.APP_RUNTIME ?? 'worker';
process.env.EVENTS_DISPATCHER_ENABLED =
  process.env.EVENTS_DISPATCHER_ENABLED ?? 'true';
process.env.EVENTS_WORKER_ENABLED = process.env.EVENTS_WORKER_ENABLED ?? 'true';
process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED =
  process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED ?? 'false';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('EventsWorkerBootstrap');

  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
    });

    app.enableShutdownHooks();
    logger.log('Events outbox dispatcher and consumer worker are running');
  } catch (error) {
    logger.error(
      `Events worker failed to start: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  }
}

void bootstrap();
