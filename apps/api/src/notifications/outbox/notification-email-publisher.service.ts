import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  NOTIFICATION_EMAIL_LEASE_CONFIG,
  NOTIFICATION_EMAIL_OUTBOX_STATUS,
  NOTIFICATION_EMAIL_QUEUE_NAME,
  NOTIFICATION_EMAIL_RETRY_CONFIG,
  NOTIFICATION_EMAIL_STATUS,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { getRedisConnectionOptions } from '../../monitoring/queue/queue.constants';

export interface EmailOutboxProcessingSummary {
  processedCount: number;
  enqueuedEmails: number;
  errors: number;
}

@Injectable()
export class NotificationEmailPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEmailPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private queue: Queue | null = null;
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.publishPending().catch((err: unknown) => {
        this.logger.error(
          `Unhandled error in email outbox poller: ${(err as Error).message}`,
        );
      });
    }, 3000);

    this.logger.log(
      'Initialized NotificationEmailPublisherService with recoverable lease poller (interval: 3000ms)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.queue) {
      if (typeof this.queue.close === 'function') {
        await this.queue.close();
      }
      this.queue = null;
    }
    this.logger.log('Closed NotificationEmailPublisherService gracefully');
  }

  /**
   * Lazily gets or initializes the BullMQ email queue.
   */
  getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(NOTIFICATION_EMAIL_QUEUE_NAME, {
        connection: getRedisConnectionOptions(),
      });
    }
    return this.queue;
  }

  /**
   * Injects a mock queue for unit and integration testing.
   */
  setQueue(queue: Queue): void {
    this.queue = queue;
  }

  /**
   * Claims and publishes pending email outbox records to BullMQ.
   */
  async publishPending(batchSize = 50): Promise<EmailOutboxProcessingSummary> {
    if (this.isProcessing) {
      return { processedCount: 0, enqueuedEmails: 0, errors: 0 };
    }

    this.isProcessing = true;
    let processedCount = 0;
    let enqueuedEmails = 0;
    let errors = 0;

    try {
      // 1. Recover stale PROCESSING deliveries if any worker crashed
      await this.recoverStaleDeliveries();

      // 2. Query eligible outbox rows (PENDING available now OR stale PROCESSING whose lease expired)
      const now = new Date();
      const leaseThreshold = new Date(
        now.getTime() - NOTIFICATION_EMAIL_LEASE_CONFIG.OUTBOX_LEASE_TIMEOUT_MS,
      );

      const candidateRows = await this.prisma.notificationEmailOutbox.findMany({
        where: {
          OR: [
            {
              status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
              availableAt: { lte: now },
            },
            {
              status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PROCESSING,
              claimedAt: { lt: leaseThreshold },
            },
          ],
        },
        orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
        take: batchSize,
      });

      if (candidateRows.length === 0) {
        return { processedCount: 0, enqueuedEmails: 0, errors: 0 };
      }

      const queue = this.getQueue();

      for (const candidate of candidateRows) {
        // Claim the row with lease
        const claimed = await this.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string; deliveryId: string }>>`
            SELECT id, "deliveryId"
            FROM notification_email_outbox
            WHERE id = ${candidate.id}
              AND (
                status = ${NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING}
                OR (status = ${NOTIFICATION_EMAIL_OUTBOX_STATUS.PROCESSING} AND "claimedAt" < ${leaseThreshold})
              )
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          `;

          if (!rows || rows.length === 0) {
            return null;
          }

          return tx.notificationEmailOutbox.update({
            where: { id: rows[0].id },
            data: {
              status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PROCESSING,
              claimedAt: new Date(),
            },
          });
        });

        if (!claimed) {
          continue;
        }

        processedCount++;

        try {
          const delivery = await this.prisma.notificationEmailDelivery.findUnique({
            where: { id: claimed.deliveryId },
          });

          if (!delivery) {
            this.logger.warn(
              `Delivery ${claimed.deliveryId} missing for outbox ${claimed.id}. Marking COMPLETED.`,
            );
            await this.prisma.notificationEmailOutbox.update({
              where: { id: claimed.id },
              data: {
                status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
                claimedAt: null,
                lastError: 'Delivery record not found',
              },
            });
            continue;
          }

          if (
            delivery.status === NOTIFICATION_EMAIL_STATUS.DELIVERED ||
            delivery.status === NOTIFICATION_EMAIL_STATUS.FAILED
          ) {
            await this.prisma.notificationEmailOutbox.update({
              where: { id: claimed.id },
              data: {
                status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
                claimedAt: null,
                lastError: null,
              },
            });
            continue;
          }

          // Enqueue BullMQ job
          const jobId = `notification-email-${delivery.id}`;
          try {
            let jobAlreadyExists = false;
            if (typeof queue.getJob === 'function') {
              const existingJob = await queue.getJob(jobId);
              if (existingJob) {
                jobAlreadyExists = true;
              }
            }

            if (!jobAlreadyExists) {
              await queue.add(
                'send-email',
                { deliveryId: delivery.id },
                {
                  jobId,
                  removeOnComplete: 1000,
                  removeOnFail: 5000,
                },
              );
              enqueuedEmails++;
            }
          } catch (queueErr: unknown) {
            const msg = (queueErr as Error).message || '';
            if (!msg.includes('already exists') && !msg.includes('duplicate')) {
              throw queueErr;
            }
          }

          // Mark outbox row as COMPLETED
          await this.prisma.notificationEmailOutbox.update({
            where: { id: claimed.id },
            data: {
              status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
              claimedAt: null,
              lastError: null,
            },
          });
        } catch (err: unknown) {
          errors++;
          const errorMsg = (err as Error).message || 'Unknown enqueue error';
          this.logger.error(
            `Failed to publish email outbox item ${claimed.id}: ${errorMsg}`,
          );

          await this.prisma.notificationEmailOutbox.update({
            where: { id: claimed.id },
            data: {
              status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
              claimedAt: null,
              attemptCount: { increment: 1 },
              lastError: errorMsg.slice(0, 255),
              availableAt: new Date(Date.now() + 5000),
            },
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processedCount, enqueuedEmails, errors };
  }

  /**
   * Recovers stale PROCESSING deliveries if a worker died without completing.
   *
   * DevPulse email notifications provide durable at-least-once delivery.
   * A rare duplicate email may occur when the SMTP server accepts a message
   * but DevPulse crashes before persisting the successful result.
   */
  async recoverStaleDeliveries(): Promise<number> {
    const deliveryThreshold = new Date(
      Date.now() - NOTIFICATION_EMAIL_LEASE_CONFIG.DELIVERY_LEASE_TIMEOUT_MS,
    );

    const staleDeliveries = await this.prisma.notificationEmailDelivery.findMany({
      where: {
        status: NOTIFICATION_EMAIL_STATUS.PROCESSING,
        claimedAt: { lt: deliveryThreshold },
      },
      take: 20,
    });

    let recovered = 0;
    for (const d of staleDeliveries) {
      if (d.attemptCount >= NOTIFICATION_EMAIL_RETRY_CONFIG.MAX_ATTEMPTS) {
        await this.prisma.notificationEmailDelivery.update({
          where: { id: d.id },
          data: {
            status: NOTIFICATION_EMAIL_STATUS.FAILED,
            claimedAt: null,
            nextAttemptAt: null,
            lastErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
            lastErrorMessage: 'Max retry attempts exceeded after stale lease timeout',
          },
        });
        continue;
      }

      await this.prisma.notificationEmailDelivery.update({
        where: { id: d.id },
        data: {
          status: NOTIFICATION_EMAIL_STATUS.RETRYING,
          claimedAt: null,
          nextAttemptAt: new Date(),
          lastErrorCode: 'STALE_LEASE_RECOVERED',
          lastErrorMessage: 'Recovered from stale PROCESSING lease timeout',
        },
      });

      // Re-enqueue for processing
      try {
        const queue = this.getQueue();
        await queue.add(
          'send-email',
          { deliveryId: d.id },
          {
            jobId: `notification-email-${d.id}-recovered-${Date.now()}`,
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
        recovered++;
      } catch (err) {
        this.logger.warn(
          `Failed to re-enqueue recovered delivery ${d.id}: ${(err as Error).message}`,
        );
      }
    }

    if (recovered > 0) {
      this.logger.warn(`Recovered ${recovered} stale email deliveries`);
    }

    return recovered;
  }
}
