export type ProviderCredentialEnvironment = Record<string, string | undefined>;

export type ProviderCredentialSmokeStatus = 'pass' | 'fail' | 'skip';

export interface ProviderCredentialSmokeCheck {
  id: string;
  status: ProviderCredentialSmokeStatus;
  message: string;
  details: string[];
  metadata: Record<string, string | number | boolean>;
}

export interface ProviderCredentialSmokeResult {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  checks: ProviderCredentialSmokeCheck[];
}

export interface ValidateProviderCredentialEnvironmentOptions {
  requireSms?: boolean;
  requireUploadMalwareScan?: boolean;
  requireObjectStorage?: boolean;
}

export interface RunProviderCredentialSmokeOptions
  extends ValidateProviderCredentialEnvironmentOptions {
  env?: ProviderCredentialEnvironment;
  live?: boolean;
  fetchImpl?: ProviderCredentialSmokeFetch;
}

export interface ProviderCredentialSmokeFetchResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
}

export type ProviderCredentialSmokeFetch = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
  },
) => Promise<ProviderCredentialSmokeFetchResponse>;

interface ValidationSections {
  retiredAttendance: string[];
  transactionalEmail: string[];
  supportEmail: string[];
  supportSms: string[];
  retryWorker: string[];
  uploadMalwareScan: string[];
  uploadObjectStorage: string[];
}

const RETIRED_ATTENDANCE_PATTERN = /attendance/i;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,24}$/;

const RELEVANT_RETIREMENT_FIELDS = [
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'PUBLIC_APP_URL',
  'WEB_APP_URL',
  'SUPPORT_NOTIFICATION_EMAILS',
  'SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL',
  'SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL',
  'SUPPORT_NOTIFICATION_SMS_RECIPIENTS',
  'EMAIL_PROVIDER_SMOKE_URL',
  'UPLOAD_MALWARE_SCAN_PROVIDER',
  'UPLOAD_MALWARE_SCAN_API_URL',
  'UPLOAD_MALWARE_SCAN_HEALTH_URL',
  'UPLOAD_OBJECT_STORAGE_ENABLED',
  'UPLOAD_OBJECT_STORAGE_PROVIDER',
  'UPLOAD_OBJECT_STORAGE_ENDPOINT',
  'UPLOAD_OBJECT_STORAGE_BUCKET',
  'UPLOAD_OBJECT_STORAGE_REGION',
];

export function validateProviderCredentialEnvironment(
  env: ProviderCredentialEnvironment,
  options: ValidateProviderCredentialEnvironmentOptions = {},
): string[] {
  const sections = collectValidationSections(env, options);

  return [
    ...sections.retiredAttendance,
    ...sections.transactionalEmail,
    ...sections.supportEmail,
    ...sections.supportSms,
    ...sections.retryWorker,
    ...sections.uploadMalwareScan,
    ...sections.uploadObjectStorage,
  ];
}

