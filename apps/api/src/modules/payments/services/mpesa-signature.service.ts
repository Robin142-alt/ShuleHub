import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import {
  MPESA_CALLBACK_DELIVERY_ID_HEADER,
  MPESA_CALLBACK_SIGNATURE_HEADER,
  MPESA_CALLBACK_TIMESTAMP_HEADER,
} from '../payments.constants';
import { CallbackVerificationResult } from '../payments.types';

@Injectable()
export class MpesaSignatureService {
  constructor(private readonly configService: ConfigService) {}

  inspectCallback(rawBody: string, headers: IncomingHttpHeaders): CallbackVerificationResult {
    const signature = this.getHeaderValue(headers, MPESA_CALLBACK_SIGNATURE_HEADER);
    const timestamp = this.getHeaderValue(headers, MPESA_CALLBACK_TIMESTAMP_HEADER);
    const deliveryIdHeader = this.getHeaderValue(headers, MPESA_CALLBACK_DELIVERY_ID_HEADER);
    const eventTimestamp = this.parseTimestamp(timestamp);
    const requestFingerprint = createHash('sha256').update(rawBody).digest('hex');
    const deliveryId =
      deliveryIdHeader ??
      createHash('sha256')
        .update(`${timestamp ?? ''}.${signature ?? ''}.${rawBody}`)
        .digest('hex');

    return {
      delivery_id: deliveryId,
      request_fingerprint: requestFingerprint,
      signature,
      event_timestamp: eventTimestamp?.toISOString() ?? null,
    };
  }

  verifyCallback(
    rawBody: string,
    headers: IncomingHttpHeaders,
    inspection = this.inspectCallback(rawBody, headers),
  ): CallbackVerificationResult {
    const timestamp = this.getHeaderValue(headers, MPESA_CALLBACK_TIMESTAMP_HEADER);

    if (!inspection.signature) {
      throw new UnauthorizedException('MPESA callback signature header is required');
    }

    if (!timestamp) {
      throw new UnauthorizedException('MPESA callback timestamp header is required');
    }

    const timestampDate = this.parseTimestamp(timestamp);

    if (!timestampDate) {
      throw new UnauthorizedException('MPESA callback timestamp is invalid');
    }

    const toleranceSeconds = Number(
      this.configService.get<number>('mpesa.callbackTimestampToleranceSeconds') ?? 300,
    );
    const skewMs = Math.abs(Date.now() - timestampDate.getTime());

    if (skewMs > toleranceSeconds * 1000) {
      throw new UnauthorizedException('MPESA callback timestamp is outside the allowed skew');
    }

    const expectedHex = this.computeSignature(rawBody, timestamp);
    const expectedBase64 = this.computeSignatureBase64(rawBody, timestamp);

    if (
      !this.safeCompare(inspection.signature.toLowerCase(), expectedHex.toLowerCase()) &&
      !this.safeCompare(inspection.signature, expectedBase64)
    ) {
      throw new UnauthorizedException('Invalid MPESA callback signature');
    }

    return inspection;
  }

  computeSignature(rawBody: string, timestamp: string): string {
    return createHmac('sha256', this.getCallbackSecret())
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
  }

  private computeSignatureBase64(rawBody: string, timestamp: string): string {
    return createHmac('sha256', this.getCallbackSecret())
      .update(`${timestamp}.${rawBody}`)
      .digest('base64');
  }

  private getCallbackSecret(): string {
    const callbackSecret = this.configService.get<string>('mpesa.callbackSecret') ?? '';

    if (callbackSecret.trim().length === 0) {
      throw new UnauthorizedException('MPESA callback secret is not configured');
    }

    return callbackSecret;
  }

  private getHeaderValue(headers: IncomingHttpHeaders, headerName: string): string | null {
    const value = headers[headerName];

    if (!value) {
      return null;
    }

    return Array.isArray(value) ? value[0] ?? null : value;
  }

  private parseTimestamp(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    if (/^\d+$/.test(value)) {
      const numericValue = Number(value);

      if (Number.isNaN(numericValue)) {
        return null;
      }

      const isMilliseconds = value.length >= 13;
      return new Date(isMilliseconds ? numericValue : numericValue * 1000);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
