import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuthAudience } from '../../auth/auth.interfaces';
import { generateSpanId } from './trace.utils';
import {
  BillingAccessContextState,
  RequestContextSeed,
  RequestContextState,
} from './request-context.types';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run<T>(context: RequestContextSeed, callback: () => T): T {
    const parentContext = this.storage.getStore();
    const normalizedContext: RequestContextState = {
      ...context,
      audience: context.audience ?? parentContext?.audience ?? null,
      trace_id: context.trace_id ?? parentContext?.trace_id ?? context.request_id,
      span_id: context.span_id ?? generateSpanId(),
      parent_span_id: context.parent_span_id ?? parentContext?.span_id ?? null,
    };

    return this.storage.run(normalizedContext, callback);
  }

  getStore(): RequestContextState | undefined {
    return this.storage.getStore();
  }

  requireStore(): RequestContextState {
    const store = this.getStore();

    if (!store) {
      throw new InternalServerErrorException('Request context is not available');
    }

    return store;
  }

  setTenantId(tenantId: string): void {
    this.requireStore().tenant_id = tenantId;
  }

  setAudience(audience: AuthAudience | null): void {
    this.requireStore().audience = audience;
  }

  setUserId(userId: string): void {
    this.requireStore().user_id = userId;
  }

  setRole(role: string | null): void {
    this.requireStore().role = role;
  }

  setSessionId(sessionId: string | null): void {
    this.requireStore().session_id = sessionId;
  }

  setTraceContext(traceContext: {
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string | null;
  }): void {
    const store = this.requireStore();

    if (traceContext.trace_id !== undefined) {
      store.trace_id = traceContext.trace_id;
    }

    if (traceContext.span_id !== undefined) {
      store.span_id = traceContext.span_id;
    }

    if (traceContext.parent_span_id !== undefined) {
      store.parent_span_id = traceContext.parent_span_id;
    }
  }

  setPermissions(permissions: string[]): void {
    this.requireStore().permissions = permissions;
  }

  setAuthenticated(isAuthenticated: boolean): void {
    this.requireStore().is_authenticated = isAuthenticated;
  }

  setRequestMetadata(metadata: {
    client_ip?: string | null;
    user_agent?: string | null;
    method?: string;
    path?: string;
    started_at?: string;
  }): void {
    const store = this.requireStore();

    if (metadata.client_ip !== undefined) {
      store.client_ip = metadata.client_ip;
    }

    if (metadata.user_agent !== undefined) {
      store.user_agent = metadata.user_agent;
    }

    if (metadata.method !== undefined) {
      store.method = metadata.method;
    }

    if (metadata.path !== undefined) {
      store.path = metadata.path;
    }

    if (metadata.started_at !== undefined) {
      store.started_at = metadata.started_at;
    }
  }

  setBillingAccess(billing: BillingAccessContextState | undefined): void {
    this.requireStore().billing = billing;
  }

  setDatabaseClient(dbClient: RequestContextState['db_client']): void {
    this.requireStore().db_client = dbClient;
  }

  snapshot(): RequestContextState | undefined {
    const store = this.getStore();

    if (!store) {
      return undefined;
    }

    return { ...store };
  }
}
