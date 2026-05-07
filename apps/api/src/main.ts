import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from './modules/observability/structured-logger.service';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const configService = app.get(ConfigService);
  const logger = app.get(StructuredLoggerService);
  const port = Number(process.env.PORT ?? configService.get<number>('app.port') ?? 3000);

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
