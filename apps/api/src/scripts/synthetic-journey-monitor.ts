import { performance } from 'node:perf_hooks';

export type SyntheticJourneyTarget = 'api' | 'web';
export type SyntheticJourneyMethod = 'GET';
export type SyntheticJourneyAuthMode = 'none' | 'tenant';

export interface SyntheticJourneyStep {
  id: string;
  target: SyntheticJourneyTarget;
  method: SyntheticJourneyMethod;
  path: string;
  auth: SyntheticJourneyAuthMode;
  targetP95Ms: number;
  description: string;
}

export interface SyntheticJourney {
  id: string;
  description: string;
  steps: SyntheticJourneyStep[];
}

export interface SyntheticJourneyEndpoint extends SyntheticJourneyStep {
  url: string;
  headers: Record<string, string>;
}

export interface SyntheticJourneyPlan {
  journeys: Array<{
    id: string;
    description: string;
    steps: SyntheticJourneyEndpoint[];
  }>;
}

export interface SyntheticJourneyPlanOptions {
  apiBaseUrl: string;
  webBaseUrl: string;
  tenantId?: string;
  monitorToken?: string;
  accessToken?: string;
  allowRemote?: boolean;
  journeys?: readonly SyntheticJourney[];
}

export interface SyntheticJourneyFetchResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type SyntheticJourneyFetch = (
  url: string,
  init: {
    method: SyntheticJourneyMethod;
    headers: Record<string, string>;
  },
) => Promise<SyntheticJourneyFetchResponse>;