export async function runProviderCredentialSmoke(
  options: RunProviderCredentialSmokeOptions = {},
): Promise<ProviderCredentialSmokeResult> {
  const env = options.env ?? process.env;
  const requireSms = options.requireSms ?? parseBoolean(env.SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS, false);
  const requireUploadMalwareScan = options.requireUploadMalwareScan
    ?? parseBoolean(env.UPLOAD_MALWARE_SCAN_REQUIRED, false);
  const requireObjectStorage = options.requireObjectStorage
    ?? parseBoolean(env.UPLOAD_OBJECT_STORAGE_ENABLED, false);
  const live = options.live ?? parseBoolean(env.SUPPORT_PROVIDER_SMOKE_LIVE, false);
  const sections = collectValidationSections(env, { requireSms, requireUploadMalwareScan, requireObjectStorage });
  const supportEmails = parseCsv(env.SUPPORT_NOTIFICATION_EMAILS);
  const supportSmsRecipients = parseCsv(env.SUPPORT_NOTIFICATION_SMS_RECIPIENTS);
  const checks: ProviderCredentialSmokeCheck[] = [
    buildCheck(
      'retired-attendance-guard',
      sections.retiredAttendance,
      'Provider smoke configuration excludes retired attendance notification targets.',
      {
        scanned_fields: RELEVANT_RETIREMENT_FIELDS.length,
      },
    ),
    buildCheck(
      'transactional-email',
      sections.transactionalEmail,
      'Transactional email credentials are present for provider smoke checks.',
      {
        provider: getValue(env, 'EMAIL_PROVIDER') || 'resend',
        api_key_configured: getValue(env, 'RESEND_API_KEY').length > 0,
        sender_configured: getValue(env, 'EMAIL_FROM').length > 0,
        public_app_url_configured: getPublicAppUrl(env).length > 0,
      },
    ),
    buildCheck(
      'support-email',
      sections.supportEmail,
      'Support email notification recipients are configured for smoke checks.',
      {
        recipient_count: supportEmails.length,
      },
    ),
    buildCheck(
      'support-sms',
      sections.supportSms,
      sections.supportSms.length === 0 && !requireSms && !isAnySmsConfigPresent(env)
        ? 'Support SMS smoke checks are optional and no partial SMS configuration was found.'
        : 'Support SMS notification settings are complete for smoke checks.',
      {
        required: requireSms,
        webhook_url_configured: getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL').length > 0,
        webhook_token_configured: getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN').length > 0,
        recipient_count: supportSmsRecipients.length,
      },
      sections.supportSms.length === 0 && !requireSms && !isAnySmsConfigPresent(env) ? 'skip' : 'pass',
    ),
    buildCheck(
      'support-notification-retry',
      sections.retryWorker,
      'Support notification retry worker settings are in a safe range for provider smoke checks.',
      {
        worker_enabled: parseBoolean(env.SUPPORT_NOTIFICATION_RETRY_WORKER_ENABLED, true),
        max_attempts: parsePositiveInteger(env.SUPPORT_NOTIFICATION_MAX_ATTEMPTS, 3),
        interval_ms: parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_INTERVAL_MS, 60000),
        batch_size: parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_BATCH_SIZE, 50),
        lease_ms: parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_LEASE_MS, 300000),
      },
    ),
    buildCheck(
      'upload-malware-scan',
      sections.uploadMalwareScan,
      sections.uploadMalwareScan.length === 0 && !requireUploadMalwareScan && !isAnyUploadMalwareScanConfigPresent(env)
        ? 'Upload malware scan provider smoke checks are optional and no partial configuration was found.'
        : 'Upload malware scan provider settings are complete for smoke checks.',
      {
        required: requireUploadMalwareScan,
        provider: getValue(env, 'UPLOAD_MALWARE_SCAN_PROVIDER') || 'none',
        api_url_configured: getValue(env, 'UPLOAD_MALWARE_SCAN_API_URL').length > 0,
        api_token_configured: getValue(env, 'UPLOAD_MALWARE_SCAN_API_TOKEN').length > 0,
      },
      sections.uploadMalwareScan.length === 0 && !requireUploadMalwareScan && !isAnyUploadMalwareScanConfigPresent(env) ? 'skip' : 'pass',
    ),
    buildCheck(
      'upload-object-storage',
      sections.uploadObjectStorage,
      sections.uploadObjectStorage.length === 0 && !requireObjectStorage && !isAnyUploadObjectStorageConfigPresent(env)
        ? 'Upload object storage smoke checks are optional and no partial configuration was found.'
        : 'Upload object storage provider settings are complete for smoke checks.',
      {
        enabled: requireObjectStorage,
        provider: getValue(env, 'UPLOAD_OBJECT_STORAGE_PROVIDER') || 's3',
        endpoint_configured: getValue(env, 'UPLOAD_OBJECT_STORAGE_ENDPOINT').length > 0,
        bucket_configured: getValue(env, 'UPLOAD_OBJECT_STORAGE_BUCKET').length > 0,
        region_configured: getValue(env, 'UPLOAD_OBJECT_STORAGE_REGION').length > 0,
        access_key_configured: getValue(env, 'UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID').length > 0,
        secret_key_configured: getValue(env, 'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY').length > 0,
      },
      sections.uploadObjectStorage.length === 0 && !requireObjectStorage && !isAnyUploadObjectStorageConfigPresent(env) ? 'skip' : 'pass',
    ),
  ];

  if (live) {
    checks.push(
      await runLiveCredentialCheck({
        id: 'live-email-provider',
        smokeUrl: getValue(env, 'EMAIL_PROVIDER_SMOKE_URL'),
        authorizationToken: getValue(env, 'RESEND_API_KEY'),
        missingMessage: 'EMAIL_PROVIDER_SMOKE_URL is required when live provider smoke checks are enabled.',
        successMessage: 'Live transactional email provider credential probe succeeded.',
        fetchImpl: options.fetchImpl,
      }),
    );

    if (requireSms || isAnySmsConfigPresent(env)) {
      checks.push(
        await runLiveCredentialCheck({
          id: 'live-support-sms-provider',
          smokeUrl: getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL'),
          authorizationToken: getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN'),
          missingMessage: 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL is required when live support SMS smoke checks are enabled.',
          successMessage: 'Live support SMS provider credential probe succeeded.',
          fetchImpl: options.fetchImpl,
        }),
      );
    }
  }

  const summary = {
    total: checks.length,
    passed: checks.filter((check) => check.status === 'pass').length,
    failed: checks.filter((check) => check.status === 'fail').length,
    skipped: checks.filter((check) => check.status === 'skip').length,
  };

  return {
    ok: summary.failed === 0,
    summary,
    checks,
  };
}

