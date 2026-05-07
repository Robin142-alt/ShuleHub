import { Injectable, Logger } from '@nestjs/common';

/**
 * Circuit breaker states:
 *  - CLOSED: requests flow through normally
 *  - OPEN: requests are rejected immediately (fail fast)
 *  - HALF_OPEN: a single probe request is allowed through to test recovery
 */
type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerConfig {
  /** Number of consecutive failures before the circuit opens */
  failure_threshold: number;
  /** Duration in ms the circuit stays OPEN before transitioning to HALF_OPEN */
  reset_timeout_ms: number;
  /** Number of successful probes needed in HALF_OPEN to close the circuit */
  success_threshold: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at: number | null;
  last_state_change_at: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 5,
  reset_timeout_ms: 30_000,
  success_threshold: 2,
};

/**
 * In-process circuit breaker for protecting against cascading failures.
 *
 * Usage:
 *   const result = await circuitBreaker.execute('mpesa-api', () => mpesaClient.stkPush(...));
 *
 * Each named circuit is independent. When a circuit opens:
 *  - All calls fail immediately without executing the operation
 *  - After reset_timeout_ms, a single probe is allowed through
 *  - If the probe succeeds, the circuit closes; if it fails, the circuit reopens
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreakerState>();
  private readonly configs = new Map<string, CircuitBreakerConfig>();

  /**
   * Register a named circuit with custom configuration.
   * Must be called before `execute()` for non-default configs.
   */
  register(name: string, config: Partial<CircuitBreakerConfig>): void {
    this.configs.set(name, { ...DEFAULT_CONFIG, ...config });
  }

  /**
   * Execute an operation through the named circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const circuit = this.getOrCreateCircuit(name);
    const config = this.configs.get(name) ?? DEFAULT_CONFIG;

    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.last_state_change_at;

      if (elapsed < config.reset_timeout_ms) {
        throw new CircuitOpenError(name, config.reset_timeout_ms - elapsed);
      }

      // Transition to half-open — allow a single probe
      this.transitionTo(name, circuit, 'half_open');
    }

    try {
      const result = await operation();
      this.onSuccess(name, circuit, config);
      return result;
    } catch (error) {
      this.onFailure(name, circuit, config, error);
      throw error;
    }
  }

  /**
   * Get the current state of a circuit (for observability).
   */
  getState(name: string): { state: CircuitState; failure_count: number } | null {
    const circuit = this.circuits.get(name);

    if (!circuit) {
      return null;
    }

    return { state: circuit.state, failure_count: circuit.failure_count };
  }

  /**
   * Get all circuit states (for the health/metrics endpoint).
   */
  getAllStates(): Record<string, { state: CircuitState; failure_count: number }> {
    const result: Record<string, { state: CircuitState; failure_count: number }> = {};

    for (const [name, circuit] of this.circuits) {
      result[name] = { state: circuit.state, failure_count: circuit.failure_count };
    }

    return result;
  }

  /**
   * Force-reset a circuit to closed state (for admin/recovery).
   */
  reset(name: string): void {
    const circuit = this.circuits.get(name);

    if (circuit) {
      this.transitionTo(name, circuit, 'closed');
      circuit.failure_count = 0;
      circuit.success_count = 0;
    }
  }

  private onSuccess(
    name: string,
    circuit: CircuitBreakerState,
    config: CircuitBreakerConfig,
  ): void {
    if (circuit.state === 'half_open') {
      circuit.success_count += 1;

      if (circuit.success_count >= config.success_threshold) {
        this.transitionTo(name, circuit, 'closed');
        circuit.failure_count = 0;
        circuit.success_count = 0;
      }

      return;
    }

    // In closed state, reset failure count on success
    circuit.failure_count = 0;
  }

  private onFailure(
    name: string,
    circuit: CircuitBreakerState,
    config: CircuitBreakerConfig,
    error: unknown,
  ): void {
    circuit.failure_count += 1;
    circuit.last_failure_at = Date.now();

    if (circuit.state === 'half_open') {
      // Probe failed — reopen the circuit
      this.transitionTo(name, circuit, 'open');
      circuit.success_count = 0;
      return;
    }

    if (circuit.failure_count >= config.failure_threshold) {
      this.transitionTo(name, circuit, 'open');
      this.logger.error(
        `Circuit "${name}" OPENED after ${circuit.failure_count} consecutive failures. ` +
        `Last error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private transitionTo(
    name: string,
    circuit: CircuitBreakerState,
    newState: CircuitState,
  ): void {
    const previousState = circuit.state;
    circuit.state = newState;
    circuit.last_state_change_at = Date.now();

    if (previousState !== newState) {
      this.logger.warn(`Circuit "${name}" transitioned: ${previousState} → ${newState}`);
    }
  }

  private getOrCreateCircuit(name: string): CircuitBreakerState {
    let circuit = this.circuits.get(name);

    if (!circuit) {
      circuit = {
        state: 'closed',
        failure_count: 0,
        success_count: 0,
        last_failure_at: null,
        last_state_change_at: Date.now(),
      };
      this.circuits.set(name, circuit);
    }

    return circuit;
  }
}

/**
 * Thrown when a circuit breaker is open and rejecting requests.
 */
export class CircuitOpenError extends Error {
  public readonly circuit_name: string;
  public readonly retry_after_ms: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(
      `Circuit "${circuitName}" is OPEN. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
    );
    this.name = 'CircuitOpenError';
    this.circuit_name = circuitName;
    this.retry_after_ms = retryAfterMs;
  }
}
