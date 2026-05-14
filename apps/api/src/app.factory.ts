import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';

import { AppModule } from './app.module';
import { resolveCorsOriginPolicy } from './app-cors-policy';
import { StructuredLoggerService } from './modules/observability/structured-logger.service';

export const createApp = async (
  adapter?: AbstractHttpAdapter,
  options: NestApplicationOptions = {},
): Promise<INestApplication> => {
  const applicationOptions: NestApplicationOptions = {
    abortOnError: false,
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
    const corsCredentials =
      configService.get<boolean>('app.corsCredentials') ?? true;
    const corsOriginPolicy = resolveCorsOriginPolicy({
      nodeEnv: configService.get<string>('app.nodeEnv') ?? 'development',
      origins: corsOrigins,
      credentials: corsCredentials,
    });

    app.enableCors({
      origin: corsOriginPolicy,
      methods: corsMethods,
      credentials: corsCredentials,
    });
    logger.log(
      `CORS enabled for ${corsOriginPolicy === true ? 'all origins' : corsOriginPolicy.join(', ')}`,
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
