import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookCryptoService } from './crypto/webhook-crypto.service';
import { WebhookSignerService } from './crypto/webhook-signer.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookCryptoService, WebhookSignerService],
  exports: [WebhooksService, WebhookCryptoService, WebhookSignerService],
})
export class WebhooksModule {}
