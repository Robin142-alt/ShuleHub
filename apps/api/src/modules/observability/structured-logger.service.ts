import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../common/request-context/request-context.service';

type StructuredLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, trace?: string, context?: string): void {
    this.write('fatal', message, context, trace);
  }

  logRequest(event: 'request.received' | 'request.completed' | 'request.aborted', fields: Record<string, unknown>): void {
    this.write('log', event, StructuredLoggerService.name, undefined, fields);
  }

  logAlert(
    event: 'observability.slo.alert_raised' | 'observability.slo.alert_cleared',
    fields: Record<string, unknown>,
    level: 'warn' | 'error' = 'warn',
  ): void {
    this.write(level, event, StructuredLoggerService.name, undefined, fields);
  }

  logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: StructuredLogLevel = 'log',
    trace?: string,
  ): void {
    this.write(level, event, StructuredLoggerService.name, trace, fields);
  }

  buildRecord(
    level: StructuredLogLevel,
    message: unknown,
    context?: string,
    trace?: string,
    fields: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const requestContext = this.requestContext.snapshot();

    return {
      timestamp: new Date().toISOString(),
      level,
      environment: this.configService.get<string>('app.nodeEnv') ?? 'development',
      service: 'api',
      context: context ?? null,
      message: this.serializeValue(message),
      trace_id: requestContext?.trace_id ?? null,
      span_id: requestContext?.span_id ?? null,
      parent_span_id: requestContext?.parent_span_id ?? null,
      tenant_id: requestContext?.tenant_id ?? null,
      request_id: requestContext?.request_id ?? null,
      user_id: requestContext?.user_id ?? null,
      session_id: requestContext?.session_id ?? null,
      role: requestContext?.role ?? null,
      method: requestContext?.method ?? null,
      path: requestContext?.path ?? null,
      client_ip: requestContext?.client_ip ?? null,
      user_agent: requestContext?.user_agent ?? null,
      ...fields,
      ...(trace ? { trace } : {}),
    };
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    context?: string,
    trace?: string,
    fields: Record<string, unknown> = {},
  ): void {
    const record = this.buildRecord(level, message, context, trace, fields);
    const stream =
      level === 'error' || level === 'fatal'
        ? process.stderr
        : process.stdout;

    stream.write(`${JSON.stringify(record)}\n`);
  }

  private serializeValue(value: unknown): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    return value;
  }
}
