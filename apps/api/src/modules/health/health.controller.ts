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
      this.supportNotificationDeliveryService
        ? await this.supportNotificationDeliveryService.getProviderStatus()
        : null;
    const objectStorageStatus = this.getObjectStorageReadiness();
    const malwareScanStatus = this.getMalwareScanReadiness();
    const supportNotificationDegraded = this.isSupportNotificationDegraded(
      supportNotificationStatus?.status,
    );

    return {
      status:
        (realtimeHealth && realtimeHealth.overall_status !== 'healthy')
        || corsStatus.status === 'invalid'
        || supportNotificationDegraded
        || this.isOperationalReadinessDegraded(objectStorageStatus.status)
        || this.isOperationalReadinessDegraded(malwareScanStatus.status)
          ? 'degraded'
          : 'ok',
      services: {
        postgres: database,
        redis,
        bullmq: 'configured',
        transactional_email: emailStatus.status,
        cors: corsStatus.status,
        support_notifications: supportNotificationStatus?.status ?? 'unknown',
        object_storage: objectStorageStatus.status,
        malware_scanning: malwareScanStatus.status,
      },
      email: emailStatus,
      cors: corsStatus,
      support_notifications: supportNotificationStatus,
      object_storage: objectStorageStatus,
      malware_scanning: malwareScanStatus,
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

  private isSupportNotificationDegraded(status: string | undefined): boolean {
    return status === 'missing_provider'
      || status === 'missing_credentials'
      || status === 'degraded';
  }

  private getObjectStorageReadiness() {
    const enabled = this.readBooleanConfig('UPLOAD_OBJECT_STORAGE_ENABLED');
    const configured = {
      provider: this.readStringConfig('UPLOAD_OBJECT_STORAGE_PROVIDER') ?? 's3',
      endpoint_configured: Boolean(this.readStringConfig('UPLOAD_OBJECT_STORAGE_ENDPOINT')),
      bucket_configured: Boolean(this.readStringConfig('UPLOAD_OBJECT_STORAGE_BUCKET')),
      region_configured: Boolean(this.readStringConfig('UPLOAD_OBJECT_STORAGE_REGION')),
      access_key_configured: Boolean(this.readStringConfig('UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID')),
      secret_key_configured: Boolean(this.readStringConfig('UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY')),
    };
    const anyConfigured = configured.endpoint_configured
      || configured.bucket_configured
      || configured.region_configured
      || configured.access_key_configured
      || configured.secret_key_configured;
    const missing = [
      configured.endpoint_configured ? null : 'endpoint',
      configured.bucket_configured ? null : 'bucket',
      configured.access_key_configured ? null : 'access_key',
      configured.secret_key_configured ? null : 'secret_key',
    ].filter((item): item is string => Boolean(item));

    if (!enabled && !anyConfigured) {
      return {
        status: 'disabled' as const,
        enabled: false,
        provider: configured.provider,
        endpoint_configured: false,
        bucket_configured: false,
        region_configured: false,
        access_key_configured: false,
        secret_key_configured: false,
        missing: [],
      };
    }

    return {
      status: missing.length > 0 ? 'missing_credentials' as const : 'configured' as const,
      enabled,
      ...configured,
      missing,
    };
  }

  private getMalwareScanReadiness() {
    const required = this.readBooleanConfig('UPLOAD_MALWARE_SCAN_REQUIRED');
    const providerConfigured = Boolean(this.readStringConfig('UPLOAD_MALWARE_SCAN_PROVIDER'));
    const apiUrlConfigured = Boolean(this.readStringConfig('UPLOAD_MALWARE_SCAN_API_URL'));
    const apiTokenConfigured = Boolean(this.readStringConfig('UPLOAD_MALWARE_SCAN_API_TOKEN'));
    const healthUrlConfigured = Boolean(this.readStringConfig('UPLOAD_MALWARE_SCAN_HEALTH_URL'));
    const anyConfigured = providerConfigured
      || apiUrlConfigured
      || apiTokenConfigured
      || healthUrlConfigured;
    const missing = [
      providerConfigured ? null : 'provider',
      apiUrlConfigured ? null : 'api_url',
      apiTokenConfigured ? null : 'api_token',
    ].filter((item): item is string => Boolean(item));

    if (!required && !anyConfigured) {
      return {
        status: 'disabled' as const,
        required: false,
        provider_configured: false,
        api_url_configured: false,
        api_token_configured: false,
        health_url_configured: false,
        missing: [],
      };
    }

    return {
      status: missing.length > 0 ? 'missing_credentials' as const : 'configured' as const,
      required,
      provider_configured: providerConfigured,
      api_url_configured: apiUrlConfigured,
      api_token_configured: apiTokenConfigured,
      health_url_configured: healthUrlConfigured,
      missing,
    };
  }

  private isOperationalReadinessDegraded(status: string): boolean {
    return status === 'missing_credentials' || status === 'degraded';
  }

  private readStringConfig(key: string): string | undefined {
    const value = this.configService?.get<string | undefined>(key);

    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed || undefined;
  }

  private readBooleanConfig(key: string): boolean {
    const value = this.readStringConfig(key);
    return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
  }
}
