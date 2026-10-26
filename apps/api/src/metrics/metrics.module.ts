import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PrismaModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
