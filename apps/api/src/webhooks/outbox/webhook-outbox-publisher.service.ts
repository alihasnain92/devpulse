import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WEBHOOK_ATTEMPT_STATUS,
  WEBHOOK_DELIVERIES_QUEUE_NAME,
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_LEASE_CONFIG,
  WEBHOOK_OUTBOX_STATUS,
  WEBHOOK_RETRY_CONFIG,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { getRedisConnectionOptions } from '../../monitoring/queue/queue.constants';

export interface OutboxProcessingSummary {
  processedCount: number;
  enqueuedDeliveries: number;
  errors: number;
}

@Injectable()
export class WebhookOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WebhookOutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private queue: Queue | null = null;
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Start recurring poller every 3 seconds to recover any pending/stale outbox rows and deliveries
    this.timer = setInterval(() => {
      this.publishPending().catch((err: unknown) => {
        this.logger.error(
          `Unhandled error in outbox poller: ${(err as Error).message}`,
        );
      });
    }, 3000);

    this.logger.log(
      'Initialized WebhookOutboxPublisherService with recoverable lease poller (interval: 3000ms)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    this.logger.log('Closed WebhookOutboxPublisherService gracefully');
  }

  /**
   * Lazily gets or initializes the BullMQ delivery queue.
   */
  getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(WEBHOOK_DELIVERIES_QUEUE_NAME, {
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
   * Claims and publishes pending outbox records to BullMQ.
   *
   * Crash Recovery & Lease Management:
   * Selects both PENDING rows available now and stale PROCESSING rows whose
   * claimedAt lease has expired (older than OUTBOX_LEASE_TIMEOUT_MS).
   *
   * Concurrency Safety:
   * Uses `FOR UPDATE SKIP LOCKED` inside a short database transaction to
   * prevent multiple API or worker instances from processing the same row.
   */
  async publishPending(batchSize = 50): Promise<OutboxProcessingSummary> {
    if (this.isProcessing) {
      return { processedCount: 0, enqueuedDeliveries: 0, errors: 0 };
    }

    this.isProcessing = true;
    let processedCount = 0;
    let enqueuedDeliveries = 0;
    let errors = 0;

    try {
      const staleOutboxThreshold = new Date(
        Date.now() - WEBHOOK_LEASE_CONFIG.OUTBOX_LEASE_TIMEOUT_MS,
      );

      // 1. Claim pending or stale-processing outbox rows safely with row-level locks
      const claimedRows = await this.prisma.$transaction(
        async (tx) => {
          const rows: { id: string; eventId: string }[] = await tx.$queryRaw`
            SELECT id, "eventId"
            FROM "webhook_outbox"
            WHERE ("status" = ${WEBHOOK_OUTBOX_STATUS.PENDING} AND "availableAt" <= NOW())
               OR ("status" = ${WEBHOOK_OUTBOX_STATUS.PROCESSING} AND "claimedAt" <= ${staleOutboxThreshold})
            ORDER BY "availableAt" ASC
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          `;

          if (!rows || rows.length === 0) {
            return [];
          }

          // Mark claimed rows as PROCESSING with fresh claimedAt lease timestamp
          const rowIds = rows.map((r) => r.id);
          const now = new Date();
          await tx.webhookOutbox.updateMany({
            where: { id: { in: rowIds } },
            data: {
              status: WEBHOOK_OUTBOX_STATUS.PROCESSING,
              claimedAt: now,
            },
          });

          return rows;
        },
        { timeout: 10000 },
      );

      if (claimedRows.length > 0) {
        this.logger.debug(
          `Claimed ${claimedRows.length} outbox rows for publishing (including recovered stale leases)`,
        );

        const queue = this.getQueue();

        // 2. Process each claimed outbox row
        for (const claimed of claimedRows) {
          processedCount++;

          try {
            const event = await this.prisma.webhookEvent.findUnique({
              where: { id: claimed.eventId },
            });

            if (!event) {
              this.logger.warn(
                `Outbox event ${claimed.eventId} not found. Marking outbox ${claimed.id} as FAILED.`,
              );
              await this.prisma.webhookOutbox.update({
                where: { id: claimed.id },
                data: {
                  status: WEBHOOK_OUTBOX_STATUS.FAILED,
                  claimedAt: null,
                  lastError: 'EVENT_NOT_FOUND',
                },
              });
              continue;
            }

            // 3. Delivery expansion: Find all active (non-deleted) enabled endpoints subscribing to this event type
            const endpoints = await this.prisma.webhookEndpoint.findMany({
              where: {
                userId: event.userId,
                isEnabled: true,
                deletedAt: null,
                events: { has: event.type },
              },
            });

            if (endpoints.length === 0) {
              // No matching subscribed endpoints; outbox item is completed
              await this.prisma.webhookOutbox.update({
                where: { id: claimed.id },
                data: {
                  status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
                  claimedAt: null,
                  queuedAt: new Date(),
                  lastError: null,
                },
              });
              this.logger.debug(
                `Event ${event.id} (${event.type}) has no matching enabled endpoints. Marked outbox completed.`,
              );
              continue;
            }

            // 4. Create WebhookDelivery rows and dispatch BullMQ jobs (Reconciliation & Safe Partial Fanout)
            for (const endpoint of endpoints) {
              // Idempotent delivery creation using origin: AUTOMATIC and (eventId, endpointId)
              let delivery = await this.prisma.webhookDelivery.findFirst({
                where: {
                  eventId: event.id,
                  endpointId: endpoint.id,
                  origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
                },
              });

              if (!delivery) {
                try {
                  delivery = await this.prisma.webhookDelivery.create({
                    data: {
                      eventId: event.id,
                      endpointId: endpoint.id,
                      endpointName: endpoint.name,
                      destinationUrl: endpoint.url,
                      origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
                      status: WEBHOOK_DELIVERY_STATUS.PENDING,
                      attemptCount: 0,
                    },
                  });
                } catch {
                  // Handle possible concurrent creation race
                  delivery = await this.prisma.webhookDelivery.findFirst({
                    where: {
                      eventId: event.id,
                      endpointId: endpoint.id,
                      origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
                    },
                  });
                }
              }

              if (!delivery) {
                continue;
              }

              // Reconciliation: If delivery has already completed, permanently failed, or is in retrying state,
              // it is already safely represented in the delivery lifecycle.
              if (
                delivery.status === WEBHOOK_DELIVERY_STATUS.DELIVERED ||
                delivery.status === WEBHOOK_DELIVERY_STATUS.FAILED ||
                delivery.status === WEBHOOK_DELIVERY_STATUS.RETRYING
              ) {
                this.logger.debug(
                  `Delivery ${delivery.id} already in status '${delivery.status}'. Reconciled without duplicate initial queueing.`,
                );
                continue;
              }

              // Enqueue BullMQ delivery job with deterministic job ID
              const jobId = `webhook-delivery-${delivery.id}`;
              try {
                let jobAlreadyExists = false;
                if (typeof queue.getJob === 'function') {
                  const existingJob = await queue.getJob(jobId);
                  if (existingJob) {
                    jobAlreadyExists = true;
                    this.logger.debug(
                      `Reconciliation: BullMQ job ${jobId} already exists in queue. Reconciled without duplicate enqueue.`,
                    );
                  }
                }

                if (!jobAlreadyExists) {
                  await queue.add(
                    'webhook-delivery',
                    { deliveryId: delivery.id },
                    {
                      jobId,
                      removeOnComplete: 1000,
                      removeOnFail: 5000,
                    },
                  );
                  enqueuedDeliveries++;
                }
              } catch (queueErr: unknown) {
                const msg = (queueErr as Error).message || '';
                if (msg.includes('already exists') || msg.includes('duplicate')) {
                  this.logger.debug(
                    `Reconciliation: BullMQ job ${jobId} duplicate error caught: ${msg}. Reconciled safely.`,
                  );
                } else {
                  throw queueErr;
                }
              }
            }

            // 5. Mark outbox row as COMPLETED upon successful representation of all endpoints
            await this.prisma.webhookOutbox.update({
              where: { id: claimed.id },
              data: {
                status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
                claimedAt: null,
                queuedAt: new Date(),
                lastError: null,
              },
            });

            this.logger.log(
              `Published outbox event ${event.id} (${event.type}): ${endpoints.length} deliveries reconciled/queued`,
            );
          } catch (err: unknown) {
            errors++;
            const errorMsg = (err as Error).message || 'Unknown enqueue error';
            this.logger.error(
              `Failed to publish outbox item ${claimed.id}: ${errorMsg}`,
            );

            // Reschedule outbox row with 5-second backoff so it can be retried
            await this.prisma.webhookOutbox.update({
              where: { id: claimed.id },
              data: {
                status: WEBHOOK_OUTBOX_STATUS.PENDING,
                claimedAt: null,
                attemptCount: { increment: 1 },
                lastError: errorMsg.slice(0, 255),
                availableAt: new Date(Date.now() + 5000),
              },
            });
          }
        }
      }

      // 6. Automatically rescue any deliveries stuck in PROCESSING beyond delivery lease timeout
      await this.recoverStaleDeliveries();

      // 7. Automatically rescue any orphaned PENDING manual replays whose initial enqueue failed
      await this.recoverPendingReplays();
    } catch (err: unknown) {
      this.logger.error(
        `Error executing outbox claim transaction: ${(err as Error).message}`,
      );
    } finally {
      this.isProcessing = false;
    }

    return { processedCount, enqueuedDeliveries, errors };
  }

  /**
   * Rescues deliveries stuck in PROCESSING status due to process crashes or network interruptions.
   *
   * Any delivery in PROCESSING whose claimedAt timestamp is older than DELIVERY_LEASE_TIMEOUT_MS
   * has its stale attempt marked ABANDONED and is either rescheduled for retry or marked FAILED.
   */
  async recoverStaleDeliveries(batchSize = 50): Promise<number> {
    const staleDeliveryThreshold = new Date(
      Date.now() - WEBHOOK_LEASE_CONFIG.DELIVERY_LEASE_TIMEOUT_MS,
    );

    let recovered = 0;
    try {
      const staleDeliveries = await this.prisma.webhookDelivery.findMany({
        where: {
          status: WEBHOOK_DELIVERY_STATUS.PROCESSING,
          claimedAt: { lte: staleDeliveryThreshold },
        },
        take: batchSize,
      });

      if (staleDeliveries.length === 0) {
        return 0;
      }

      this.logger.warn(
        `Detected ${staleDeliveries.length} stale PROCESSING deliveries past lease timeout. Commencing recovery...`,
      );

      const queue = this.getQueue();

      for (const delivery of staleDeliveries) {
        recovered++;
        const now = new Date();

        // 1. Mark any lingering attempt in 'STARTED' status as ABANDONED
        await this.prisma.webhookAttempt.updateMany({
          where: {
            deliveryId: delivery.id,
            outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
          },
          data: {
            outcome: WEBHOOK_ATTEMPT_STATUS.ABANDONED,
            errorCode: 'INTERRUPTED_BY_CRASH_OR_TIMEOUT',
            finishedAt: now,
          },
        });

        // 2. If already exceeded max attempts, terminate with FAILED
        if (delivery.attemptCount >= WEBHOOK_RETRY_CONFIG.MAX_ATTEMPTS) {
          await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: WEBHOOK_DELIVERY_STATUS.FAILED,
              claimedAt: null,
              lastErrorCode: 'EXCEEDED_MAX_ATTEMPTS_AFTER_CRASH',
              nextAttemptAt: null,
            },
          });
          this.logger.warn(
            `Stale delivery ${delivery.id} exceeded max attempts (${delivery.attemptCount}). Marked FAILED.`,
          );
          continue;
        }

        // 3. Otherwise, reset status to RETRYING and re-enqueue BullMQ delayed job
        const retryDelayMs = 5000;
        const nextAttemptAt = new Date(Date.now() + retryDelayMs);

        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WEBHOOK_DELIVERY_STATUS.RETRYING,
            claimedAt: null,
            nextAttemptAt,
            lastErrorCode: 'RECOVERED_FROM_STALE_PROCESSING',
          },
        });

        const retryJobId = `webhook-delivery-${delivery.id}-attempt-${delivery.attemptCount + 1}`;
        try {
          let jobExists = false;
          if (typeof queue.getJob === 'function') {
            const existing = await queue.getJob(retryJobId);
            if (existing) {
              jobExists = true;
            }
          }

          if (!jobExists) {
            await queue.add(
              'webhook-delivery',
              { deliveryId: delivery.id },
              {
                jobId: retryJobId,
                delay: retryDelayMs,
              },
            );
          }
        } catch (queueErr: unknown) {
          this.logger.error(
            `Failed to enqueue recovery retry job for delivery ${delivery.id}: ${(queueErr as Error).message}`,
          );
        }

        this.logger.log(
          `Recovered stale delivery ${delivery.id}: Rescheduled attempt ${delivery.attemptCount + 1} in 5s`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Error during stale delivery recovery: ${(err as Error).message}`,
      );
    }

    return recovered;
  }

  /**
   * Rescues orphaned manual replay deliveries that remain in PENDING status
   * because Redis/BullMQ was temporarily unavailable when the user submitted the replay.
   *
   * Idempotency & Safety:
   * 1. Bounded batch querying of PENDING manual replays.
   * 2. Verifies destination endpoint exists, is not soft-deleted, and is enabled.
   * 3. Checks BullMQ for existing deterministic job ID (webhook-delivery-${delivery.id}-initial).
   * 4. Enqueues missing job without duplication.
   * 5. Catches Redis connection errors gracefully without busy-looping.
   */
  async recoverPendingReplays(batchSize = 50): Promise<number> {
    let recovered = 0;
    try {
      const pendingReplays = await this.prisma.webhookDelivery.findMany({
        where: {
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
          origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        },
        include: { endpoint: true },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingReplays.length === 0) {
        return 0;
      }

      this.logger.debug(
        `Checking ${pendingReplays.length} PENDING manual replays for queue reconciliation...`,
      );

      const queue = this.getQueue();

      for (const delivery of pendingReplays) {
        // 1. Verify endpoint state
        if (!delivery.endpoint || delivery.endpoint.deletedAt) {
          this.logger.warn(
            `Pending replay delivery ${delivery.id} aborted: endpoint was deleted. Marked FAILED.`,
          );
          await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: WEBHOOK_DELIVERY_STATUS.FAILED,
              lastErrorCode: 'ENDPOINT_DELETED',
              nextAttemptAt: null,
            },
          });
          continue;
        }

        if (!delivery.endpoint.isEnabled) {
          this.logger.log(
            `Pending replay delivery ${delivery.id} aborted: endpoint ${delivery.endpoint.id} is disabled. Marked FAILED.`,
          );
          await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: WEBHOOK_DELIVERY_STATUS.FAILED,
              lastErrorCode: 'ENDPOINT_DISABLED',
              nextAttemptAt: null,
            },
          });
          continue;
        }

        // 2. Deterministic job reconciliation
        const jobId = `webhook-delivery-${delivery.id}-initial`;
        let jobExists = false;
        try {
          if (typeof queue.getJob === 'function') {
            const existing = await queue.getJob(jobId);
            if (existing) {
              jobExists = true;
            }
          }

          if (!jobExists) {
            await queue.add(
              'webhook-delivery',
              { deliveryId: delivery.id },
              {
                jobId,
                removeOnComplete: 1000,
                removeOnFail: 5000,
              },
            );
            recovered++;
            this.logger.log(
              `Reconciled orphaned PENDING replay delivery ${delivery.id} into BullMQ queue`,
            );
          }
        } catch (queueErr: unknown) {
          this.logger.error(
            `Failed to reconcile pending replay ${delivery.id} to BullMQ: ${(queueErr as Error).message}. Will retry on next poller tick.`,
          );
          // If Redis is down, break loop to avoid busy-looping on the remaining batch
          break;
        }
      }
    } catch (err: unknown) {
      this.logger.error(
        `Error during pending replay recovery: ${(err as Error).message}`,
      );
    }

    return recovered;
  }
}
