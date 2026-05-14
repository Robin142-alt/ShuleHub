import { Controller, Get, Header } from '@nestjs/common';

import { Public } from '../../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator';
import { renderSystemDashboard } from './system-dashboard.template';

@Controller()
export class SystemController {
  @Public()
  @Get()
  @SkipResponseEnvelope()
  @Header('content-type', 'text/html; charset=utf-8')
  getRoot(): string {
    return renderSystemDashboard();
  }

  @Public()
  @Get('dashboard')
  @SkipResponseEnvelope()
  @Header('content-type', 'text/html; charset=utf-8')
  getDashboard(): string {
    return renderSystemDashboard();
  }

  @Public()
  @Get('app')
  @SkipResponseEnvelope()
  @Header('content-type', 'text/html; charset=utf-8')
  getApp(): string {
    return renderSystemDashboard();
  }

  @Public()
  @Get('ops')
  @SkipResponseEnvelope()
  @Header('content-type', 'text/html; charset=utf-8')
  getOps(): string {
    return renderSystemDashboard();
  }
}
