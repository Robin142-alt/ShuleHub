import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { RequestContextService } from './request-context/request-context.service';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

@Global()
@Module({
  providers: [
    RequestContextService,
    ResponseEnvelopeInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
  exports: [RequestContextService, ResponseEnvelopeInterceptor],
})
export class CommonModule {}
