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

  return env;
}