export interface SyntheticJourneyStepResult {
  id: string;
  target: SyntheticJourneyTarget;
  method: SyntheticJourneyMethod;
  path: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface SyntheticJourneyRunResult {
  id: string;
  description: string;
  ok: boolean;
  steps: SyntheticJourneyStepResult[];
}

export interface SyntheticJourneyMonitorResult {
  summary: {
    totalJourneys: number;
    failedJourneys: number;
    totalSteps: number;
    failedSteps: number;
    p95Ms: number;
    maxMs: number;
  };
  journeys: SyntheticJourneyRunResult[];
}

export interface RunSyntheticJourneyMonitorOptions extends SyntheticJourneyPlanOptions {
  fetchImpl?: SyntheticJourneyFetch;
}

export const SYNTHETIC_JOURNEYS: readonly SyntheticJourney[] = [
  {
    id: 'public-readiness',
    description: 'Public readiness and incident status are available without tenant auth.',
    steps: [
      {
        id: 'health-ready',
        target: 'api',
        method: 'GET',
        path: '/health/ready',
        auth: 'none',
        targetP95Ms: 500,
        description: 'Backend readiness probe.',
      },
      {
        id: 'support-public-status',
        target: 'api',
        method: 'GET',
        path: '/support/public/system-status',
        auth: 'none',
        targetP95Ms: 750,
        description: 'Public platform status endpoint.',
      },
    ],
  },
  {
    id: 'public-status-page',
    description: 'Public status web page renders current incidents, history, and subscription entry.',
    steps: [
      {
        id: 'support-status-page',
        target: 'web',
        method: 'GET',
        path: '/support/status',
        auth: 'none',
        targetP95Ms: 1200,
        description: 'Public status web route.',
      },
    ],
  },
  {
    id: 'tenant-core-operations',
    description: 'Tenant-scoped core school operations can load read paths.',
    steps: [
      {
        id: 'students-directory',
        target: 'api',
        method: 'GET',
        path: '/students',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Student directory read path.',
      },
      {
        id: 'academics-teacher-assignments',
        target: 'api',
        method: 'GET',
        path: '/academics/teacher-assignments',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Academic teacher assignment read path.',
      },
      {
        id: 'exams-report-cards',
        target: 'api',
        method: 'GET',
        path: '/exams/report-cards',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Exam report-card read path.',
      },
      {
        id: 'admissions-summary',
        target: 'api',
        method: 'GET',
        path: '/admissions/summary',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Admissions summary read path.',
      },
      {
        id: 'inventory-summary',
        target: 'api',
        method: 'GET',
        path: '/inventory/summary',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Inventory summary read path.',
      },
      {
        id: 'billing-usage-summary',
        target: 'api',
        method: 'GET',
        path: '/billing/usage/summary',
        auth: 'tenant',
        targetP95Ms: 1000,
        description: 'Billing usage read path.',
      },
      {
        id: 'discipline-incidents',
        target: 'api',
        method: 'GET',
        path: '/discipline/incidents',
        auth: 'tenant',
        targetP95Ms: 900,
        description: 'Discipline incident queue read path.',
      },
      {
        id: 'counselling-dashboard',
        target: 'api',
        method: 'GET',
        path: '/counselling/dashboard',
        auth: 'tenant',
        targetP95Ms: 1000,
        description: 'Counselling dashboard read path.',
      },
    ],
  },
  {
    id: 'report-artifacts',
    description: 'Server-side report artifacts are reachable for implemented modules.',
    steps: [
      {
        id: 'admissions-report-export',
        target: 'api',
        method: 'GET',
        path: '/admissions/reports/applications/export',
        auth: 'tenant',
        targetP95Ms: 1500,
        description: 'Admissions CSV artifact export.',
      },
      {
        id: 'inventory-report-export',
        target: 'api',
        method: 'GET',
        path: '/inventory/reports/stock-valuation/export',
        auth: 'tenant',
        targetP95Ms: 1500,
        description: 'Inventory CSV artifact export.',
      },
      {
        id: 'billing-invoice-report-export',
        target: 'api',
        method: 'GET',
        path: '/billing/reports/invoices/export',
        auth: 'tenant',
        targetP95Ms: 1500,
        description: 'Billing CSV artifact export.',
      },
    ],
  },
  {
    id: 'exams-workspace',
    description: 'The active exams workspace route remains available on the web app.',
    steps: [
      {
        id: 'teacher-exams-route',
        target: 'web',
        method: 'GET',
        path: '/school/teacher/exams',
        auth: 'none',
        targetP95Ms: 1200,
        description: 'Implemented exams workspace route.',
      },
    ],
  },
  {
    id: 'discipline-workspace',
    description: 'The active discipline workspace route remains available on the web app.',
    steps: [
      {
        id: 'principal-discipline-route',
        target: 'web',
        method: 'GET',
        path: '/school/principal/discipline',
        auth: 'none',
        targetP95Ms: 1200,
        description: 'Implemented discipline workspace route.',
      },
      {
        id: 'parent-discipline-route',
        target: 'web',
        method: 'GET',
        path: '/portal/parent/discipline',
        auth: 'none',
        targetP95Ms: 1200,
        description: 'Implemented parent discipline portal route.',
      },
    ],
  },
];

const RETIRED_SYNTHETIC_PATTERN = /attendance/i;

export function validateSyntheticJourneys(
  journeys: readonly SyntheticJourney[] = SYNTHETIC_JOURNEYS,
): string[] {
  const errors: string[] = [];
  const seenJourneyIds = new Set<string>();

  for (const journey of journeys) {
    if (seenJourneyIds.has(journey.id)) {
      errors.push(`Synthetic journey ${journey.id} is duplicated.`);
    }
    seenJourneyIds.add(journey.id);

    if (journey.steps.length === 0) {
      errors.push(`Synthetic journey ${journey.id} must include at least one step.`);
    }

    const seenStepIds = new Set<string>();

    for (const step of journey.steps) {
      if (seenStepIds.has(step.id)) {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} is duplicated.`);
      }
      seenStepIds.add(step.id);

      if (step.method !== 'GET') {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} uses mutating method ${step.method}.`);
      }

      if (step.target !== 'api' && step.target !== 'web') {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} has invalid target ${step.target}.`);
      }

      if (!step.path.startsWith('/')) {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} path must start with "/".`);
      }

      if (step.targetP95Ms <= 0) {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} must have a positive target P95.`);
      }

      if (
        RETIRED_SYNTHETIC_PATTERN.test(journey.id)
        || RETIRED_SYNTHETIC_PATTERN.test(journey.description)
        || RETIRED_SYNTHETIC_PATTERN.test(step.id)
        || RETIRED_SYNTHETIC_PATTERN.test(step.path)
        || RETIRED_SYNTHETIC_PATTERN.test(step.description)
      ) {
        errors.push(`Synthetic journey ${journey.id} step ${step.id} references retired attendance functionality.`);
      }
    }
  }

  return errors;
}

export function buildSyntheticJourneyPlan(
  options: SyntheticJourneyPlanOptions,
): SyntheticJourneyPlan {
  const journeys = options.journeys ?? SYNTHETIC_JOURNEYS;
  const validationErrors = validateSyntheticJourneys(journeys);

  if (validationErrors.length > 0) {
    throw new Error(`Invalid synthetic journeys: ${validationErrors.join('; ')}`);
  }

  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl, 'API');
  const webBaseUrl = normalizeBaseUrl(options.webBaseUrl, 'Web');

  if (!options.allowRemote) {
    for (const baseUrl of [apiBaseUrl, webBaseUrl]) {
      const parsedBaseUrl = new URL(baseUrl);
      if (!isLoopbackHost(parsedBaseUrl.hostname)) {
        throw new Error('Synthetic journey monitor refuses remote targets unless allowRemote is true.');
      }
    }
  }

  return {
    journeys: journeys.map((journey) => ({
      id: journey.id,
      description: journey.description,
      steps: journey.steps.map((step) => ({
        ...step,
        url: joinUrl(step.target === 'api' ? apiBaseUrl : webBaseUrl, step.path),
        headers: buildHeaders(step, options),
      })),
    })),
  };
}

export async function runSyntheticJourneyMonitor(
  options: RunSyntheticJourneyMonitorOptions,
): Promise<SyntheticJourneyMonitorResult> {
  const plan = buildSyntheticJourneyPlan(options);
  const fetchImpl = options.fetchImpl ?? getDefaultFetch();
  const journeys: SyntheticJourneyRunResult[] = [];

  for (const journey of plan.journeys) {
    const stepResults: SyntheticJourneyStepResult[] = [];

    for (const step of journey.steps) {
      stepResults.push(await runSyntheticStep(step, fetchImpl));
    }

    journeys.push({
      id: journey.id,
      description: journey.description,
      ok: stepResults.every((step) => step.ok),
      steps: stepResults,
    });
  }

  return {
    summary: summarizeJourneys(journeys),
    journeys,
  };
}

async function runSyntheticStep(
  step: SyntheticJourneyEndpoint,
  fetchImpl: SyntheticJourneyFetch,
): Promise<SyntheticJourneyStepResult> {
  const startedAt = performance.now();

  try {
    const response = await fetchImpl(step.url, {
      method: step.method,
      headers: step.headers,
    });
    const durationMs = roundMs(performance.now() - startedAt);
    const error = response.ok ? undefined : await safeReadResponseBody(response);

    return {
      id: step.id,
      target: step.target,
      method: step.method,
      path: step.path,
      status: response.status,
      ok: response.ok,
      durationMs,
      ...(error ? { error } : {}),
    };
  } catch (error) {
    return {
      id: step.id,
      target: step.target,
      method: step.method,
      path: step.path,
      status: null,
      ok: false,
      durationMs: roundMs(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildHeaders(
  step: SyntheticJourneyStep,
  options: SyntheticJourneyPlanOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: resolveAcceptHeader(step),
    'user-agent': 'shule-hub-synthetic-journey-monitor',
  };

  if (step.auth === 'tenant') {
    const bearerToken = options.monitorToken ?? options.accessToken;

    if (!options.tenantId || !bearerToken) {
      throw new Error(`Synthetic journey step ${step.id} requires tenantId and monitorToken or accessToken.`);
    }

    headers.authorization = `Bearer ${bearerToken}`;
    headers['x-tenant-id'] = options.tenantId;
  }

  return headers;
}

function resolveAcceptHeader(step: SyntheticJourneyStep): string {
  if (step.target === 'web') {
    return 'text/html,application/xhtml+xml';
  }

  return step.path.endsWith('/export') ? 'text/csv' : 'application/json';
}

function summarizeJourneys(
  journeys: readonly SyntheticJourneyRunResult[],
): SyntheticJourneyMonitorResult['summary'] {
  const steps = journeys.flatMap((journey) => journey.steps);
  const durations = steps.map((step) => step.durationMs).sort((left, right) => left - right);

  return {
    totalJourneys: journeys.length,
    failedJourneys: journeys.filter((journey) => !journey.ok).length,
    totalSteps: steps.length,
    failedSteps: steps.filter((step) => !step.ok).length,
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
  };
}

function normalizeBaseUrl(baseUrl: string, label: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error(`Synthetic journey monitor requires a ${label} base URL.`);
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Synthetic journey monitor requires an HTTP(S) ${label} base URL.`);
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

