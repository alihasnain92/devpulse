import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthResponse } from '@devpulse/shared';

@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    // Minimal public liveness check without leaking internal diagnostics
    return { status: 'ok' };
  }
}
