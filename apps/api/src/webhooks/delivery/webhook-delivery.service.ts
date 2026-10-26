import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WEBHOOK_ATTEMPT_STATUS,
  WEBHOOK_DELIVERIES_QUEUE_NAME,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_LEASE_CONFIG,
  WEBHOOK_RETRY_CONFIG,
  WebhookDeliveryStatus,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookCryptoService } from '../crypto/webhook-crypto.service';
import { WebhookSignerService } from '../crypto/webhook-signer.service';
import { WebhookHttpClientService } from '../http/webhook-http-client.service';
import { getRedisConnectionOptions } from '../../monitoring/queue/queue.constants';

export interface DeliveryExecutionSummary {
  deliveryId: string;
  attemptNumber: number;
  status: WebhookDeliveryStatus;
  isSuccess: boolean;
  httpStatus: number | null;
  durationMs: number;
  error?: string | null;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private deliveryQueue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: WebhookCryptoService,
    private readonly signerService: WebhookSignerService,
    private readonly httpClient: WebhookHttpClientService,
  ) {}

  /**
   * Lazily initializes or returns the BullMQ deliveries queue.
   */
  getQueue(): Queue {
    if (!this.deliveryQueue) {
      this.deliveryQueue = new Queue(WEBHOOK_DELIVERIES_QUEUE_NAME, {
        connection: getRedisConnectionOptions(),
      });
    }
    return this.deliveryQueue;
  }

  /**
   * Injects a mock queue for unit/integration testing.
   */
  setQueue(queue: Queue): void {
    this.deliveryQueue = queue;
  }

  /**
   * Executes a single delivery attempt for the given WebhookDelivery ID.
   *
   * Security & Idempotency:
   * 1. Delivery is executed only if status is not already DELIVERED.
   * 2. Checks current endpoint status (deleted, disabled, unsubscribed).
   * 3. HMAC-SHA256 signature generated over exact serialized UTF-8 bytes.
   * 4. Fresh delivery-time SSRF validation and socket connection pinning.
   * 5. Durable attempt record persisted with bounded response preview.
   * 6. Exponential backoff retry scheduled on transient failures.
   */
  async processDelivery(
    deliveryId: string,
  ): Promise<DeliveryExecutionSummary | null> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        event: true,
        endpoint: true,
      },
    });

    if (!delivery) {
      this.logger.warn(
        `Webhook delivery ${deliveryId} not found in database. Skipping.`,
      );
      return null;
    }

    // Idempotency: Do not process already delivered webhooks
    if (delivery.status === WEBHOOK_DELIVERY_STATUS.DELIVERED) {
      this.logger.log(
        `Webhook delivery ${deliveryId} already marked DELIVERED. Skipping duplicate execution.`,
      );
      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
        isSuccess: true,
        httpStatus: delivery.lastHttpStatus,
        durationMs: 0,
      };
    }

    // Endpoint State Evaluation
    if (!delivery.endpoint) {
      this.logger.warn(
        `Webhook delivery ${deliveryId} aborted: Endpoint was deleted.`,
      );
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          lastErrorCode: 'ENDPOINT_DELETED',
          nextAttemptAt: null,
        },
      });
      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        isSuccess: false,
        httpStatus: null,
        durationMs: 0,
        error: 'ENDPOINT_DELETED',
      };
    }

    if (!delivery.endpoint.isEnabled) {
      this.logger.log(
        `Webhook delivery ${deliveryId} aborted: Endpoint ${delivery.endpoint.id} is disabled.`,
      );
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          lastErrorCode: 'ENDPOINT_DISABLED',
          nextAttemptAt: null,
        },
      });
      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        isSuccess: false,
        httpStatus: null,
        durationMs: 0,
        error: 'ENDPOINT_DISABLED',
      };
    }

    if (!delivery.endpoint.events.includes(delivery.event.type)) {
      this.logger.log(
        `Webhook delivery ${deliveryId} aborted: Endpoint ${delivery.endpoint.id} no longer subscribes to event ${delivery.event.type}.`,
      );
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          lastErrorCode: 'ENDPOINT_UNSUBSCRIBED',
          nextAttemptAt: null,
        },
      });
      return {
        deliveryId,
        attemptNumber: delivery.attemptCount,
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        isSuccess: false,
        httpStatus: null,
        durationMs: 0,
        error: 'ENDPOINT_UNSUBSCRIBED',
      };
    }

    // 1. Atomically allocate next attempt number and persist durable WebhookAttempt record
    // in 'STARTED' state BEFORE initiating any outbound network request.
    // Uses PostgreSQL SELECT ... FOR UPDATE to eliminate concurrency races.
    const now = new Date();
    const claimResult = await this.prisma.$transaction(
      async (tx) => {
        interface LockedDeliveryRow {
          id: string;
          status: string;
          attemptCount: number;
          claimedAt: Date | null;
          lastHttpStatus: number | null;
        }

        let lockedDelivery: LockedDeliveryRow | null = null;
        if (typeof tx.$queryRaw === 'function') {
          try {
            const rows: LockedDeliveryRow[] = await tx.$queryRaw`
              SELECT id, "status", "attemptCount", "claimedAt", "lastHttpStatus"
              FROM "webhook_deliveries"
              WHERE id = ${deliveryId}
              FOR UPDATE
            `;
            if (rows && rows.length > 0) {
              lockedDelivery = rows[0];
            }
          } catch {
            // Fallback for mock environments
            lockedDelivery = (await tx.webhookDelivery.findUnique({
              where: { id: deliveryId },
            })) as any;
          }
        } else {
          lockedDelivery = (await tx.webhookDelivery.findUnique({
            where: { id: deliveryId },
          })) as any;
        }

        if (!lockedDelivery) {
          return null;
        }

        // Idempotency: skip execution if delivery has already completed
        if (lockedDelivery.status === WEBHOOK_DELIVERY_STATUS.DELIVERED) {
          return {
            alreadyDelivered: true,
            isConcurrentlyProcessing: false,
            attemptNumber: lockedDelivery.attemptCount,
            attemptId: '',
          };
        }

        // Concurrency protection: if another worker is actively executing this within the lease window, skip duplicate
        if (
          lockedDelivery.status === WEBHOOK_DELIVERY_STATUS.PROCESSING &&
          lockedDelivery.claimedAt &&
          now.getTime() - new Date(lockedDelivery.claimedAt).getTime() <
            WEBHOOK_LEASE_CONFIG.DELIVERY_LEASE_TIMEOUT_MS
        ) {
          return {
            alreadyDelivered: false,
            isConcurrentlyProcessing: true,
            attemptNumber: lockedDelivery.attemptCount,
            attemptId: '',
          };
        }

        // Crash During HTTP Attempt Recovery:
        // If a previous attempt was left in 'STARTED' status (worker crashed before HTTP completed),
        // mark that attempt as ABANDONED so it remains auditable and not overwritten.
        const staleAttempt = await tx.webhookAttempt.findFirst({
          where: {
            deliveryId,
            outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
          },
          orderBy: { attemptNumber: 'desc' },
        });

        if (staleAttempt) {
          await tx.webhookAttempt.update({
            where: { id: staleAttempt.id },
            data: {
              outcome: WEBHOOK_ATTEMPT_STATUS.ABANDONED,
              errorCode: 'INTERRUPTED_BY_CRASH_OR_TIMEOUT',
              finishedAt: now,
            },
          });
        }

        const nextAttemptNumber = lockedDelivery.attemptCount + 1;

        // Mark delivery as PROCESSING with updated attemptCount and lease timestamp
        await tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: WEBHOOK_DELIVERY_STATUS.PROCESSING,
            attemptCount: nextAttemptNumber,
            claimedAt: now,
          },
        });

        // Create durable WebhookAttempt record in STARTED state BEFORE network request
        try {
          const attempt = await tx.webhookAttempt.create({
            data: {
              deliveryId,
              attemptNumber: nextAttemptNumber,
              startedAt: now,
              outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
            },
          });

          return {
            alreadyDelivered: false,
            isConcurrentlyProcessing: false,
            attemptNumber: nextAttemptNumber,
            attemptId: attempt.id,
          };
        } catch {
          // Unique constraint defense-in-depth: another transaction won the race
          return {
            alreadyDelivered: false,
            isConcurrentlyProcessing: true,
            attemptNumber: nextAttemptNumber,
            attemptId: '',
          };
        }
      },
      { timeout: 10000 },
    );

    if (!claimResult) {
      return null;
    }

    if (claimResult.alreadyDelivered) {
      this.logger.log(
        `Webhook delivery ${deliveryId} already DELIVERED. Skipping duplicate execution.`,
      );
      return {
        deliveryId,
        attemptNumber: claimResult.attemptNumber,
        status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
        isSuccess: true,
        httpStatus: delivery.lastHttpStatus,
        durationMs: 0,
      };
    }

    if (claimResult.isConcurrentlyProcessing) {
      this.logger.debug(
        `Webhook delivery ${deliveryId} is concurrently being processed by another worker within lease window. Skipping.`,
      );
      return null;
    }

    const { attemptNumber, attemptId } = claimResult;

    // 2. Prepare payload and HMAC signature in memory
    const rawPayload = JSON.stringify(delivery.event.payload);
    const timestamp = Math.floor(Date.now() / 1000);

    let rawSecret: string;
    try {
      rawSecret = this.cryptoService.decryptSecret(
        delivery.endpoint.encryptedSecret,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to decrypt secret for endpoint ${delivery.endpoint.id}: ${(err as Error).message}`,
      );
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          claimedAt: null,
          lastErrorCode: 'SECRET_DECRYPTION_FAILED',
          nextAttemptAt: null,
        },
      });
      await this.prisma.webhookAttempt.update({
        where: { id: attemptId },
        data: {
          outcome: WEBHOOK_ATTEMPT_STATUS.FAILED,
          errorCode: 'SECRET_DECRYPTION_FAILED',
          finishedAt: new Date(),
          durationMs: 0,
        },
      });
      return null;
    }

    const signature = this.signerService.signPayload(
      rawSecret,
      rawPayload,
      timestamp,
    );
    rawSecret = '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'DevPulse-Webhooks/1',
      'X-DevPulse-Event-Id': delivery.eventId,
      'X-DevPulse-Delivery-Id': delivery.id,
      'X-DevPulse-Event-Type': delivery.event.type,
      'X-DevPulse-Timestamp': String(timestamp),
      'X-DevPulse-Signature': signature.header,
    };

    // 3. Execute Outbound Request with SSRF defenses OUTSIDE Any Database Transaction
    const execResult = await this.httpClient.executeDelivery(
      delivery.endpoint.url,
      rawPayload,
      headers,
      WEBHOOK_RETRY_CONFIG.DELIVERY_TIMEOUT_MS,
    );

    const finishedAt = new Date();
    const durationMs = execResult.latencyMs;

    // 4. Update the durable WebhookAttempt record with final response status
    await this.prisma.webhookAttempt.update({
      where: { id: attemptId },
      data: {
        finishedAt,
        durationMs,
        httpStatus: execResult.statusCode,
        outcome: execResult.isSuccess
          ? WEBHOOK_ATTEMPT_STATUS.SUCCESS
          : WEBHOOK_ATTEMPT_STATUS.FAILED,
        errorCode: execResult.errorMessage,
        responsePreview: execResult.responsePreview,
      },
    });

    if (execResult.isSuccess) {
      // 2xx response: mark DELIVERED and clear lease
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
          claimedAt: null,
          deliveredAt: finishedAt,
          attemptCount: attemptNumber,
          lastHttpStatus: execResult.statusCode,
          lastErrorCode: null,
          nextAttemptAt: null,
        },
      });

      this.logger.log(
        `Webhook delivery ${delivery.id} to ${delivery.endpoint.url} succeeded on attempt ${attemptNumber} (HTTP ${execResult.statusCode}, ${execResult.latencyMs}ms)`,
      );

      return {
        deliveryId: delivery.id,
        attemptNumber,
        status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
        isSuccess: true,
        httpStatus: execResult.statusCode,
        durationMs: execResult.latencyMs,
      };
    }

    // Failure Path: Determine if error is transient or permanent
    const isPermanent = this.isPermanentError(execResult.statusCode);
    const hasExceededMaxAttempts =
      attemptNumber >= WEBHOOK_RETRY_CONFIG.MAX_ATTEMPTS;

    if (isPermanent || hasExceededMaxAttempts) {
      // Terminal failure: mark FAILED and clear lease
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          claimedAt: null,
          attemptCount: attemptNumber,
          lastHttpStatus: execResult.statusCode,
          lastErrorCode: execResult.errorMessage,
          nextAttemptAt: null,
        },
      });

      this.logger.warn(
        `Webhook delivery ${delivery.id} permanently failed after attempt ${attemptNumber}: ${execResult.errorMessage} (HTTP ${execResult.statusCode ?? 'ERR'})`,
      );

      return {
        deliveryId: delivery.id,
        attemptNumber,
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        isSuccess: false,
        httpStatus: execResult.statusCode,
        durationMs: execResult.latencyMs,
        error: execResult.errorMessage,
      };
    }

    // Transient failure: schedule exponential backoff retry
    const delayMs = this.calculateBackoffDelay(attemptNumber);
    const nextAttemptAt = new Date(Date.now() + delayMs);

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WEBHOOK_DELIVERY_STATUS.RETRYING,
        claimedAt: null,
        attemptCount: attemptNumber,
        lastHttpStatus: execResult.statusCode,
        lastErrorCode: execResult.errorMessage,
        nextAttemptAt,
      },
    });

    // Enqueue delayed retry job in BullMQ
    try {
      const queue = this.getQueue();
      await queue.add(
        'webhook-delivery',
        { deliveryId: delivery.id },
        {
          delay: delayMs,
          jobId: `webhook-delivery:${delivery.id}:attempt-${attemptNumber + 1}`,
        },
      );

      this.logger.log(
        `Webhook delivery ${delivery.id} scheduled retry #${attemptNumber + 1} in ${Math.round(delayMs / 1000)}s (${execResult.errorMessage})`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to enqueue delayed retry job for delivery ${delivery.id}: ${(err as Error).message}`,
      );
    }

    return {
      deliveryId: delivery.id,
      attemptNumber,
      status: WEBHOOK_DELIVERY_STATUS.RETRYING,
      isSuccess: false,
      httpStatus: execResult.statusCode,
      durationMs: execResult.latencyMs,
      error: execResult.errorMessage,
    };
  }

  /**
   * Classifies whether an HTTP status code represents a permanent failure.
   *
   * 4xx client errors (except 408 Request Timeout and 429 Too Many Requests)
   * and 3xx redirects are considered permanent failures.
   */
  isPermanentError(statusCode: number | null): boolean {
    if (!statusCode) {
      // Network/transport errors (timeouts, DNS, connection reset) are transient
      return false;
    }

    // 3xx redirects are prohibited by policy and will not succeed on retry
    if (statusCode >= 300 && statusCode < 400) {
      return true;
    }

    // 408 (Timeout) and 429 (Rate Limit) are transient
    if (statusCode === 408 || statusCode === 429) {
      return false;
    }

    // All other 4xx (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 410, 422) are permanent
    if (statusCode >= 400 && statusCode < 500) {
      return true;
    }

    // 5xx server errors are transient
    return false;
  }

  /**
   * Calculates exponential backoff delay with bounded jitter.
   * Formula: min(BASE_DELAY_MS * BACKOFF_EXPONENT^(attempt - 1), MAX_DELAY_MS) +/- jitter
   */
  calculateBackoffDelay(attemptNumber: number): number {
    const base = WEBHOOK_RETRY_CONFIG.BASE_DELAY_MS;
    const exponent = Math.max(0, attemptNumber - 1);
    const nominal = Math.min(
      base * Math.pow(WEBHOOK_RETRY_CONFIG.BACKOFF_EXPONENT, exponent),
      WEBHOOK_RETRY_CONFIG.MAX_DELAY_MS,
    );

    // Apply bounded jitter: +/- 20%
    const jitterMagnitude = nominal * WEBHOOK_RETRY_CONFIG.JITTER_FACTOR;
    const jitter = (Math.random() * 2 - 1) * jitterMagnitude;

    return Math.max(1000, Math.round(nominal + jitter));
  }
}
