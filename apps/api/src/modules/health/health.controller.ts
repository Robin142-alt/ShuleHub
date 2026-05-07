import { Controller, Get, Optional } from '@nestjs/common';

import { Public } from '../../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CircuitBreakerService } from '../../infrastructure/resilience/circuit-breaker.service';
import { SloMonitoringService } from '../observability/slo-monitoring.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    @Optional() private readonly circuitBreakerService?: CircuitBreakerService,
    @Optional() private readonly sloMonitoringService?: SloMonitoringService,
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

    return {
      status:
        realtimeHealth && realtimeHealth.overall_status !== 'healthy'
          ? 'degraded'
          : 'ok',
      services: {
        postgres: database,
        redis,
        bullmq: 'configured',
      },
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
}
