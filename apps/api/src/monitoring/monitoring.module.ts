import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SsrfValidator } from './ssrf/ssrf.validator';
import { MonitoringHttpClientService } from './http/monitoring-http-client.service';
import { SchedulerService } from './queue/scheduler.service';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SsrfValidator,
    MonitoringHttpClientService,
    SchedulerService,
    MonitoringService,
  ],
  exports: [
    SsrfValidator,
    MonitoringHttpClientService,
    SchedulerService,
    MonitoringService,
  ],
})
export class MonitoringModule {}
