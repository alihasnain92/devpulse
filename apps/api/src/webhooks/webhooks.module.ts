import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookCryptoService } from './crypto/webhook-crypto.service';
import { WebhookSignerService } from './crypto/webhook-signer.service';
import { WebhookHttpClientService } from './http/webhook-http-client.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';
import { WebhookOutboxPublisherService } from './outbox/webhook-outbox-publisher.service';
import { WebhookDeliveryWorkerService } from './queue/webhook-delivery-worker.service';

@Module({
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookCryptoService,
    WebhookSignerService,
    WebhookHttpClientService,
    WebhookDeliveryService,
    WebhookOutboxPublisherService,
    WebhookDeliveryWorkerService,
  ],
  exports: [
    WebhooksService,
    WebhookCryptoService,
    WebhookSignerService,
    WebhookHttpClientService,
    WebhookDeliveryService,
    WebhookOutboxPublisherService,
    WebhookDeliveryWorkerService,
  ],
})
export class WebhooksModule {}