function collectValidationSections(
  env: ProviderCredentialEnvironment,
  options: ValidateProviderCredentialEnvironmentOptions,
): ValidationSections {
  const requireSms = options.requireSms ?? false;
  const requireUploadMalwareScan = options.requireUploadMalwareScan ?? false;
  const requireObjectStorage = options.requireObjectStorage ?? false;

  return {
    retiredAttendance: validateRetiredAttendanceReferences(env),
    transactionalEmail: validateTransactionalEmail(env),
    supportEmail: validateSupportEmail(env),
    supportSms: validateSupportSms(env, requireSms),
    retryWorker: validateRetryWorker(env),
    uploadMalwareScan: validateUploadMalwareScan(env, requireUploadMalwareScan),
    uploadObjectStorage: validateUploadObjectStorage(env, requireObjectStorage),
  };
}

function validateRetiredAttendanceReferences(env: ProviderCredentialEnvironment): string[] {
  const referencesAttendance = RELEVANT_RETIREMENT_FIELDS.some((field) =>
    RETIRED_ATTENDANCE_PATTERN.test(getValue(env, field)),
  );

  return referencesAttendance
    ? ['Provider smoke configuration references retired attendance functionality.']
    : [];
}

function validateTransactionalEmail(env: ProviderCredentialEnvironment): string[] {
  const errors: string[] = [];
  const provider = getValue(env, 'EMAIL_PROVIDER') || 'resend';
  const apiKey = getValue(env, 'RESEND_API_KEY');
  const sender = getValue(env, 'EMAIL_FROM');
  const publicAppUrl = getPublicAppUrl(env);

  if (provider !== 'resend') {
    errors.push(`EMAIL_PROVIDER ${provider} is not supported by provider credential smoke checks.`);
  }

  if (!apiKey) {
    errors.push('RESEND_API_KEY is required for transactional email.');
  } else if (/\s/.test(apiKey)) {
    errors.push('RESEND_API_KEY must not contain whitespace.');
  }

  if (!sender) {
    errors.push('EMAIL_FROM is required for transactional email.');
  } else if (!isValidEmailAddress(extractSenderEmail(sender))) {
    errors.push('EMAIL_FROM must contain a valid sender email address.');
  }

  if (!publicAppUrl) {
    errors.push('PUBLIC_APP_URL or WEB_APP_URL is required for email links.');
  } else if (!isHttpsUrl(publicAppUrl)) {
    errors.push('PUBLIC_APP_URL or WEB_APP_URL must be an HTTPS URL.');
  }

  return errors;
}

function validateSupportEmail(env: ProviderCredentialEnvironment): string[] {
  const recipients = parseCsv(env.SUPPORT_NOTIFICATION_EMAILS);

  if (recipients.length === 0) {
    return ['SUPPORT_NOTIFICATION_EMAILS must contain at least one support recipient.'];
  }

  if (recipients.some((recipient) => !isValidEmailAddress(recipient))) {
    return ['SUPPORT_NOTIFICATION_EMAILS contains an invalid email address.'];
  }

  return [];
}

