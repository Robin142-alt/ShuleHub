import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type SmsRelayEnvironment = Record<string, string | undefined>;

export interface SmsRelayPayload {
  to: string;
  title: string;
  message: string;
  tenant_id: string;
  ticket_id?: string | null;
  notification_id: string;
  metadata?: Record<string, unknown>;
}

export interface RelayFetchResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
}

export type RelayFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<RelayFetchResponse>;

export interface SmsRelayOptions {
  env?: SmsRelayEnvironment;
  fetchImpl?: RelayFetch;
  logger?: Pick<Console, 'error' | 'log' | 'warn'>;
}

interface SmsProviderReadiness {
  provider: string;
  dryRun: boolean;
  providerConfigured: boolean;
  relayAuthConfigured: boolean;
  providerReady: boolean;
  reason?: 'dry_run_enabled' | 'provider_configuration_incomplete' | 'relay_auth_missing' | 'unsupported_provider';
}

const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,24}$/;
const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 10_000;

export function createSmsRelayServer(options: SmsRelayOptions = {}): Server {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? defaultRelayFetch;
  const logger = options.logger ?? console;

  return createServer((request, response) => {
    void handleRequest({ request, response, env, fetchImpl, logger });
  });
}

export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const suffix = digits.slice(-4) || 'unknown';
  return `***${suffix}`;
}

