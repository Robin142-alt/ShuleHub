import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { Public } from '../../../auth/decorators/public.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { ReconcileMpesaC2bPaymentDto } from '../dto/reconcile-mpesa-c2b-payment.dto';
import { MpesaC2bPaymentEntity } from '../entities/mpesa-c2b-payment.entity';
import {
  MpesaC2bGatewayResponse,
  MpesaC2bPaymentStatus,
  MpesaC2bPayload,
} from '../payments.types';
import { MpesaC2bService } from '../services/mpesa-c2b.service';
import { MpesaSignatureService } from '../services/mpesa-signature.service';

@Controller(['payments/mpesa/c2b', 'mpesa/c2b'])
export class MpesaC2bController {
  constructor(
    private readonly mpesaC2bService: MpesaC2bService,
    @Optional() private readonly mpesaSignatureService?: MpesaSignatureService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  @Public()
  @Post('validation')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Req() request: Request,
    @Body() payload: MpesaC2bPayload,
  ): Promise<MpesaC2bGatewayResponse> {
    this.verifyCallbackRequired(request);
    return this.mpesaC2bService.validatePayment(payload);
  }

  @Public()
  @Post('confirmation')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Req() request: Request,
    @Body() payload: MpesaC2bPayload,
  ): Promise<MpesaC2bGatewayResponse> {
    this.verifyCallbackRequired(request);
    await this.mpesaC2bService.processConfirmation(payload);

    return {
      ResultCode: 0,
      ResultDesc: 'Confirmation received successfully',
    };
  }

  @Get('payments')
  @Permissions('billing:read')
  async listPayments(
    @Query('status') status?: MpesaC2bPaymentStatus,
  ): Promise<MpesaC2bPaymentEntity[]> {
    return this.mpesaC2bService.listC2bPayments({
      status: status ?? null,
    });
  }

  @Post('payments/:paymentId/reconcile')
  @Permissions('billing:update')
  async reconcilePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: ReconcileMpesaC2bPaymentDto,
  ): Promise<MpesaC2bPaymentEntity> {
    return this.mpesaC2bService.reconcilePendingPayment(paymentId, dto);
  }

  private verifyCallbackRequired(request: Request): void {
    const callbackSecret =
      this.configService?.get<string>('mpesa.callbackSecret')
      ?? process.env.MPESA_CALLBACK_SECRET
      ?? '';

    if (!callbackSecret.trim()) {
      throw new UnauthorizedException('MPESA callback secret is not configured');
    }

    if (!this.mpesaSignatureService) {
      throw new UnauthorizedException('MPESA callback signature verification is unavailable');
    }

    this.mpesaSignatureService.verifyCallback(this.getRawBody(request), request.headers);
  }

  private getRawBody(request: Request): string {
    if (request.rawBody) {
      return request.rawBody.toString('utf8');
    }

    if (typeof request.body === 'string') {
      return request.body;
    }

    return JSON.stringify(request.body ?? {});
  }
}
