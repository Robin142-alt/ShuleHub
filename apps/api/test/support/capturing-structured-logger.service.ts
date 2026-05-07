import { Injectable } from '@nestjs/common';

import { StructuredLoggerService } from '../../src/modules/observability/structured-logger.service';

@Injectable()
export class CapturingStructuredLoggerService extends StructuredLoggerService {
  private readonly records: Record<string, unknown>[] = [];

  override log(message: unknown, context?: string): void {
    this.records.push(this.buildRecord('log', message, context));
  }

  override error(message: unknown, trace?: string, context?: string): void {
    this.records.push(this.buildRecord('error', message, context, trace));
  }

  override warn(message: unknown, context?: string): void {
    this.records.push(this.buildRecord('warn', message, context));
  }

  override debug(message: unknown, context?: string): void {
    this.records.push(this.buildRecord('debug', message, context));
  }

  override verbose(message: unknown, context?: string): void {
    this.records.push(this.buildRecord('verbose', message, context));
  }

  override fatal(message: unknown, trace?: string, context?: string): void {
    this.records.push(this.buildRecord('fatal', message, context, trace));
  }

  override logRequest(
    event: 'request.received' | 'request.completed' | 'request.aborted',
    fields: Record<string, unknown>,
  ): void {
    this.records.push(
      this.buildRecord('log', event, StructuredLoggerService.name, undefined, fields),
    );
  }

  override logAlert(
    event: 'observability.slo.alert_raised' | 'observability.slo.alert_cleared',
    fields: Record<string, unknown>,
    level: 'warn' | 'error' = 'warn',
  ): void {
    this.records.push(
      this.buildRecord(level, event, StructuredLoggerService.name, undefined, fields),
    );
  }

  override logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal' = 'log',
    trace?: string,
  ): void {
    this.records.push(
      this.buildRecord(level, event, StructuredLoggerService.name, trace, fields),
    );
  }

  reset(): void {
    this.records.length = 0;
  }

  snapshot(): Record<string, unknown>[] {
    return [...this.records];
  }
}