async function handleRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  env: SmsRelayEnvironment;
  fetchImpl: RelayFetch;
  logger: Pick<Console, 'error' | 'log' | 'warn'>;
}): Promise<void> {
  const { request, response, env, fetchImpl, logger } = input;
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (method === 'GET' && url.pathname === '/health') {
    const readiness = getSmsProviderReadiness(env);

    writeJson(response, 200, {
      status: 'ok',
      provider: readiness.provider,
      dry_run: readiness.dryRun,
      provider_configured: readiness.providerConfigured,
      relay_auth_configured: readiness.relayAuthConfigured,
      provider_ready: readiness.providerReady,
      reason: readiness.reason,
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/ready') {
    const readiness = getSmsProviderReadiness(env);

    writeJson(response, readiness.providerReady ? 200 : 503, {
      status: readiness.providerReady ? 'ok' : 'degraded',
      provider: readiness.provider,
      dry_run: readiness.dryRun,
      provider_configured: readiness.providerConfigured,
      relay_auth_configured: readiness.relayAuthConfigured,
      provider_ready: readiness.providerReady,
      reason: readiness.reason,
    });
    return;
  }

  if (method !== 'POST' || url.pathname !== '/send') {
    writeJson(response, 404, { error: 'Not found' });
    return;
  }

  if (!isAuthorized(request, env)) {
    writeJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  let payload: SmsRelayPayload;

  try {
    payload = validatePayload(JSON.parse(await readBody(request)));
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body' });
    return;
  }

  if (parseBoolean(getEnv(env, 'SMS_DRY_RUN'), false)) {
    logger.log(`SMS dry run accepted for ${redactPhone(payload.to)} notification=${payload.notification_id}`);
    writeJson(response, 202, { status: 'queued', dry_run: true });
    return;
  }

  try {
    const providerResponse = await sendProviderSms(payload, env, fetchImpl);

    if (!providerResponse.ok) {
      const errorBody = await safeProviderBody(providerResponse);
      logger.warn(`SMS provider rejected ${redactPhone(payload.to)} status=${providerResponse.status} body=${errorBody}`);
      writeJson(response, 502, { error: `SMS provider returned ${providerResponse.status}` });
      return;
    }

    logger.log(`SMS sent to ${redactPhone(payload.to)} notification=${payload.notification_id}`);
    writeJson(response, 202, { status: 'queued' });
  } catch (error) {
    logger.error(`SMS relay failed for ${redactPhone(payload.to)}: ${sanitizeLogMessage(error)}`);
    writeJson(response, 503, { error: 'SMS relay failed' });
  }
}

async function sendProviderSms(
  payload: SmsRelayPayload,
  env: SmsRelayEnvironment,
  fetchImpl: RelayFetch,
): Promise<RelayFetchResponse> {
  const provider = (getEnv(env, 'SMS_PROVIDER') || 'africastalking').toLowerCase();

  if (provider !== 'africastalking') {
    throw new Error('Unsupported SMS provider');
  }

  const providerUrl = requireEnv(env, 'SMS_PROVIDER_API_URL');
  const apiKey = requireEnv(env, 'SMS_PROVIDER_API_KEY');
  const username = requireEnv(env, 'SMS_PROVIDER_USERNAME');
  const senderId = getEnv(env, 'SMS_PROVIDER_SENDER_ID');
  const body = new URLSearchParams({
    username,
    to: payload.to,
    message: formatSmsMessage(payload),
  });

  if (senderId) {
    body.set('from', senderId);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetchImpl(providerUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey,
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function formatSmsMessage(payload: SmsRelayPayload): string {
  const parts = [payload.title.trim(), payload.message.trim()];

  if (payload.ticket_id) {
    parts.push(`Ticket: ${payload.ticket_id}`);
  }

  return parts.filter(Boolean).join('\n').slice(0, 480);
}

function validatePayload(value: unknown): SmsRelayPayload {
  if (!isRecord(value)) {
    throw new Error('Invalid request body');
  }

  const payload = {
    to: readRequiredString(value, 'to'),
    title: readRequiredString(value, 'title'),
    message: readRequiredString(value, 'message'),
    tenant_id: readRequiredString(value, 'tenant_id'),
    ticket_id: typeof value.ticket_id === 'string' ? value.ticket_id.trim() : null,
    notification_id: readRequiredString(value, 'notification_id'),
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };

  if (!PHONE_PATTERN.test(payload.to)) {
    throw new Error('Invalid recipient phone number');
  }

  return payload;
}

function isAuthorized(request: IncomingMessage, env: SmsRelayEnvironment): boolean {
  const expectedToken = getEnv(env, 'SMS_RELAY_AUTH_TOKEN');

  if (!expectedToken) {
    return false;
  }

  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  return value === `Bearer ${expectedToken}`;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function getSmsProviderReadiness(env: SmsRelayEnvironment): SmsProviderReadiness {
  const provider = (getEnv(env, 'SMS_PROVIDER') || 'africastalking').toLowerCase();
  const dryRun = parseBoolean(getEnv(env, 'SMS_DRY_RUN'), false);
  const providerConfigured = Boolean(
    getEnv(env, 'SMS_PROVIDER_API_URL')
      && getEnv(env, 'SMS_PROVIDER_API_KEY')
      && getEnv(env, 'SMS_PROVIDER_USERNAME'),
  );
  const relayAuthConfigured = Boolean(getEnv(env, 'SMS_RELAY_AUTH_TOKEN'));

  if (provider !== 'africastalking') {
    return {
      provider,
      dryRun,
      providerConfigured,
      relayAuthConfigured,
      providerReady: false,
      reason: 'unsupported_provider',
    };
  }

  if (dryRun) {
    return {
      provider,
      dryRun,
      providerConfigured,
      relayAuthConfigured,
      providerReady: false,
      reason: 'dry_run_enabled',
    };
  }

  if (!relayAuthConfigured) {
    return {
      provider,
      dryRun,
      providerConfigured,
      relayAuthConfigured,
      providerReady: false,
      reason: 'relay_auth_missing',
    };
  }

  if (!providerConfigured) {
    return {
      provider,
      dryRun,
      providerConfigured,
      relayAuthConfigured,
      providerReady: false,
      reason: 'provider_configuration_incomplete',
    };
  }

  return {
    provider,
    dryRun,
    providerConfigured,
    relayAuthConfigured,
    providerReady: true,
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function writeJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function requireEnv(env: SmsRelayEnvironment, key: string): string {
  const value = getEnv(env, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function getEnv(env: SmsRelayEnvironment, key: string): string {
  return env[key]?.trim() ?? '';
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeProviderBody(response: RelayFetchResponse): Promise<string> {
  try {
    return response.text ? (await response.text()).slice(0, 200) : '';
  } catch {
    return '';
  }
}

function sanitizeLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/apiKey=\S+/gi, 'apiKey=[redacted]');
}

const defaultRelayFetch: RelayFetch = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });

  return {
    ok: response.ok,
    status: response.status,
    text: async () => response.text(),
  };
};

export function startSmsRelayServer(env: SmsRelayEnvironment = process.env): Server {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  const server = createSmsRelayServer({ env });
  server.listen(port, () => {
    console.log(`SMS relay listening on ${port}`);
  });
  return server;
}

if (require.main === module) {
  startSmsRelayServer();
}
