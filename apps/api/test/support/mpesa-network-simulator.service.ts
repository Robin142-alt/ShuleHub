import { MpesaMockServer } from './mpesa-mock-server';

export type MpesaNetworkScenarioKind =
  | 'delayed_callback'
  | 'duplicate_callbacks'
  | 'missing_callback'
  | 'out_of_order_callbacks'
  | 'stk_success_without_callback'
  | 'network_timeout';

export interface MpesaCallbackDeliveryPlan {
  delivery_id: string;
  simulated_delay_minutes: number;
  signature_mode?: 'valid' | 'invalid' | 'missing';
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export interface MpesaNetworkScenarioRecord {
  scenario: MpesaNetworkScenarioKind;
  tenant_id: string;
  merchant_request_id: string;
  checkout_request_id: string;
  callback_plan: MpesaCallbackDeliveryPlan[];
}

interface MpesaNetworkSimulatorOptions {
  simulated_minute_ms?: number;
}

export class MpesaNetworkSimulatorService {
  private readonly simulatedMinuteMs: number;

  constructor(
    private readonly mockServer: MpesaMockServer,
    options: MpesaNetworkSimulatorOptions = {},
  ) {
    this.simulatedMinuteMs = Math.max(10, options.simulated_minute_ms ?? 75);
  }

  queueDelayedCallback(input: {
    tenant_id: string;
    merchant_request_id: string;
    checkout_request_id: string;
    simulated_delay_minutes: number;
  }): MpesaNetworkScenarioRecord {
    const callbackPlan = [
      this.buildDelivery(input.checkout_request_id, 'delayed', 1, input.simulated_delay_minutes),
    ];

    this.enqueueAccepted(input.tenant_id, input.merchant_request_id, input.checkout_request_id, callbackPlan);

    return {
      scenario: 'delayed_callback',
      tenant_id: input.tenant_id,
      merchant_request_id: input.merchant_request_id,
      checkout_request_id: input.checkout_request_id,
      callback_plan: callbackPlan,
    };
  }

  queueDuplicateCallbacks(input: {
    tenant_id: string;
    merchant_request_id: string;
    checkout_request_id: string;
    duplicate_count: number;
    simulated_delay_minutes?: number[];
  }): MpesaNetworkScenarioRecord {
    const duplicateCount = Math.min(5, Math.max(1, input.duplicate_count));
    const callbackPlan = Array.from({ length: duplicateCount }, (_, index) =>
      this.buildDelivery(
        input.checkout_request_id,
        'duplicate',
        index + 1,
        input.simulated_delay_minutes?.[index] ?? index * 0.5,
      ),
    );

    this.enqueueAccepted(input.tenant_id, input.merchant_request_id, input.checkout_request_id, callbackPlan);

    return {
      scenario: 'duplicate_callbacks',
      tenant_id: input.tenant_id,
      merchant_request_id: input.merchant_request_id,
      checkout_request_id: input.checkout_request_id,
      callback_plan: callbackPlan,
    };
  }

  queueOutOfOrderCallbacks(input: {
    tenant_id: string;
    merchant_request_id: string;
    checkout_request_id: string;
    simulated_delay_minutes: number[];
  }): MpesaNetworkScenarioRecord {
    const callbackPlan = input.simulated_delay_minutes.map((delayMinutes, index) =>
      this.buildDelivery(input.checkout_request_id, 'out-of-order', index + 1, delayMinutes),
    );

    this.enqueueAccepted(input.tenant_id, input.merchant_request_id, input.checkout_request_id, callbackPlan);

    return {
      scenario: 'out_of_order_callbacks',
      tenant_id: input.tenant_id,
      merchant_request_id: input.merchant_request_id,
      checkout_request_id: input.checkout_request_id,
      callback_plan: callbackPlan,
    };
  }

  queueMissingCallback(input: {
    tenant_id: string;
    merchant_request_id: string;
    checkout_request_id: string;
  }): MpesaNetworkScenarioRecord {
    this.enqueueAccepted(input.tenant_id, input.merchant_request_id, input.checkout_request_id, []);

    return {
      scenario: 'missing_callback',
      tenant_id: input.tenant_id,
      merchant_request_id: input.merchant_request_id,
      checkout_request_id: input.checkout_request_id,
      callback_plan: [],
    };
  }

  queueStkSuccessWithoutCallback(input: {
    tenant_id: string;
    merchant_request_id: string;
    checkout_request_id: string;
  }): MpesaNetworkScenarioRecord {
    this.enqueueAccepted(input.tenant_id, input.merchant_request_id, input.checkout_request_id, []);

    return {
      scenario: 'stk_success_without_callback',
      tenant_id: input.tenant_id,
      merchant_request_id: input.merchant_request_id,
      checkout_request_id: input.checkout_request_id,
      callback_plan: [],
    };
  }

  queueNetworkTimeout(responseDelayMs: number): void {
    this.mockServer.enqueueScenario({
      type: 'timeout',
      response_delay_ms: responseDelayMs,
    });
  }

  private enqueueAccepted(
    tenantId: string,
    merchantRequestId: string,
    checkoutRequestId: string,
    callbackPlan: MpesaCallbackDeliveryPlan[],
  ): void {
    this.mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      callbacks: callbackPlan.map((delivery) => ({
        delay_ms: this.toDelayMs(delivery.simulated_delay_minutes),
        delivery_id: delivery.delivery_id,
        signature_mode: delivery.signature_mode,
        timestamp: delivery.timestamp,
        payload: delivery.payload,
      })),
    });
  }

  private buildDelivery(
    checkoutRequestId: string,
    prefix: string,
    sequence: number,
    simulatedDelayMinutes: number,
  ): MpesaCallbackDeliveryPlan {
    return {
      delivery_id: `${prefix}-${checkoutRequestId}-${sequence}`,
      simulated_delay_minutes: simulatedDelayMinutes,
    };
  }

  private toDelayMs(simulatedDelayMinutes: number): number {
    return Math.max(0, Math.round(simulatedDelayMinutes * this.simulatedMinuteMs));
  }
}
