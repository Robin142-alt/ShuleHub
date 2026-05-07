import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';

import { AppModule } from './app.module';
import { StructuredLoggerService } from './modules/observability/structured-logger.service';

export const createApp = async (
  adapter?: AbstractHttpAdapter,
  options: NestApplicationOptions = {},
): Promise<INestApplication> => {
  const applicationOptions: NestApplicationOptions = {
    bufferLogs: true,
    rawBody: true,
    ...options,
  };

  const app = adapter
    ? await NestFactory.create(AppModule, adapter, applicationOptions)
    : await NestFactory.create(AppModule, applicationOptions);

  const logger = app.get(StructuredLoggerService);
  app.useLogger(logger);
  const configService = app.get(ConfigService);

  const corsEnabled = configService.get<boolean>('app.corsEnabled') ?? true;

  if (corsEnabled) {
    const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
    const corsMethods = configService.get<string[]>('app.corsMethods') ?? [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ];

    app.enableCors({
      origin:
        corsOrigins.length === 0 || corsOrigins.includes('*')
          ? true
          : corsOrigins,
      methods: corsMethods,
      credentials: configService.get<boolean>('app.corsCredentials') ?? true,
    });
    logger.log(
      `CORS enabled for ${corsOrigins.length === 0 ? 'all origins' : corsOrigins.join(', ')}`,
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix(configService.get<string>('app.globalPrefix') ?? '');

  return app;
};
