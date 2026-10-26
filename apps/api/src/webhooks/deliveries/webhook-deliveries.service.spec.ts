import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import {
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

describe('WebhookDeliveriesService', () => {
  let service: WebhookDeliveriesService;

  const mockPrisma = {
    webhookDelivery: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    webhookAttempt: {
      findMany: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-replay-1' }),
  };

  const mockDeliveryService = {
    getQueue: jest.fn().mockReturnValue(mockQueue),
  };

  const userId = 'user-123';
  const otherUserId = 'user-456';
  const deliveryId = 'del-123';
  const endpointId = 'ep-123';
  const eventId = 'evt-123';

  const mockEndpoint = {
    id: endpointId,
    userId,
    name: 'Production Webhook',
    url: 'https://example.com/webhook',
    isEnabled: true,
    deletedAt: null,
  };

  const mockEvent = {
    id: eventId,
    userId,
    type: 'incident.created',
    sourceType: 'incident',
    sourceId: 'inc-123',
    payload: { incidentId: 'inc-123', monitorName: 'API Health' },
    createdAt: new Date('2026-10-27T00:00:00.000Z'),
  };

  const mockDeliveryRecord = {
    id: deliveryId,
    eventId,
    endpointId,
    endpointName: 'Old Production Webhook',
    destinationUrl: 'https://old.example.com/webhook',
    origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
    replayOfId: null,
    replayIdempotencyKey: null,
    status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
    attemptCount: 1,
    claimedAt: null,
    nextAttemptAt: null,
    deliveredAt: new Date('2026-10-27T00:00:05.000Z'),
    lastHttpStatus: 200,
    lastErrorCode: null,
    createdAt: new Date('2026-10-27T00:00:00.000Z'),
    updatedAt: new Date('2026-10-27T00:00:05.000Z'),
    event: mockEvent,
    endpoint: mockEndpoint,
    attempts: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookDeliveryService, useValue: mockDeliveryService },
      ],
    }).compile();

    service = module.get<WebhookDeliveriesService>(WebhookDeliveriesService);
  });

  describe('findAll', () => {
    it('returns paginated deliveries with defaults and calculates hasMore', async () => {
      const records = [
        {
          ...mockDeliveryRecord,
          id: 'del-1',
          event: { type: 'incident.created' },
        },
        {
          ...mockDeliveryRecord,
          id: 'del-2',
          event: { type: 'incident.created' },
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(records);
      mockPrisma.webhookDelivery.count.mockResolvedValue(2);

      const result = await service.findAll(userId, { limit: 25 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(2);
      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            event: { userId },
          },
          take: 26,
        }),
      );
    });

    it('filters by status, endpointId, origin, and eventType', async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([]);
      mockPrisma.webhookDelivery.count.mockResolvedValue(0);

      await service.findAll(userId, {
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        endpointId,
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        eventType: 'incident.resolved',
        limit: 10,
      });

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            event: {
              userId,
              type: 'incident.resolved',
            },
            endpointId,
            status: WEBHOOK_DELIVERY_STATUS.FAILED,
            origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
          },
          take: 11,
        }),
      );
    });

    it('handles cursor pagination and indicates hasMore', async () => {
      // Limit 1, returns 2 rows -> hasMore is true
      const records = [
        {
          ...mockDeliveryRecord,
          id: 'del-1',
          event: { type: 'incident.created' },
        },
        {
          ...mockDeliveryRecord,
          id: 'del-2',
          event: { type: 'incident.created' },
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(records);
      mockPrisma.webhookDelivery.count.mockResolvedValue(5);

      const result = await service.findAll(userId, {
        cursor: 'del-0',
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('del-1');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('del-1');
      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'del-0' },
          skip: 1,
          take: 2,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns delivery details including snapshot vs current endpoint and safe event payload', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        ...mockDeliveryRecord,
        endpoint: mockEndpoint,
        event: mockEvent,
        attempts: [
          {
            id: 'att-1',
            deliveryId,
            attemptNumber: 1,
            startedAt: new Date('2026-10-27T00:00:00.000Z'),
            finishedAt: new Date('2026-10-27T00:00:01.000Z'),
            durationMs: 1000,
            httpStatus: 200,
            outcome: 'SUCCESS',
            errorCode: null,
            responsePreview: '{"ok":true}',
            createdAt: new Date('2026-10-27T00:00:00.000Z'),
          },
        ],
      });

      const result = await service.findOne(userId, deliveryId);

      expect(result.id).toBe(deliveryId);
      expect(result.endpointName).toBe('Old Production Webhook'); // Historical snapshot preserved
      expect(result.destinationUrl).toBe('https://old.example.com/webhook');
      expect(result.currentEndpoint?.name).toBe('Production Webhook'); // Current endpoint state
      expect(result.currentEndpoint?.url).toBe('https://example.com/webhook');
      expect(result.currentEndpoint?.isDeleted).toBe(false);
      expect(result.event.id).toBe(eventId);
      expect(result.event.payload).toEqual(mockEvent.payload);
      expect(result.latestAttempt?.httpStatus).toBe(200);
    });

    it('throws NotFoundException if delivery does not exist or user does not own it', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expect(service.findOne(userId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAttempts', () => {
    it('returns chronological attempt timeline with bounded previews', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: deliveryId });
      const hugeResponse = 'A'.repeat(2000);

      mockPrisma.webhookAttempt.findMany.mockResolvedValue([
        {
          id: 'att-1',
          deliveryId,
          attemptNumber: 1,
          startedAt: new Date('2026-10-27T00:00:00.000Z'),
          finishedAt: new Date('2026-10-27T00:00:01.000Z'),
          durationMs: 1000,
          httpStatus: 500,
          outcome: 'FAILED',
          errorCode: 'HTTP_500',
          responsePreview: hugeResponse,
          createdAt: new Date('2026-10-27T00:00:00.000Z'),
        },
      ]);

      const attempts = await service.getAttempts(userId, deliveryId);

      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptNumber).toBe(1);
      expect(attempts[0].responsePreview?.length).toBeLessThan(hugeResponse.length);
      expect(attempts[0].responsePreview).toContain('[truncated]');
    });

    it('throws NotFoundException when delivery does not belong to user', async () => {
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);

      await expect(service.getAttempts(otherUserId, deliveryId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replay', () => {
    const idempotencyKey = 'key-uuid-1234';

    it('rejects replay request without Idempotency-Key', async () => {
      await expect(service.replay(userId, deliveryId, '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.replay(userId, deliveryId, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns existing delivery on idempotent replay duplicate', async () => {
      const expectedHash = crypto
        .createHash('sha256')
        .update(`replay:${userId}:${idempotencyKey}`)
        .digest('hex');

      const existingReplayRecord = {
        ...mockDeliveryRecord,
        id: 'del-replay-1',
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        replayOfId: deliveryId,
        replayIdempotencyKey: expectedHash,
        event: { type: 'incident.created' },
      };

      mockPrisma.webhookDelivery.findFirst.mockResolvedValueOnce(
        existingReplayRecord,
      );

      const result = await service.replay(userId, deliveryId, idempotencyKey);

      expect(result.message).toContain('idempotent');
      expect(result.isIdempotent).toBe(true);
      expect(result.replayDelivery.id).toBe('del-replay-1');
      expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('throws ConflictException if endpoint has been soft-deleted', async () => {
      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          ...mockDeliveryRecord,
          endpoint: { ...mockEndpoint, deletedAt: new Date() },
        });

      await expect(
        service.replay(userId, deliveryId, idempotencyKey),
      ).rejects.toThrow('Cannot replay delivery: Webhook endpoint has been deleted');
    });

    it('throws ConflictException if endpoint is disabled', async () => {
      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          ...mockDeliveryRecord,
          endpoint: { ...mockEndpoint, isEnabled: false },
        });

      await expect(
        service.replay(userId, deliveryId, idempotencyKey),
      ).rejects.toThrow(
        'Cannot replay delivery: Webhook endpoint is currently disabled. Enable the endpoint before replaying.',
      );
    });

    it('successfully enqueues a manual replay with current snapshot and lineage', async () => {
      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          ...mockDeliveryRecord,
          endpoint: mockEndpoint, // current URL & name
          event: mockEvent,
        });

      const createdReplay = {
        id: 'del-replay-fresh',
        eventId,
        endpointId,
        endpointName: mockEndpoint.name,
        destinationUrl: mockEndpoint.url,
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        replayOfId: deliveryId,
        replayIdempotencyKey: `replay:${userId}:${idempotencyKey}`,
        status: WEBHOOK_DELIVERY_STATUS.PENDING,
        attemptCount: 0,
        claimedAt: null,
        nextAttemptAt: null,
        deliveredAt: null,
        lastHttpStatus: null,
        lastErrorCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        event: { type: 'incident.created' },
      };

      mockPrisma.webhookDelivery.create.mockResolvedValue(createdReplay);

      const result = await service.replay(userId, deliveryId, idempotencyKey);

      expect(result.message).toContain('accepted');
      expect(result.isIdempotent).toBe(false);
      expect(result.originalDeliveryId).toBe(deliveryId);
      expect(result.replayDelivery.id).toBe('del-replay-fresh');
      expect(result.replayDelivery.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);
      expect(result.replayDelivery.replayOfId).toBe(deliveryId);

      const expectedHash = crypto
        .createHash('sha256')
        .update(`replay:${userId}:${idempotencyKey}`)
        .digest('hex');

      // Verify created with CURRENT endpoint snapshot
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId,
          endpointId,
          endpointName: 'Production Webhook',
          destinationUrl: 'https://example.com/webhook',
          origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
          replayOfId: deliveryId,
          replayIdempotencyKey: expectedHash,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
          attemptCount: 0,
        }),
        include: {
          event: {
            select: { type: true },
          },
        },
      });

      // Verify job added to BullMQ
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: 'del-replay-fresh' },
        expect.objectContaining({ jobId: 'webhook-delivery-del-replay-fresh-initial' }),
      );
    });

    it('enforces root delivery lineage when replaying a previous replay delivery', async () => {
      // Original delivery is ALREADY a replay (has replayOfId = 'root-del-0')
      const replayedDelivery = {
        ...mockDeliveryRecord,
        id: 'del-replay-1',
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        replayOfId: 'root-del-0',
        endpoint: mockEndpoint,
        event: mockEvent,
      };

      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce(replayedDelivery); // fetch delivery

      mockPrisma.webhookDelivery.create.mockResolvedValue({
        ...mockDeliveryRecord,
        id: 'del-replay-2',
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        replayOfId: 'root-del-0',
        status: WEBHOOK_DELIVERY_STATUS.PENDING,
        event: { type: 'incident.created' },
      });

      const result = await service.replay(userId, 'del-replay-1', 'new-key-555');

      expect(result.replayDelivery.id).toBe('del-replay-2');
      // Verifies that the new replay points to ROOT delivery 'root-del-0', not intermediate 'del-replay-1'
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            replayOfId: 'root-del-0',
          }),
        }),
      );
    });

    it('recovers gracefully and preserves PENDING status if Redis throws on queue.add', async () => {
      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          ...mockDeliveryRecord,
          endpoint: mockEndpoint,
          event: mockEvent,
        });

      mockPrisma.webhookDelivery.create.mockResolvedValue({
        ...mockDeliveryRecord,
        id: 'del-replay-redis-fail',
        origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
        status: WEBHOOK_DELIVERY_STATUS.PENDING,
        event: { type: 'incident.created' },
      });

      mockQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));

      // Does not throw an exception; leaves PENDING row in database for recovery poller
      const result = await service.replay(userId, deliveryId, idempotencyKey);

      expect(result.replayDelivery.id).toBe('del-replay-redis-fail');
      expect(result.replayDelivery.status).toBe(WEBHOOK_DELIVERY_STATUS.PENDING);
      expect(result.message).toContain('asynchronously');
      expect(result.isIdempotent).toBe(false);
    });
  });
});
