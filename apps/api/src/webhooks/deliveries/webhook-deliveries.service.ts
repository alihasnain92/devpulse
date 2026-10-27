import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PaginatedWebhookDeliveriesDto,
  RATE_LIMIT_POLICIES,
  ReplayWebhookDeliveryResponseDto,
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_PAGINATION_CONFIG,
  WEBHOOK_RETRY_CONFIG,
  WebhookAttemptDto,
  WebhookAttemptStatus,
  WebhookDeliveryDetailDto,
  WebhookDeliveryDto,
  WebhookDeliveryOrigin,
  WebhookDeliveryStatus,
  WebhookEventPayload,
  WebhookEventType,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';
import { RateLimiterService } from '../../rate-limiting/rate-limiter.service';
import { QueryWebhookDeliveriesDto } from './dto/query-deliveries.dto';

interface DeliveryRecordWithEvent {
  id: string;
  eventId: string;
  endpointId: string;
  endpointName: string;
  destinationUrl: string;
  origin: string;
  replayOfId: string | null;
  status: string;
  attemptCount: number;
  claimedAt: Date | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  lastHttpStatus: number | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  event?: {
    type: string;
  };
}

@Injectable()
export class WebhookDeliveriesService {
  private readonly logger = new Logger(WebhookDeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: WebhookDeliveryService,
    @Optional()
    private readonly rateLimiterService?: RateLimiterService,
  ) {}

  /**
   * Lists historical webhook deliveries for the authenticated user with cursor pagination & filtering.
   */
  async findAll(
    userId: string,
    query: QueryWebhookDeliveriesDto,
  ): Promise<PaginatedWebhookDeliveriesDto> {
    const limit = Math.min(
      Math.max(query.limit ?? WEBHOOK_PAGINATION_CONFIG.DEFAULT_LIMIT, 1),
      WEBHOOK_PAGINATION_CONFIG.MAX_LIMIT,
    );

    const where: any = {
      event: {
        userId,
        ...(query.eventType ? { type: query.eventType } : {}),
      },
      ...(query.endpointId ? { endpointId: query.endpointId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
    };

    // If cursor provided, fetch items before/after cursor based on id
    const findManyArgs: any = {
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        event: {
          select: {
            type: true,
          },
        },
      },
    };

    if (query.cursor) {
      findManyArgs.cursor = { id: query.cursor };
      findManyArgs.skip = 1;
    }

    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany(findManyArgs),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((row) =>
        this.formatDelivery(row as unknown as DeliveryRecordWithEvent),
      ),
      nextCursor,
      hasMore,
      total,
    };
  }

  /**
   * Retrieves full delivery details, safe event payload, and current vs snapshot endpoint status.
   */
  async findOne(userId: string, id: string): Promise<WebhookDeliveryDetailDto> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: {
        id,
        event: { userId },
      },
      include: {
        event: true,
        endpoint: true,
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException(`Webhook delivery with ID '${id}' not found`);
    }

    const latestAttemptRecord = delivery.attempts[0];
    const latestAttempt: WebhookAttemptDto | null = latestAttemptRecord
      ? {
          id: latestAttemptRecord.id,
          deliveryId: latestAttemptRecord.deliveryId,
          attemptNumber: latestAttemptRecord.attemptNumber,
          startedAt: latestAttemptRecord.startedAt.toISOString(),
          finishedAt: latestAttemptRecord.finishedAt
            ? latestAttemptRecord.finishedAt.toISOString()
            : null,
          durationMs: latestAttemptRecord.durationMs,
          httpStatus: latestAttemptRecord.httpStatus,
          outcome: latestAttemptRecord.outcome as WebhookAttemptStatus,
          errorCode: latestAttemptRecord.errorCode,
          responsePreview: this.sanitizePreview(
            latestAttemptRecord.responsePreview,
          ),
          createdAt: latestAttemptRecord.createdAt.toISOString(),
        }
      : null;

