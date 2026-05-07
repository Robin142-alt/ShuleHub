import { Controller, Get } from '@nestjs/common';

import { TraceQueueProbeService } from './trace-queue-probe.service';

@Controller()
export class TraceProbeController {
  constructor(private readonly traceQueueProbeService: TraceQueueProbeService) {}

  @Get('trace-probe')
  getTraceProbe(): { ok: true } {
    return { ok: true };
  }

  @Get('trace-probe/queue')
  async getTraceQueueProbe() {
    return this.traceQueueProbeService.simulateQueuedHop();
  }
}
