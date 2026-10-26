import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import {
  DEMO_CONFIG,
  NOTIFICATION_EMAIL_QUEUE_NAME,
  NOTIFICATION_EMAIL_RETRY_CONFIG,
  NOTIFICATION_EMAIL_STATUS,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { getRedisConnectionOptions } from '../../monitoring/queue/queue.constants';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../email/email-provider.interface';

interface EmailJobData {
  deliveryId: string;
}

export interface EmailWorkerExecutionSummary {
  deliveryId: string;
  attemptNumber: number;
  success: boolean;
  status: string;
  error?: string | null;
  bypassed?: boolean;
}

@Injectable()
export class NotificationEmailWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEmailWorkerService.name);
  private worker: Worker<EmailJobData> | null = null;
  private queue: Queue | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private emailProvider: EmailProvider,
  ) {}

  onModuleInit(): void {
    const connection = getRedisConnectionOptions();
    this.logger.log(
      `Initializing Notification Email BullMQ Worker on queue '${NOTIFICATION_EMAIL_QUEUE_NAME}' (concurrency: 5)...`,
    );

    this.worker = new Worker<EmailJobData>(
      NOTIFICATION_EMAIL_QUEUE_NAME,
      async (job: Job<EmailJobData>) => {
        const { deliveryId } = job.data;
        if (!deliveryId) {
          this.logger.warn(`Job ${job.id} missing deliveryId. Skipping.`);
          return;
        }

        await this.processDelivery(deliveryId);
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(
        `Email delivery job ${job.id} completed for delivery ${job.data?.deliveryId}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Email delivery job ${job?.id} failed for delivery ${job?.data?.deliveryId}: ${err.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(
        `Notification Email Worker error: ${err.message}`,
      );
    });

    this.isRunning = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      if (typeof this.worker.close === 'function') {
        await this.worker.close();
      }
      this.worker = null;
    }
    if (this.queue) {
      if (typeof this.queue.close === 'function') {
        await this.queue.close();
      }
      this.queue = null;
    }
    this.isRunning = false;
    this.logger.log('Notification Email BullMQ Worker closed gracefully');
  }

  /**
   * Lazily gets or initializes the BullMQ email queue for retries.
   */
  getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(NOTIFICATION_EMAIL_QUEUE_NAME, {
        connection: getRedisConnectionOptions(),
      });
    }
    return this.queue;
  }

  setEmailProvider(provider: EmailProvider): void {
    this.emailProvider = provider;
  }

  setQueue(queue: Queue): void {
    this.queue = queue;
  }

  isHealthy(): boolean {
    return this.isRunning && this.worker !== null && !this.worker.isPaused();
  }

  /**
   * Executes email delivery attempt with retry backoff and demo account bypass.
   */
  async processDelivery(
    deliveryId: string,
  ): Promise<EmailWorkerExecutionSummary | null> {
    const delivery = await this.prisma.notificationEmailDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      this.logger.warn(`Email delivery ${deliveryId} not found in database.`);
      return null;
    }

    // Idempotency: Skip already delivered when earlier execution successfully committed DELIVERED.
    // Note: DevPulse email notifications provide durable at-least-once delivery.
    // A rare duplicate email may occur when the SMTP server accepts a message but DevPulse
    // crashes before persisting the successful result. This status check prevents duplicates
    // only when the successful state update was already committed prior to duplicate invocation.
    if (delivery.status === NOTIFICATION_EMAIL_STATUS.DELIVERED) {
      this.logger.log(
        `Email delivery ${deliveryId} already DELIVERED. Skipping duplicate execution.`,
      );
      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        success: true,
        status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
      };
    }

    // Demo user bypass: avoid real SMTP calls for demo user
    if (delivery.toEmail === DEMO_CONFIG.DEMO_USER_EMAIL) {
      this.logger.log(
        `Bypassing real SMTP for demo account (${delivery.toEmail}). Marking delivery ${deliveryId} DELIVERED.`,
      );

      await this.prisma.notificationEmailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
          deliveredAt: new Date(),
          claimedAt: null,
          nextAttemptAt: null,
          lastErrorCode: 'DEMO_SIMULATION',
          lastErrorMessage: 'Simulated delivery for demo account (SMTP bypassed)',
        },
      });

      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        success: true,
        status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
        bypassed: true,
      };
    }

    // Mark PROCESSING
    const currentAttempt = delivery.attemptCount + 1;
    await this.prisma.notificationEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NOTIFICATION_EMAIL_STATUS.PROCESSING,
        claimedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    // Send email via provider
    const sendResult = await this.emailProvider.send({
      to: delivery.toEmail,
      subject: delivery.subject,
      text: delivery.bodyText,
      html: delivery.bodyHtml,
    });

    if (sendResult.success) {
      await this.prisma.notificationEmailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
          deliveredAt: new Date(),
          claimedAt: null,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      this.logger.log(
        `Email delivery ${deliveryId} to ${delivery.toEmail} successfully delivered`,
      );

      return {
        deliveryId,
        attemptNumber: currentAttempt,
        success: true,
        status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
      };
    }

    // Handle failure
    const errorCode = sendResult.error?.code || 'SEND_FAILED';
    const errorMessage = sendResult.error?.message || 'Email delivery failed';
    const isPermanent =
      errorCode === 'EMAIL_PROVIDER_NOT_CONFIGURED' ||
      currentAttempt >= NOTIFICATION_EMAIL_RETRY_CONFIG.MAX_ATTEMPTS;

    if (isPermanent) {
      await this.prisma.notificationEmailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NOTIFICATION_EMAIL_STATUS.FAILED,
          claimedAt: null,
          nextAttemptAt: null,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage.slice(0, 255),
        },
      });

      this.logger.warn(
        `Email delivery ${deliveryId} permanently failed on attempt ${currentAttempt}: [${errorCode}] ${errorMessage}`,
      );

      return {
        deliveryId,
        attemptNumber: currentAttempt,
        success: false,
        status: NOTIFICATION_EMAIL_STATUS.FAILED,
        error: errorMessage,
      };
    }

    // Retryable failure: calculate exponential backoff with jitter
    const baseDelay = NOTIFICATION_EMAIL_RETRY_CONFIG.BASE_DELAY_MS;
    const exponent = Math.pow(
      NOTIFICATION_EMAIL_RETRY_CONFIG.BACKOFF_EXPONENT,
      currentAttempt - 1,
    );
    const nominalDelay = Math.min(
      baseDelay * exponent,
      NOTIFICATION_EMAIL_RETRY_CONFIG.MAX_DELAY_MS,
    );

    const jitter =
      nominalDelay *
      NOTIFICATION_EMAIL_RETRY_CONFIG.JITTER_FACTOR *
      (Math.random() * 2 - 1);
    const finalDelayMs = Math.max(1000, Math.round(nominalDelay + jitter));
    const nextAttemptAt = new Date(Date.now() + finalDelayMs);

    await this.prisma.notificationEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NOTIFICATION_EMAIL_STATUS.RETRYING,
        claimedAt: null,
        nextAttemptAt,
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage.slice(0, 255),
      },
    });

    this.logger.log(
      `Email delivery ${deliveryId} scheduled retry ${currentAttempt + 1} in ${finalDelayMs}ms`,
    );

    // Enqueue delayed job to BullMQ
    try {
      const queue = this.getQueue();
      await queue.add(
        'send-email',
        { deliveryId },
        {
          delay: finalDelayMs,
          jobId: `notification-email-${deliveryId}-retry-${currentAttempt}`,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to enqueue delayed retry job for delivery ${deliveryId}: ${(err as Error).message}`,
      );
    }

    return {
      deliveryId,
      attemptNumber: currentAttempt,
      success: false,
      status: NOTIFICATION_EMAIL_STATUS.RETRYING,
      error: errorMessage,
    };
  }
}
