import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MonitoringWorkerService } from './monitoring/queue/monitoring-worker.service';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WebhookDeliveryWorkerService } from './webhooks/queue/webhook-delivery-worker.service';
import { WebhookOutboxPublisherService } from './webhooks/outbox/webhook-outbox-publisher.service';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationEmailWorkerService } from './notifications/queue/notification-email-worker.service';
import { NotificationEmailPublisherService } from './notifications/outbox/notification-email-publisher.service';

@Module({
  imports: [PrismaModule, MonitoringModule, WebhooksModule, NotificationsModule],
  providers: [
    MonitoringWorkerService,
    WebhookDeliveryWorkerService,
    WebhookOutboxPublisherService,
    NotificationEmailWorkerService,
    NotificationEmailPublisherService,
  ],
})
export class WorkerModule {}