    return {
      ...this.formatDelivery({
        ...delivery,
        event: { type: delivery.event.type },
      }),
      currentEndpoint: delivery.endpoint
        ? {
            id: delivery.endpoint.id,
            name: delivery.endpoint.name,
            url: delivery.endpoint.url,
            isEnabled: delivery.endpoint.isEnabled,
            isDeleted: !!delivery.endpoint.deletedAt,
          }
        : null,
      event: {
        id: delivery.event.id,
        type: delivery.event.type as WebhookEventType,
        sourceType: delivery.event.sourceType,
        sourceId: delivery.event.sourceId,
        payload: delivery.event.payload as unknown as WebhookEventPayload,
        createdAt: delivery.event.createdAt.toISOString(),
      },
      latestAttempt,
    };
  }

  /**
   * Returns the chronological attempt timeline for a specific delivery.
   */
  async getAttempts(
    userId: string,
    deliveryId: string,
  ): Promise<WebhookAttemptDto[]> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: {
        id: deliveryId,
        event: { userId },
      },
      select: { id: true },
    });

    if (!delivery) {
      throw new NotFoundException(
        `Webhook delivery with ID '${deliveryId}' not found`,
      );
    }

    const attempts = await this.prisma.webhookAttempt.findMany({
      where: { deliveryId },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map((a) => ({
      id: a.id,
      deliveryId: a.deliveryId,
      attemptNumber: a.attemptNumber,
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt ? a.finishedAt.toISOString() : null,
      durationMs: a.durationMs,
      httpStatus: a.httpStatus,
      outcome: a.outcome as WebhookAttemptStatus,
      errorCode: a.errorCode,
      responsePreview: this.sanitizePreview(a.responsePreview),
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Triggers a manual replay for a previous delivery.
   *
   * Replay Guarantees:
   * 1. Requires Idempotency-Key to prevent duplicate replay storms.
   * 2. Checks target endpoint is active and not soft-deleted.
   * 3. Creates new WebhookDelivery with origin: MANUAL_REPLAY, snapshotting CURRENT endpoint URL & name.
   * 4. Preserves exact original WebhookEvent.payload and X-DevPulse-Event-Id.
   * 5. Allocates fresh X-DevPulse-Delivery-Id and HMAC signature.
   * 6. Durable queueing with background crash lease fallback.
   */
  async replay(
    userId: string,
    deliveryId: string,
    idempotencyKey?: string,
  ): Promise<ReplayWebhookDeliveryResponseDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException(
        "Header 'Idempotency-Key' is required for manual replay requests",
      );
    }

    const trimmedKey = idempotencyKey.trim();
    if (trimmedKey.length > 255) {
      throw new BadRequestException(
        "Header 'Idempotency-Key' exceeds maximum length of 255 characters",
      );
    }

    // Deterministic SHA-256 hash scoped to tenant, avoiding storage of raw opaque client keys
    const idempotencyHash = crypto
      .createHash('sha256')
      .update(`replay:${userId}:${trimmedKey}`)
      .digest('hex');

    // 1. Check for existing replay request with the same idempotency key
    const existingReplay = await this.prisma.webhookDelivery.findFirst({
      where: { replayIdempotencyKey: idempotencyHash },
      include: { event: { select: { type: true } } },
    });

    if (existingReplay) {
      this.logger.log(
        `Idempotent replay match for hash '${idempotencyHash.slice(0, 16)}...' -> delivery '${existingReplay.id}'`,
      );
      const formatted = this.formatDelivery(
        existingReplay as unknown as DeliveryRecordWithEvent,
      );
      return {
        message: 'Webhook replay already accepted (idempotent)',
        originalDeliveryId: deliveryId,
        replayDelivery: formatted,
        delivery: formatted,
        isIdempotent: true,
      };
    }

    // 2. Fetch original delivery and verify tenant ownership
    const original = await this.prisma.webhookDelivery.findFirst({
      where: {
        id: deliveryId,
        event: { userId },
      },
      include: {
        event: true,
        endpoint: true,
      },
    });

    if (!original) {
      throw new NotFoundException(
        `Webhook delivery with ID '${deliveryId}' not found`,
      );
    }

    // 3. Verify endpoint health and deletion state
    if (!original.endpoint || original.endpoint.deletedAt) {
      throw new ConflictException(
        'Cannot replay delivery: Webhook endpoint has been deleted',
      );
    }

    if (!original.endpoint.isEnabled) {
      throw new ConflictException(
        'Cannot replay delivery: Webhook endpoint is currently disabled. Enable the endpoint before replaying.',
      );
    }

    // 4. Atomic rate limiting check (user quota + delivery quota without partial consumption)
    if (this.rateLimiterService) {
      const replayRes = await this.rateLimiterService.checkMultiRateLimit([
        {
          key: `rl:replay:user:${userId}`,
          limit: RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_USER.limit,
          windowMs: RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_USER.ttlMs,
        },
        {
          key: `rl:replay:del:${deliveryId}`,
          limit: RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_DELIVERY.limit,
          windowMs: RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_DELIVERY.ttlMs,
        },
      ]);

      if (!replayRes.allowed) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              'Too many manual replay requests. Please wait before retrying.',
            error: 'Too Many Requests',
            retryAfter: replayRes.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Root delivery lineage: if replaying a previous replay, point directly to root delivery
    const rootDeliveryId = original.replayOfId || original.id;

    // 5. Create new replay delivery with origin MANUAL_REPLAY and snapshot current endpoint state
    let replayDelivery: DeliveryRecordWithEvent;
    try {
      replayDelivery = (await this.prisma.webhookDelivery.create({
        data: {
          eventId: original.eventId,
          endpointId: original.endpointId,
          endpointName: original.endpoint.name,
          destinationUrl: original.endpoint.url,
          origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
          replayOfId: rootDeliveryId,
          replayIdempotencyKey: idempotencyHash,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
          attemptCount: 0,
        },
        include: {
          event: {
            select: { type: true },
          },
        },
      })) as unknown as DeliveryRecordWithEvent;
    } catch (err: unknown) {
      // Race condition defense: another request completed the create concurrently
      const concurrent = await this.prisma.webhookDelivery.findFirst({
        where: { replayIdempotencyKey: idempotencyHash },
        include: { event: { select: { type: true } } },
      });
      if (concurrent) {
        const formatted = this.formatDelivery(
          concurrent as unknown as DeliveryRecordWithEvent,
        );
        return {
          message: 'Webhook replay already accepted (idempotent)',
          originalDeliveryId: deliveryId,
          replayDelivery: formatted,
          delivery: formatted,
          isIdempotent: true,
        };
      }
      throw err;
    }

    // 5. Enqueue BullMQ delivery job
    let isEnqueued = false;
    try {
      const queue = this.deliveryService.getQueue();
      await queue.add(
        'webhook-delivery',
        { deliveryId: replayDelivery.id },
        {
          jobId: `webhook-delivery-${replayDelivery.id}-initial`,
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
      isEnqueued = true;
      this.logger.log(
        `Enqueued manual replay job for delivery ${replayDelivery.id} (replay of ${original.id})`,
      );
    } catch (queueErr) {
      this.logger.error(
        `Failed to enqueue manual replay ${replayDelivery.id} to BullMQ: ${(queueErr as Error).message}. Will be recovered by poller.`,
      );
      // Persisted with PENDING in database, so background lease poller will process it durably.
    }

    const formatted = this.formatDelivery(
      replayDelivery as unknown as DeliveryRecordWithEvent,
    );

    const message = isEnqueued
      ? 'Webhook replay accepted and queued for delivery'
      : 'Webhook replay accepted. Delivery will be processed asynchronously.';

    return {
      message,
      originalDeliveryId: original.id,
      replayDelivery: formatted,
      delivery: formatted,
      isIdempotent: false,
    };
  }

  /**
   * Formats a database delivery record into a safe, strongly-typed WebhookDeliveryDto.
   */
  private formatDelivery(record: DeliveryRecordWithEvent): WebhookDeliveryDto {
    return {
      id: record.id,
      eventId: record.eventId,
      endpointId: record.endpointId,
      endpointName: record.endpointName,
      destinationUrl: record.destinationUrl,
      origin: record.origin as WebhookDeliveryOrigin,
      replayOfId: record.replayOfId ?? null,
      status: record.status as WebhookDeliveryStatus,
      attemptCount: record.attemptCount,
      claimedAt: record.claimedAt ? record.claimedAt.toISOString() : null,
      nextAttemptAt: record.nextAttemptAt
        ? record.nextAttemptAt.toISOString()
        : null,
      deliveredAt: record.deliveredAt ? record.deliveredAt.toISOString() : null,
      lastHttpStatus: record.lastHttpStatus,
      lastErrorCode: record.lastErrorCode,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      eventType: record.event ? (record.event.type as WebhookEventType) : undefined,
    };
  }

  /**
   * Sanitizes and bounds attempt response preview to maximum preview bytes.
   */
  private sanitizePreview(raw: string | null): string | null {
    if (!raw) return null;
    if (raw.length <= WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES) {
      return raw;
    }
    return (
      raw.slice(0, WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES) +
      '... [truncated]'
    );
  }
}