function validateSupportSms(
  env: ProviderCredentialEnvironment,
  requireSms: boolean,
): string[] {
  const errors: string[] = [];
  const webhookUrl = getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL');
  const webhookToken = getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN');
  const recipients = parseCsv(env.SUPPORT_NOTIFICATION_SMS_RECIPIENTS);
  const shouldValidateSms = requireSms || isAnySmsConfigPresent(env);

  if (!shouldValidateSms) {
    return [];
  }

  if (!webhookUrl) {
    errors.push('SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL is required when support SMS smoke checks are enabled.');
  } else if (!isHttpsUrl(webhookUrl)) {
    errors.push('SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL must be an HTTPS URL.');
  }

  if (!webhookToken) {
    errors.push('SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN is required when support SMS smoke checks are enabled.');
  }

  if (recipients.length === 0) {
    errors.push('SUPPORT_NOTIFICATION_SMS_RECIPIENTS must contain at least one recipient when support SMS smoke checks are enabled.');
  } else if (recipients.some((recipient) => !PHONE_PATTERN.test(recipient))) {
    errors.push('SUPPORT_NOTIFICATION_SMS_RECIPIENTS contains an invalid phone number.');
  }

  return errors;
}

function validateRetryWorker(env: ProviderCredentialEnvironment): string[] {
  const errors: string[] = [];
  const maxAttempts = parsePositiveInteger(env.SUPPORT_NOTIFICATION_MAX_ATTEMPTS, 3);
  const intervalMs = parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_INTERVAL_MS, 60000);
  const batchSize = parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_BATCH_SIZE, 50);
  const leaseMs = parsePositiveInteger(env.SUPPORT_NOTIFICATION_RETRY_LEASE_MS, 300000);

  if (maxAttempts < 1 || maxAttempts > 10) {
    errors.push('SUPPORT_NOTIFICATION_MAX_ATTEMPTS must be between 1 and 10.');
  }

  if (intervalMs < 1000 || intervalMs > 900000) {
    errors.push('SUPPORT_NOTIFICATION_RETRY_INTERVAL_MS must be between 1000 and 900000.');
  }

  if (batchSize < 1 || batchSize > 500) {
    errors.push('SUPPORT_NOTIFICATION_RETRY_BATCH_SIZE must be between 1 and 500.');
  }

  if (leaseMs < 30000 || leaseMs > 900000) {
    errors.push('SUPPORT_NOTIFICATION_RETRY_LEASE_MS must be between 30000 and 900000.');
  }

  return errors;
}

function validateUploadMalwareScan(
  env: ProviderCredentialEnvironment,
  requireUploadMalwareScan: boolean,
): string[] {
  const errors: string[] = [];
  const provider = getValue(env, 'UPLOAD_MALWARE_SCAN_PROVIDER');
  const apiUrl = getValue(env, 'UPLOAD_MALWARE_SCAN_API_URL');
  const apiToken = getValue(env, 'UPLOAD_MALWARE_SCAN_API_TOKEN');
  const shouldValidate = requireUploadMalwareScan || isAnyUploadMalwareScanConfigPresent(env);

  if (!shouldValidate) {
    return [];
  }

  if (!provider) {
    errors.push('UPLOAD_MALWARE_SCAN_PROVIDER is required when upload malware scan smoke checks are enabled.');
  } else if (!['clamav', 'webhook'].includes(provider)) {
    errors.push(`UPLOAD_MALWARE_SCAN_PROVIDER ${provider} is not supported by provider credential smoke checks.`);
  }

  if (!apiUrl) {
    errors.push('UPLOAD_MALWARE_SCAN_API_URL is required when upload malware scan smoke checks are enabled.');
  } else if (!isHttpsUrl(apiUrl)) {
    errors.push('UPLOAD_MALWARE_SCAN_API_URL must be an HTTPS URL.');
  }

  if (!apiToken) {
    errors.push('UPLOAD_MALWARE_SCAN_API_TOKEN is required when upload malware scan smoke checks are enabled.');
  }

  return errors;
}

function isAnyUploadMalwareScanConfigPresent(env: ProviderCredentialEnvironment): boolean {
  return Boolean(
    getValue(env, 'UPLOAD_MALWARE_SCAN_PROVIDER')
      || getValue(env, 'UPLOAD_MALWARE_SCAN_API_URL')
      || getValue(env, 'UPLOAD_MALWARE_SCAN_API_TOKEN')
      || getValue(env, 'UPLOAD_MALWARE_SCAN_HEALTH_URL'),
  );
}

