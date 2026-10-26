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
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
