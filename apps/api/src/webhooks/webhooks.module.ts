import { Module } from '@nestjs/common';
import { WebhookDeliveriesController } from './deliveries/webhook-deliveries.controller';
import { WebhookDeliveriesService } from './deliveries/webhook-deliveries.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookCryptoService } from './crypto/webhook-crypto.service';
import { WebhookSignerService } from './crypto/webhook-signer.service';
import { WebhookHttpClientService } from './http/webhook-http-client.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';
import { WebhookOutboxPublisherService } from './outbox/webhook-outbox-publisher.service';
import { WebhookDeliveryWorkerService } from './queue/webhook-delivery-worker.service';

@Module({
  controllers: [
    WebhookDeliveriesController,
    WebhooksController,
  ],
  providers: [
    WebhooksService,
    WebhookDeliveriesService,
    WebhookCryptoService,
    WebhookSignerService,
    WebhookHttpClientService,
    WebhookDeliveryService,
    WebhookOutboxPublisherService,
    WebhookDeliveryWorkerService,
  ],
  exports: [
    WebhooksService,
    WebhookDeliveriesService,
    WebhookCryptoService,
    WebhookSignerService,
    WebhookHttpClientService,
    WebhookDeliveryService,
    WebhookOutboxPublisherService,
    WebhookDeliveryWorkerService,
  ],
})
export class WebhooksModule {}
