import { Logger } from '@nestjs/common';

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const retryDatabaseOperation = async <T>(
  logger: Logger,
  actionLabel: string,
  maxRetries: number,
  baseDelayMs: number,
  operation: () => Promise<T>,
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * attempt, 10000);
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `${actionLabel} failed on attempt ${attempt}/${maxRetries}: ${message}. Retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${actionLabel} failed after ${maxRetries} attempts`);
};
