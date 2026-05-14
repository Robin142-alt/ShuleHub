const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'SECURITY_PII_ENCRYPTION_KEY',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORT_CODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
  'MPESA_CALLBACK_SECRET',
  'MPESA_LEDGER_DEBIT_ACCOUNT_CODE',
  'MPESA_LEDGER_CREDIT_ACCOUNT_CODE',
];

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
  const invalidEnvVars = validateUploadObjectStorageEnv(env);

  const hasJwtSecret =
    typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.trim().length > 0;
  const hasAccessTokenSecret =
    typeof env.JWT_ACCESS_TOKEN_SECRET === 'string'
    && env.JWT_ACCESS_TOKEN_SECRET.trim().length > 0;
  const hasRefreshTokenSecret =
    typeof env.JWT_REFRESH_TOKEN_SECRET === 'string'
    && env.JWT_REFRESH_TOKEN_SECRET.trim().length > 0;

  if (!hasJwtSecret && (!hasAccessTokenSecret || !hasRefreshTokenSecret)) {
    missingEnvVars.push('JWT_SECRET or both JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET');
  }

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  if (invalidEnvVars.length > 0) {
    throw new Error(`Invalid environment variables: ${invalidEnvVars.join(', ')}`);
  }

  return env;
}

function validateUploadObjectStorageEnv(env: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const provider = getString(env, 'UPLOAD_OBJECT_STORAGE_PROVIDER') || 's3';
  const endpoint = getString(env, 'UPLOAD_OBJECT_STORAGE_ENDPOINT');
  const bucket = getString(env, 'UPLOAD_OBJECT_STORAGE_BUCKET');
  const accessKeyId = getString(env, 'UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = getString(env, 'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY');
  const shouldValidate = parseBoolean(getString(env, 'UPLOAD_OBJECT_STORAGE_ENABLED'), false)
    || isAnyUploadObjectStorageConfigPresent(env);

  if (!shouldValidate) {
    return [];
  }

  if (!['s3', 'r2'].includes(provider)) {
    errors.push('UPLOAD_OBJECT_STORAGE_PROVIDER must be s3 or r2');
  }

  if (!endpoint) {
    errors.push('UPLOAD_OBJECT_STORAGE_ENDPOINT is required');
  } else if (!isHttpsUrl(endpoint)) {
    errors.push('UPLOAD_OBJECT_STORAGE_ENDPOINT must be an HTTPS URL');
  }

  if (!bucket) {
    errors.push('UPLOAD_OBJECT_STORAGE_BUCKET is required');
  } else if (!isValidObjectStorageBucket(bucket)) {
    errors.push('UPLOAD_OBJECT_STORAGE_BUCKET must be a valid S3-compatible bucket name');
  }

  if (!accessKeyId) {
    errors.push('UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID is required');
  }

  if (!secretAccessKey) {
    errors.push('UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY is required');
  }

  return errors;
}

function isAnyUploadObjectStorageConfigPresent(env: Record<string, unknown>): boolean {
  return Boolean(
    getString(env, 'UPLOAD_OBJECT_STORAGE_PROVIDER')
      || getString(env, 'UPLOAD_OBJECT_STORAGE_ENDPOINT')
      || getString(env, 'UPLOAD_OBJECT_STORAGE_BUCKET')
      || getString(env, 'UPLOAD_OBJECT_STORAGE_REGION')
      || getString(env, 'UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID')
      || getString(env, 'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY'),
  );
}

function getString(env: Record<string, unknown>, key: string): string {
  const value = env[key];

  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value: string, fallback: boolean): boolean {
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
