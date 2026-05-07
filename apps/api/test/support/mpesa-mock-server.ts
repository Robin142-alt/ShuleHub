import { createHmac } from 'node:crypto';
import {
  createServer,
  IncomingMessage,
  request as sendHttpRequest,
  Server,
  ServerResponse,
} from 'node:http';

interface SuccessfulCallbackDirective {
  tenant_id?: string;
  delay_ms?: number;
  delivery_id?: string;
  signature_mode?: 'valid' | 'invalid' | 'missing';
  timestamp?: string;
  payload?: Record<string, unknown>;
}

type StkPushScenario =
  | {
      type: 'accepted';
      tenant_id: string;
      merchant_request_id: string;
      checkout_request_id: string;
      response_delay_ms?: number;
      callbacks?: SuccessfulCallbackDirective[];
    }
  | {
      type: 'timeout';
      response_delay_ms: number;
    };

interface RecordedStkPushRequest {
  request: Record<string, unknown>;
}

interface DeliveredCallbackAttempt {
  delivery_id: string;
  status_code: number;
  response_body: string;
  error_message?: string;
}

export class MpesaMockServer {
  private server: Server | null = null;
  private readonly scenarios: StkPushScenario[] = [];
  private readonly stkPushRequests: RecordedStkPushRequest[] = [];
  private readonly callbackAttempts: DeliveredCallbackAttempt[] = [];
  private readonly pendingCallbacks = new Set<Promise<void>>();

  constructor(private readonly callbackSecret: string) {}

