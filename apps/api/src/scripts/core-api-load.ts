import { performance } from 'node:perf_hooks';

export type CoreApiLoadMethod = 'GET';
export type CoreApiLoadAuthMode = 'none' | 'tenant';

export interface CoreApiLoadWorkload {
  id: string;
  method: CoreApiLoadMethod;
  path: string;
  auth: CoreApiLoadAuthMode;
  weight: number;
  targetP95Ms: number;
  description: string;
}

export interface CoreApiLoadEndpoint extends CoreApiLoadWorkload {
  url: string;
  headers: Record<string, string>;
}

export interface CoreApiLoadPlan {
  baseUrl: string;
  endpoints: CoreApiLoadEndpoint[];
}

export interface CoreApiLoadPlanOptions {
  baseUrl: string;
  tenantId?: string;
  monitorToken?: string;
  accessToken?: string;
  allowRemote?: boolean;
}

export interface CoreApiFetchResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type CoreApiFetch = (
  url: string,
  init: {
    method: CoreApiLoadMethod;
    headers: Record<string, string>;
  },
) => Promise<CoreApiFetchResponse>;

export interface CoreApiLoadRequestResult {
  workloadId: string;
  method: CoreApiLoadMethod;
  path: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface CoreApiLoadProbeResult {
  summary: {
    totalRequests: number;
    failedRequests: number;
    p95Ms: number;
    maxMs: number;
  };
  results: CoreApiLoadRequestResult[];
}

export interface RunCoreApiLoadProbeOptions extends CoreApiLoadPlanOptions {
  iterations?: number;
  fetchImpl?: CoreApiFetch;
}

export const CORE_API_LOAD_WORKLOADS: readonly CoreApiLoadWorkload[] = [
  {
    id: 'health-ready',
    method: 'GET',
    path: '/health/ready',
    auth: 'none',
    weight: 1,
    targetP95Ms: 500,
    description: 'Readiness endpoint used by runtime probes.',
  },
  {
    id: 'support-public-status',
    method: 'GET',
    path: '/support/public/system-status',
    auth: 'none',
    weight: 1,
    targetP95Ms: 750,
    description: 'Public incident and platform status summary.',
  },
  {
    id: 'students-directory',
    method: 'GET',
    path: '/students',
    auth: 'tenant',
    weight: 2,
    targetP95Ms: 900,
    description: 'Tenant-scoped student directory read path.',
  },
  {
    id: 'academics-teacher-assignments',
    method: 'GET',
    path: '/academics/teacher-assignments',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 900,
    description: 'Academic teacher assignment read path.',
  },
  {
    id: 'exams-report-cards',
    method: 'GET',
    path: '/exams/report-cards',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 900,
    description: 'Published exam report-card read path.',
  },
  {
    id: 'admissions-summary',
    method: 'GET',
    path: '/admissions/summary',
    auth: 'tenant',
    weight: 2,
    targetP95Ms: 900,
    description: 'Admissions dashboard summary read path.',
  },
  {
    id: 'admissions-report-export',
    method: 'GET',
    path: '/admissions/reports/applications/export',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1500,
    description: 'Server-side admissions CSV artifact export.',
  },
  {
    id: 'inventory-summary',
    method: 'GET',
    path: '/inventory/summary',
    auth: 'tenant',
    weight: 2,
    targetP95Ms: 900,
    description: 'Inventory dashboard summary read path.',
  },
  {
    id: 'inventory-reports',
    method: 'GET',
    path: '/inventory/reports',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1000,
    description: 'Inventory report catalog read path.',
  },
  {
    id: 'inventory-report-export',
    method: 'GET',
    path: '/inventory/reports/stock-valuation/export',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1500,
    description: 'Server-side inventory CSV artifact export.',
  },
  {
    id: 'billing-usage-summary',
    method: 'GET',
    path: '/billing/usage/summary',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1000,
    description: 'Billing usage summary read path.',
  },
  {
    id: 'billing-invoices',
    method: 'GET',
    path: '/billing/invoices',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1000,
    description: 'Billing invoice list read path.',
  },
  {
    id: 'billing-invoice-report-export',
    method: 'GET',
    path: '/billing/reports/invoices/export',
    auth: 'tenant',
    weight: 1,
    targetP95Ms: 1500,
    description: 'Server-side billing invoice CSV artifact export.',
  },
];

const RETIRED_WORKLOAD_PATTERN = /attendance/i;

export function validateCoreApiLoadWorkloads(
  workloads: readonly CoreApiLoadWorkload[] = CORE_API_LOAD_WORKLOADS,
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const workload of workloads) {
    if (seenIds.has(workload.id)) {
      errors.push(`Workload ${workload.id} is duplicated.`);
    }
    seenIds.add(workload.id);

    if (workload.method !== 'GET') {
      errors.push(`Workload ${workload.id} uses mutating method ${workload.method}.`);
    }

    if (RETIRED_WORKLOAD_PATTERN.test(`${workload.id} ${workload.path} ${workload.description}`)) {
      errors.push(`Workload ${workload.id} references retired attendance functionality.`);
    }

    if (workload.weight <= 0) {
      errors.push(`Workload ${workload.id} must have a positive weight.`);
    }

    if (workload.targetP95Ms <= 0) {
      errors.push(`Workload ${workload.id} must have a positive target P95.`);
    }
  }

