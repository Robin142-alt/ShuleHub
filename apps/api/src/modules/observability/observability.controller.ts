import { Controller, Get } from '@nestjs/common';

import { Public } from '../../auth/decorators/public.decorator';
import { SloMonitoringService } from './slo-monitoring.service';

@Public()
@Controller('observability')
export class ObservabilityController {
  constructor(private readonly sloMonitoringService: SloMonitoringService) {}

  @Get('slos')
  getSloCatalog() {
    return {
      subsystem_count: 4,
      objectives: this.sloMonitoringService.getSloCatalog(),
    };
  }

  @Get('dashboard')
  async getDashboard() {
    return this.sloMonitoringService.getDashboard();
  }

  @Get('metrics')
  async getMetrics() {
    return this.sloMonitoringService.getMetrics();
  }

  @Get('alerts')
  async getAlerts() {
    return {
      alerts: await this.sloMonitoringService.getAlerts(),
    };
  }

  @Get('health')
  async getHealth() {
    return this.sloMonitoringService.getRealtimeHealth();
  }
}
