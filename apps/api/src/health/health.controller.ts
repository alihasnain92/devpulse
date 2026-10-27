import { Controller, Get, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { HealthResponse } from '@devpulse/shared';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimiterService } from '../rate-limiting/rate-limiter.service';

@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    private readonly rateLimiterService?: RateLimiterService,
  ) {}

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
  async checkWorker(): Promise<{
    status: 'ok';
    monitorWorker: boolean;
    webhookWorker: boolean;
    notificationEmailWorker: boolean;
    redis: boolean;
  }> {
    let redisHealthy = true;
    if (this.rateLimiterService) {
      redisHealthy = await this.rateLimiterService.ping();
    }

    return {
      status: 'ok',
      monitorWorker: true,
      webhookWorker: true,
      notificationEmailWorker: true,
      redis: redisHealthy,
    };
  }
}
