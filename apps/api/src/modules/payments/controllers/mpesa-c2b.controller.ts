import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

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

@Controller(['payments/mpesa/c2b', 'mpesa/c2b'])
export class MpesaC2bController {
  constructor(private readonly mpesaC2bService: MpesaC2bService) {}

  @Public()
  @Post('validation')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() payload: MpesaC2bPayload): Promise<MpesaC2bGatewayResponse> {
    return this.mpesaC2bService.validatePayment(payload);
  }

  @Public()
  @Post('confirmation')
  @HttpCode(HttpStatus.OK)
  async confirm(@Body() payload: MpesaC2bPayload): Promise<MpesaC2bGatewayResponse> {
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
}
