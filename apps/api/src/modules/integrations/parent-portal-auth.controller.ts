import { Body, Controller, Post } from '@nestjs/common';

import { Public } from '../../auth/decorators/public.decorator';
import {
  RequestParentOtpDto,
  VerifyParentOtpDto,
} from './dto/integrations.dto';
import { ParentPortalAuthService } from './parent-portal-auth.service';

@Public()
@Controller('auth/parent')
export class ParentPortalAuthController {
  constructor(private readonly parentPortalAuthService: ParentPortalAuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestParentOtpDto) {
    return this.parentPortalAuthService.requestOtp(dto);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyParentOtpDto) {
    return this.parentPortalAuthService.verifyOtp(dto);
  }
}
