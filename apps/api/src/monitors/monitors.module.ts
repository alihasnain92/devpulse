import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { MonitorsService } from './monitors.service';
import { MonitorsController } from './monitors.controller';

@Module({
  imports: [PrismaModule, MonitoringModule],
  controllers: [MonitorsController],
  providers: [MonitorsService],
  exports: [MonitorsService],
})
export class MonitorsModule {}