function getDefaultFetch(): SyntheticJourneyFetch {
  const fetchImpl = (globalThis as {
    fetch?: (
      url: string,
      init: { method: SyntheticJourneyMethod; headers: Record<string, string> },
    ) => Promise<SyntheticJourneyFetchResponse>;
  }).fetch;

  if (!fetchImpl) {
    throw new Error('Global fetch is unavailable; run on Node 18+ or provide fetchImpl.');
  }

  return fetchImpl;
}

async function safeReadResponseBody(response: SyntheticJourneyFetchResponse): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 500);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
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

function parseEnvBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

async function main(): Promise<void> {
  const apiBaseUrl = process.env.SYNTHETIC_API_BASE_URL;
  const webBaseUrl = process.env.SYNTHETIC_WEB_BASE_URL;

  if (!apiBaseUrl || !webBaseUrl) {
    process.stderr.write('Set SYNTHETIC_API_BASE_URL and SYNTHETIC_WEB_BASE_URL before running synthetic journeys.\n');
    process.exitCode = 1;
    return;
  }

  const result = await runSyntheticJourneyMonitor({
    apiBaseUrl,
    webBaseUrl,
    tenantId: process.env.SYNTHETIC_TENANT_ID,
    monitorToken: process.env.SYNTHETIC_MONITOR_TOKEN,
    accessToken: process.env.SYNTHETIC_ACCESS_TOKEN,
    allowRemote: parseEnvBoolean(process.env.SYNTHETIC_ALLOW_REMOTE),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.summary.failedSteps > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
