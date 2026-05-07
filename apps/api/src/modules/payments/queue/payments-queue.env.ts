const REQUIRED_PAYMENTS_QUEUE_ENV_VARS = ['REDIS_URL'];
const REQUIRED_PAYMENTS_QUEUE_VERIFICATION_ENV_VARS = ['DATABASE_URL'];

export function validatePaymentsQueueEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const missingEnvVars = REQUIRED_PAYMENTS_QUEUE_ENV_VARS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required queue environment variables: ${missingEnvVars.join(', ')}`,
    );
  }

  return env;
}

export function validatePaymentsQueueVerificationEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const missingEnvVars = REQUIRED_PAYMENTS_QUEUE_VERIFICATION_ENV_VARS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required payment verification environment variables: ${missingEnvVars.join(', ')}`,
    );
  }

  return env;
}
