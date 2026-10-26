import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';

@Module({
  imports: [PrismaModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
