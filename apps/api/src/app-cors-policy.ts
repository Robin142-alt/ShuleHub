export type CorsOriginPolicyInput = {
  nodeEnv: string;
  origins: string[];
  credentials: boolean;
};

export type CorsOriginPolicy = true | string[];

const sanitizeOrigins = (origins: string[]): string[] => {
  return Array.from(
    new Set(
      origins
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  );
};

export const resolveCorsOriginPolicy = ({
  nodeEnv,
  origins,
}: CorsOriginPolicyInput): CorsOriginPolicy => {
  const sanitizedOrigins = sanitizeOrigins(origins);
  const isProduction = nodeEnv === 'production';

  if (!isProduction) {
    return sanitizedOrigins.length === 0 || sanitizedOrigins.includes('*')
      ? true
      : sanitizedOrigins;
  }

  if (sanitizedOrigins.length === 0) {
    throw new Error(
      'APP_CORS_ORIGINS must contain explicit HTTPS origins in production.',
    );
  }

  if (sanitizedOrigins.includes('*')) {
    throw new Error('Wildcard CORS origins are not allowed in production.');
  }

  const invalidOrigins = sanitizedOrigins.filter((origin) => {
    try {
      return new URL(origin).protocol !== 'https:';
    } catch {
      return true;
    }
  });

  if (invalidOrigins.length > 0) {
    throw new Error('Production CORS origins must be HTTPS URLs.');
  }

  return sanitizedOrigins;
};
