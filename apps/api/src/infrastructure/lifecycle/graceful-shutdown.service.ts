import { Injectable, Logger, OnModuleDestroy, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Coordinates graceful shutdown across all subsystems.
 *
 * Shutdown order:
 *   1. Stop accepting new HTTP connections
 *   2. Wait for in-flight requests to drain (up to timeout)
 *   3. Close queue workers (stop processing new jobs)
 *   4. Close Redis connections
 *   5. Close database pool
 *   6. Exit process
 *
 * This service logs each phase to provide observability during deploys.
 */
@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private readonly shutdownCallbacks: Array<{
    label: string;
    callback: () => Promise<void>;
    priority: number;
  }> = [];
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Register a shutdown callback. Lower priority numbers execute first.
   */
  registerShutdownHook(
    label: string,
    priority: number,
    callback: () => Promise<void>,
  ): void {
    this.shutdownCallbacks.push({ label, callback, priority });
  }

  /**
   * Check if the application is currently shutting down.
   * Use this in middleware to reject new requests during shutdown.
   */
  getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.isShuttingDown = true;
    this.logger.warn(`Graceful shutdown initiated (signal: ${signal ?? 'unknown'})`);

    const shutdownTimeoutMs = Number(
      this.configService.get<number>('app.shutdownTimeoutMs') ?? 15_000,
    );

    // Sort by priority (lower = first)
    const sortedCallbacks = [...this.shutdownCallbacks].sort(
      (a, b) => a.priority - b.priority,
    );

    const shutdownPromise = this.executeShutdownSequence(sortedCallbacks);
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Shutdown timed out after ${shutdownTimeoutMs}ms`)),
        shutdownTimeoutMs,
      );
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      this.logger.log('Graceful shutdown completed successfully');
    } catch (error) {
      this.logger.error(
        `Shutdown error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeShutdownSequence(
    callbacks: Array<{ label: string; callback: () => Promise<void>; priority: number }>,
  ): Promise<void> {
    for (const { label, callback } of callbacks) {
      try {
        this.logger.log(`Shutting down: ${label}...`);
        await callback();
        this.logger.log(`Shut down: ${label} ✓`);
      } catch (error) {
        this.logger.error(
          `Shutdown failed for ${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
