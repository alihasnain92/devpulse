import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MonitoringWorkerService } from './monitoring/queue/monitoring-worker.service';

@Module({
  imports: [PrismaModule, MonitoringModule],
  providers: [MonitoringWorkerService],
})
export class WorkerModule {}
