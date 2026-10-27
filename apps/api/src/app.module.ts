import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MonitorsModule } from './monitors/monitors.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MetricsModule } from './metrics/metrics.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RateLimiterModule } from './rate-limiting/rate-limiter.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiKeyScopesGuard } from './api-keys/guards/api-key-scopes.guard';
import { RateLimitGuard } from './rate-limiting/rate-limit.guard';

@Module({
  imports: [
    RateLimiterModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    IncidentsModule,
    MonitoringModule,
    MonitorsModule,
    MetricsModule,
    WebhooksModule,
    ApiKeysModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyScopesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
