import { Controller, Get, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveCorsOriginPolicy } from '../../app-cors-policy';
import { AuthEmailService } from '../../auth/auth-email.service';
import { Public } from '../../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CircuitBreakerService } from '../../infrastructure/resilience/circuit-breaker.service';
import { SloMonitoringService } from '../observability/slo-monitoring.service';
import { SupportNotificationDeliveryService } from '../support/support-notification-delivery.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    @Optional() private readonly circuitBreakerService?: CircuitBreakerService,
    @Optional() private readonly sloMonitoringService?: SloMonitoringService,
    @Optional() private readonly authEmailService?: AuthEmailService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly supportNotificationDeliveryService?: SupportNotificationDeliveryService,
  ) {}

  @Public()
  @Get()
  @SkipResponseEnvelope()
  getHealth() {
    return {
      status: 'ok',
    };
  }

  @Public()
  @Get('ready')
  @SkipResponseEnvelope()
  async getReadiness() {
    const [database, redis] = await Promise.all([
      this.databaseService.ping(),
      this.redisService.ping(),
    ]);
    const requestContext = this.requestContext.requireStore();
    const realtimeHealth = this.sloMonitoringService
      ? await this.sloMonitoringService.getRealtimeHealth()
      : null;
    const emailStatus = this.authEmailService?.getTransactionalEmailStatus() ?? {
      provider: 'resend',
      status: 'missing' as const,
      api_key_configured: false,
      sender_configured: false,
      public_app_url_configured: false,
    };
    const corsStatus = this.getCorsReadiness();
    const supportNotificationStatus =
      this.supportNotificationDeliveryService?.getProviderStatus() ?? null;

    return {
      status:
        (realtimeHealth && realtimeHealth.overall_status !== 'healthy')
        || corsStatus.status === 'invalid'
          ? 'degraded'
          : 'ok',
      services: {
        postgres: database,
        redis,
        bullmq: 'configured',
        transactional_email: emailStatus.status,
        cors: corsStatus.status,
        support_notifications: supportNotificationStatus?.status ?? 'unknown',
      },
      email: emailStatus,
      cors: corsStatus,
      support_notifications: supportNotificationStatus,
      database_pool: this.databaseService.getPoolMetrics(),
      circuit_breakers: this.circuitBreakerService?.getAllStates() ?? {},
      slo: realtimeHealth,
      request_context: {
        request_id: requestContext.request_id,
        tenant_id: requestContext.tenant_id,
        user_id: requestContext.user_id,
        role: requestContext.role,
        session_id: requestContext.session_id,
        is_authenticated: requestContext.is_authenticated,
      },
    };
  }

  private getCorsReadiness() {
    const corsEnabled = this.configService?.get<boolean>('app.corsEnabled') ?? true;
    const nodeEnv = this.configService?.get<string>('app.nodeEnv') ?? 'development';
    const corsOrigins = this.configService?.get<string[]>('app.corsOrigins') ?? [];
    const corsCredentials = this.configService?.get<boolean>('app.corsCredentials') ?? true;

    if (!corsEnabled) {
      return {
        status: 'disabled' as const,
        credentials: false,
        allow_all_origins: false,
        origin_count: 0,
        production_locked: nodeEnv !== 'production',
      };
    }

    try {
      const originPolicy = resolveCorsOriginPolicy({
        nodeEnv,
        origins: corsOrigins,
        credentials: corsCredentials,
      });

      return {
        status: 'configured' as const,
        credentials: corsCredentials,
        allow_all_origins: originPolicy === true,
        origin_count: originPolicy === true ? 0 : originPolicy.length,
        production_locked: nodeEnv === 'production' ? originPolicy !== true : false,
      };
    } catch (error) {
      return {
        status: 'invalid' as const,
        credentials: corsCredentials,
        allow_all_origins: false,
        origin_count: corsOrigins.length,
        production_locked: false,
        error: error instanceof Error ? error.message : 'Invalid CORS configuration',
      };
    }
  }
}
