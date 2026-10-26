import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { SsrfValidator } from './ssrf/ssrf.validator';
import { MonitoringHttpClientService } from './http/monitoring-http-client.service';
import { SchedulerService } from './queue/scheduler.service';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [PrismaModule, IncidentsModule],
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
