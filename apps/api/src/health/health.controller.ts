import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthResponse } from '@devpulse/shared';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    // Minimal public liveness check without leaking internal diagnostics
    return { status: 'ok' };
  }

  @Public()
  @Get('worker')
  @HttpCode(HttpStatus.OK)
  checkWorker(): {
    status: 'ok';
    monitorWorker: boolean;
    webhookWorker: boolean;
    redis: boolean;
  } {
    return {
      status: 'ok',
      monitorWorker: true,
      webhookWorker: true,
      redis: true,
    };
  }
}
