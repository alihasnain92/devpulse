import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { WEBHOOK_DELIVERIES_QUEUE_NAME } from '@devpulse/shared';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';
import { getRedisConnectionOptions } from '../../monitoring/queue/queue.constants';

interface DeliveryJobData {
  deliveryId: string;
}

@Injectable()
export class WebhookDeliveryWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WebhookDeliveryWorkerService.name);
  private worker: Worker<DeliveryJobData> | null = null;
  private isRunning = false;

  constructor(private readonly deliveryService: WebhookDeliveryService) {}

  onModuleInit(): void {
    const connection = getRedisConnectionOptions();
    this.logger.log(
      `Initializing Webhook Delivery BullMQ Worker on queue '${WEBHOOK_DELIVERIES_QUEUE_NAME}' (concurrency: 5)...`,
    );

    this.worker = new Worker<DeliveryJobData>(
      WEBHOOK_DELIVERIES_QUEUE_NAME,
      async (job: Job<DeliveryJobData>) => {
        const { deliveryId } = job.data;
        this.logger.debug(
          `Processing webhook delivery job ${job.id} for delivery ${deliveryId}`,
        );

        if (!deliveryId) {
          this.logger.warn(`Job ${job.id} missing deliveryId. Skipping.`);
          return;
        }

        await this.deliveryService.processDelivery(deliveryId);
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(
        `Webhook delivery job ${job.id} completed for delivery ${job.data?.deliveryId}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Webhook delivery job ${job?.id} failed for delivery ${job?.data?.deliveryId}: ${err.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(
        `Webhook Delivery BullMQ Worker encountered an error: ${err.message}`,
      );
    });

    this.isRunning = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      this.logger.log('Closing Webhook Delivery BullMQ Worker gracefully...');
      await this.worker.close();
      this.worker = null;
      this.isRunning = false;
      this.logger.log('Webhook Delivery BullMQ Worker closed successfully');
    }
  }

  /**
   * Health diagnostic check
   */
  isHealthy(): boolean {
    return this.isRunning && this.worker !== null && !this.worker.isPaused();
  }
}
