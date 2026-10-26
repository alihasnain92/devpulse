import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MonitoringWorkerService } from './monitoring/queue/monitoring-worker.service';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WebhookDeliveryWorkerService } from './webhooks/queue/webhook-delivery-worker.service';
import { WebhookOutboxPublisherService } from './webhooks/outbox/webhook-outbox-publisher.service';

@Module({
  imports: [PrismaModule, MonitoringModule, WebhooksModule],
  providers: [
    MonitoringWorkerService,
    WebhookDeliveryWorkerService,
    WebhookOutboxPublisherService,
  ],
})
export class WorkerModule {}
