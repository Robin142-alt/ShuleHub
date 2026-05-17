const sensitiveQueryKeys = new Set([
  'code',
  'otp',
  'password',
  'refresh_token',
  'secret',
  'token',
]);

export function sanitizeRequestPath(value: string | undefined | null): string {
  const rawPath = typeof value === 'string' && value.trim().length > 0 ? value.trim() : '/';

  try {
    const parsed = new URL(rawPath, 'http://shulehub.local');

    if (parsed.searchParams.size === 0) {
      return parsed.pathname || '/';
    }

    const safeParams = new URLSearchParams();
    parsed.searchParams.forEach((paramValue, paramKey) => {
      if (sensitiveQueryKeys.has(paramKey.toLowerCase())) {
        safeParams.set(paramKey, '[redacted]');
        return;
      }

      safeParams.set(paramKey, paramValue);
    });
    const safeQuery = safeParams.toString();

    return `${parsed.pathname || '/'}${safeQuery ? `?${safeQuery}` : ''}`;
  } catch {
    const [pathOnly] = rawPath.split(/[?#]/, 1);

    return pathOnly || '/';
  }
}