function validateUploadObjectStorage(
  env: ProviderCredentialEnvironment,
  requireObjectStorage: boolean,
): string[] {
  const errors: string[] = [];
  const provider = getValue(env, 'UPLOAD_OBJECT_STORAGE_PROVIDER') || 's3';
  const endpoint = getValue(env, 'UPLOAD_OBJECT_STORAGE_ENDPOINT');
  const bucket = getValue(env, 'UPLOAD_OBJECT_STORAGE_BUCKET');
  const accessKeyId = getValue(env, 'UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = getValue(env, 'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY');
  const shouldValidate = requireObjectStorage || isAnyUploadObjectStorageConfigPresent(env);

  if (!shouldValidate) {
    return [];
  }

  if (!['s3', 'r2'].includes(provider)) {
    errors.push(`UPLOAD_OBJECT_STORAGE_PROVIDER ${provider} is not supported by provider credential smoke checks.`);
  }

  if (!endpoint) {
    errors.push('UPLOAD_OBJECT_STORAGE_ENDPOINT is required when upload object storage is enabled.');
  } else if (!isHttpsUrl(endpoint)) {
    errors.push('UPLOAD_OBJECT_STORAGE_ENDPOINT must be an HTTPS URL when upload object storage is enabled.');
  }

  if (!bucket) {
    errors.push('UPLOAD_OBJECT_STORAGE_BUCKET is required when upload object storage is enabled.');
  } else if (!isValidObjectStorageBucket(bucket)) {
    errors.push('UPLOAD_OBJECT_STORAGE_BUCKET must be a valid S3-compatible bucket name.');
  }

  if (!accessKeyId) {
    errors.push('UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID is required when upload object storage is enabled.');
  }

  if (!secretAccessKey) {
    errors.push('UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY is required when upload object storage is enabled.');
  }

  return errors;
}

function isAnyUploadObjectStorageConfigPresent(env: ProviderCredentialEnvironment): boolean {
  return Boolean(
    parseBoolean(env.UPLOAD_OBJECT_STORAGE_ENABLED, false)
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_PROVIDER')
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_ENDPOINT')
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_BUCKET')
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_REGION')
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID')
      || getValue(env, 'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY'),
  );
}

async function runLiveCredentialCheck(input: {
  id: string;
  smokeUrl: string;
  authorizationToken: string;
  missingMessage: string;
  successMessage: string;
  fetchImpl?: ProviderCredentialSmokeFetch;
}): Promise<ProviderCredentialSmokeCheck> {
  if (!input.smokeUrl) {
    return buildCheck(input.id, [input.missingMessage], input.successMessage, {
      live: true,
    });
  }

  if (!isHttpsUrl(input.smokeUrl)) {
    return buildCheck(input.id, ['Provider smoke health URL must be an HTTPS URL.'], input.successMessage, {
      live: true,
    });
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(input.smokeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.authorizationToken}`,
      },
    });

    if (!response.ok) {
      return buildCheck(
        input.id,
        [`Provider smoke health endpoint returned HTTP ${response.status}.`],
        input.successMessage,
        { live: true },
      );
    }

    return buildCheck(input.id, [], input.successMessage, { live: true });
  } catch (error) {
    return buildCheck(
      input.id,
      [`Provider smoke health endpoint failed: ${sanitizeError(error)}`],
      input.successMessage,
      { live: true },
    );
  }
}

function buildCheck(
  id: string,
  details: string[],
  successMessage: string,
  metadata: Record<string, string | number | boolean>,
  passingStatus: ProviderCredentialSmokeStatus = 'pass',
): ProviderCredentialSmokeCheck {
  const status = details.length > 0 ? 'fail' : passingStatus;

  return {
    id,
    status,
    message: details.length > 0 ? details.join(' ') : successMessage,
    details,
    metadata,
  };
}

function getValue(env: ProviderCredentialEnvironment, key: string): string {
  return env[key]?.trim() ?? '';
}

function getPublicAppUrl(env: ProviderCredentialEnvironment): string {
  return getValue(env, 'PUBLIC_APP_URL') || getValue(env, 'WEB_APP_URL');
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function extractSenderEmail(sender: string): string {
  const angleMatch = sender.match(/<([^<>]+)>/);

  return angleMatch?.[1]?.trim() ?? sender.trim();
}

function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidObjectStorageBucket(value: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value);
}

function isAnySmsConfigPresent(env: ProviderCredentialEnvironment): boolean {
  return Boolean(
    getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL')
      || getValue(env, 'SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN')
      || getValue(env, 'SUPPORT_NOTIFICATION_SMS_RECIPIENTS'),
  );
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(/https?:\/\/\S+/gi, '[redacted-url]');
}

async function main(): Promise<void> {
  const result = await runProviderCredentialSmoke();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${sanitizeError(error)}\n`);
    process.exitCode = 1;
  });
}
