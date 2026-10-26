import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiKeyScopesGuard } from './api-keys/guards/api-key-scopes.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
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
  ],
})
export class AppModule {}