  return errors;
}

export function buildCoreApiLoadPlan(options: CoreApiLoadPlanOptions): CoreApiLoadPlan {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const parsedBaseUrl = new URL(baseUrl);

  if (!options.allowRemote && !isLoopbackHost(parsedBaseUrl.hostname)) {
    throw new Error('Core API load probe refuses remote targets unless allowRemote is true.');
  }

  const validationErrors = validateCoreApiLoadWorkloads(CORE_API_LOAD_WORKLOADS);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid core API load workloads: ${validationErrors.join('; ')}`);
  }

  const endpoints = CORE_API_LOAD_WORKLOADS.map((workload) => {
    const headers: Record<string, string> = {
      accept: workload.path.endsWith('/export') ? 'text/csv' : 'application/json',
      'user-agent': 'shule-hub-core-api-load-probe',
    };

    if (workload.auth === 'tenant') {
      const bearerToken = options.monitorToken ?? options.accessToken;

      if (!options.tenantId || !bearerToken) {
        throw new Error(`Workload ${workload.id} requires tenantId and monitorToken or accessToken.`);
      }

      headers.authorization = `Bearer ${bearerToken}`;
      headers['x-tenant-id'] = options.tenantId;
    }

    return {
      ...workload,
      url: joinUrl(baseUrl, workload.path),
      headers,
    };
  });

  return {
    baseUrl,
    endpoints,
  };
}

export async function runCoreApiLoadProbe(
  options: RunCoreApiLoadProbeOptions,
): Promise<CoreApiLoadProbeResult> {
  const iterations = normalizeIterations(options.iterations ?? 1);
  const fetchImpl = options.fetchImpl ?? getDefaultFetch();
  const plan = buildCoreApiLoadPlan(options);
  const results: CoreApiLoadRequestResult[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const endpoint of plan.endpoints) {
      const startedAt = performance.now();

      try {
        const response = await fetchImpl(endpoint.url, {
          method: endpoint.method,
          headers: endpoint.headers,
        });
        const durationMs = roundMs(performance.now() - startedAt);
        const error = response.ok ? undefined : await safeReadResponseBody(response);

        results.push({
          workloadId: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          status: response.status,
          ok: response.ok,
          durationMs,
          ...(error ? { error } : {}),
        });
      } catch (error) {
        const durationMs = roundMs(performance.now() - startedAt);

        results.push({
          workloadId: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          status: null,
          ok: false,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    summary: summarizeResults(results),
    results,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error('Core API load probe requires a baseUrl.');
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Core API load probe requires an HTTP(S) baseUrl, received ${parsed.protocol}.`);
  }

  return trimmed.replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '::1'
    || hostname === '[::1]'
    || hostname.startsWith('127.')
  );
}

function normalizeIterations(iterations: number): number {
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error('Core API load probe iterations must be a positive number.');
  }

  return Math.floor(iterations);
}

function getDefaultFetch(): CoreApiFetch {
  const fetchImpl = (globalThis as {
    fetch?: (
      url: string,
      init: { method: CoreApiLoadMethod; headers: Record<string, string> },
    ) => Promise<CoreApiFetchResponse>;
  }).fetch;

  if (!fetchImpl) {
    throw new Error('Global fetch is unavailable; run on Node 18+ or provide fetchImpl.');
  }

  return fetchImpl;
}

async function safeReadResponseBody(response: CoreApiFetchResponse): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 500);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function summarizeResults(results: readonly CoreApiLoadRequestResult[]): CoreApiLoadProbeResult['summary'] {
  const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
  const failedRequests = results.filter((result) => !result.ok).length;

  return {
    totalRequests: results.length,
    failedRequests,
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
  };
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index];
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseEnvInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

async function main(): Promise<void> {
  const baseUrl = process.env.CORE_API_LOAD_BASE_URL;

  if (!baseUrl) {
    process.stderr.write('Set CORE_API_LOAD_BASE_URL before running the core API load probe.\n');
    process.exitCode = 1;
    return;
  }

  const result = await runCoreApiLoadProbe({
    baseUrl,
    tenantId: process.env.CORE_API_LOAD_TENANT_ID,
    monitorToken: process.env.CORE_API_LOAD_MONITOR_TOKEN,
    accessToken: process.env.CORE_API_LOAD_ACCESS_TOKEN,
    allowRemote: parseEnvBoolean(process.env.CORE_API_LOAD_ALLOW_REMOTE),
    iterations: parseEnvInteger(process.env.CORE_API_LOAD_ITERATIONS, 1),
  });

  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);

  if (result.summary.failedRequests > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