  async start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      try {
        await this.handleRequest(request, response);
      } catch (error) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown MPESA mock server error',
          }),
        );
      }
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', () => resolve());
    });
  }

  async stop(): Promise<void> {
    await this.waitForCallbacks();

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    this.server = null;
  }

  get baseUrl(): string {
    if (!this.server) {
      throw new Error('MPESA mock server is not started');
    }

    const address = this.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('MPESA mock server address is unavailable');
    }

    return `http://127.0.0.1:${address.port}`;
  }

  enqueueScenario(scenario: StkPushScenario): void {
    this.scenarios.push(scenario);
  }

  getRecordedStkPushRequests(): RecordedStkPushRequest[] {
    return [...this.stkPushRequests];
  }

  getDeliveredCallbacks(): DeliveredCallbackAttempt[] {
    return [...this.callbackAttempts];
  }

  reset(): void {
    this.scenarios.length = 0;
    this.stkPushRequests.length = 0;
    this.callbackAttempts.length = 0;
  }

  async waitForCallbacks(count?: number, timeoutMs = 5000): Promise<DeliveredCallbackAttempt[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (count == null) {
        if (this.pendingCallbacks.size === 0) {
          return this.getDeliveredCallbacks();
        }
      } else if (this.callbackAttempts.length >= count && this.pendingCallbacks.size === 0) {
        return this.getDeliveredCallbacks();
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(
      `Timed out waiting for MPESA callbacks; saw ${this.callbackAttempts.length} deliveries`,
    );
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method?.toUpperCase() ?? '';
    const url = new URL(request.url ?? '/', this.baseUrl);

    if (method === 'GET' && url.pathname === '/oauth/v1/generate') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          access_token: 'mock-mpesa-access-token',
          expires_in: '3599',
        }),
      );
      return;
    }

    if (method === 'POST' && url.pathname === '/mpesa/stkpush/v1/processrequest') {
      const rawBody = await this.readBody(request);
      const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
      this.stkPushRequests.push({
        request: parsedBody,
      });

      const scenario = this.scenarios.shift();

      if (!scenario) {
        throw new Error('No MPESA STK push scenario was queued');
      }

      if (scenario.type === 'timeout') {
        await new Promise((resolve) => setTimeout(resolve, scenario.response_delay_ms));
        return;
      }

      const callbackUrl = String(parsedBody.CallBackURL ?? '');

      for (const callback of scenario.callbacks ?? []) {
        this.scheduleCallbackDelivery(callbackUrl, parsedBody, scenario, callback);
      }

      if ((scenario.response_delay_ms ?? 0) > 0) {
        await new Promise((resolve) => setTimeout(resolve, scenario.response_delay_ms));
      }

      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          MerchantRequestID: scenario.merchant_request_id,
          CheckoutRequestID: scenario.checkout_request_id,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end('Not found');
  }

  private scheduleCallbackDelivery(
    callbackUrl: string,
    stkPushRequest: Record<string, unknown>,
    scenario: Extract<StkPushScenario, { type: 'accepted' }>,
    callback: SuccessfulCallbackDirective,
  ): void {
    const pending = (async () => {
      const effectiveDelayMs = Math.max(callback.delay_ms ?? 0, 75);
      await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));

      const payload =
        callback.payload ??
        this.buildSuccessfulPayload(
          scenario.merchant_request_id,
          scenario.checkout_request_id,
          String(stkPushRequest.Amount ?? '0'),
          String(stkPushRequest.PhoneNumber ?? ''),
        );
      const rawBody = JSON.stringify(payload);
      const timestamp = callback.timestamp ?? Math.floor(Date.now() / 1000).toString();
      const deliveryId =
        callback.delivery_id ?? `${scenario.checkout_request_id}:${Math.floor(Date.now())}`;
      const tenantId = callback.tenant_id ?? scenario.tenant_id;
      const callbackTarget = new URL(callbackUrl);
      
      try {
        const response = await this.sendCallbackRequest(
          callbackTarget,
          {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(rawBody).toString(),
            host: this.buildTenantHost(callbackTarget, tenantId),
            'x-mpesa-timestamp': timestamp,
            'x-mpesa-delivery-id': deliveryId,
          },
          callback,
          rawBody,
        );

        this.callbackAttempts.push({
          delivery_id: deliveryId,
          status_code: response.status_code,
          response_body: response.response_body,
        });
      } catch (error) {
        this.callbackAttempts.push({
          delivery_id: deliveryId,
          status_code: 0,
          response_body: '',
          error_message: error instanceof Error ? error.message : 'Unknown callback delivery error',
        });
      }
    })();

    this.pendingCallbacks.add(pending);
    void pending.finally(() => {
      this.pendingCallbacks.delete(pending);
    });
  }

  private buildSuccessfulPayload(
    merchantRequestId: string,
    checkoutRequestId: string,
    amountMajor: string,
    phoneNumber: string,
  ): Record<string, unknown> {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: merchantRequestId,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: Number(amountMajor) },
              { Name: 'MpesaReceiptNumber', Value: `REC${checkoutRequestId.slice(-6)}` },
              { Name: 'TransactionDate', Value: Number(this.buildCurrentMpesaTransactionDate()) },
              { Name: 'PhoneNumber', Value: Number(phoneNumber) },
            ],
          },
        },
      },
    };
  }

  private buildTenantHost(callbackUrl: URL, tenantId: string): string {
    const port = callbackUrl.port ? `:${callbackUrl.port}` : '';
    return `${tenantId}.localhost${port}`;
  }

  private buildCurrentMpesaTransactionDate(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const partMap = new Map(parts.map((part) => [part.type, part.value]));

    return `${partMap.get('year')}${partMap.get('month')}${partMap.get('day')}${partMap.get('hour')}${partMap.get('minute')}${partMap.get('second')}`;
  }

  private computeSignature(rawBody: string, timestamp: string): string {
    return createHmac('sha256', this.callbackSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
  }

  private async sendCallbackRequest(
    callbackUrl: URL,
    headers: Record<string, string>,
    callback: SuccessfulCallbackDirective,
    rawBody: string,
  ): Promise<{ status_code: number; response_body: string }> {
    const effectiveHeaders = { ...headers };

    if (callback.signature_mode !== 'missing') {
      effectiveHeaders['x-mpesa-signature'] =
        callback.signature_mode === 'invalid'
          ? 'invalid-signature'
          : this.computeSignature(rawBody, headers['x-mpesa-timestamp'] ?? '');
    }

    return new Promise((resolve, reject) => {
      const request = sendHttpRequest(
        {
          method: 'POST',
          protocol: callbackUrl.protocol,
          hostname: callbackUrl.hostname,
          port: callbackUrl.port,
          path: `${callbackUrl.pathname}${callbackUrl.search}`,
          headers: effectiveHeaders,
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on('end', () => {
            resolve({
              status_code: response.statusCode ?? 0,
              response_body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      request.on('error', reject);
      request.write(rawBody);
      request.end();
    });
  }

  private async readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf8');
  }
}
