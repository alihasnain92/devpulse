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
}
