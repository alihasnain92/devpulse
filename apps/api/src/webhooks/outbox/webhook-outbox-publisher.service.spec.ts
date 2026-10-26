import { Test, TestingModule } from '@nestjs/testing';
import {
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_OUTBOX_STATUS,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookOutboxPublisherService } from './webhook-outbox-publisher.service';

describe('WebhookOutboxPublisherService (Unit)', () => {
  let service: WebhookOutboxPublisherService;

  const mockPrisma = {
    $transaction: jest.fn(),
    webhookOutbox: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    webhookEvent: {
      findUnique: jest.fn(),
    },
    webhookEndpoint: {
      findMany: jest.fn(),
    },
    webhookDelivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    webhookAttempt: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const eventId = 'evt-100';
  const outboxId = 'outbox-100';
  const endpoint1Id = 'ep-1';
  const endpoint2Id = 'ep-2';

  const mockEvent = {
    id: eventId,
    userId: 'usr-1',
    type: 'incident.created',
    payload: { id: eventId },
  };

  const mockEndpoints = [
    { id: endpoint1Id, userId: 'usr-1', isEnabled: true, events: ['incident.created'] },
    { id: endpoint2Id, userId: 'usr-1', isEnabled: true, events: ['incident.created', 'incident.resolved'] },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookOutboxPublisherService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WebhookOutboxPublisherService>(
      WebhookOutboxPublisherService,
    );
    service.setQueue(mockQueue as any);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('claims pending outbox rows, fans out deliveries, and marks outbox COMPLETED', async () => {
    // 1. Transaction returns 1 claimed row
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: outboxId, eventId }]),
        webhookOutbox: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    });

    // 2. Fetch event
    mockPrisma.webhookEvent.findUnique.mockResolvedValue(mockEvent);

    // 3. Find 2 matching endpoints
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue(mockEndpoints);

    // 4. Delivery creation mocks
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);
    mockPrisma.webhookDelivery.create
      .mockResolvedValueOnce({ id: 'del-1', eventId, endpointId: endpoint1Id })
      .mockResolvedValueOnce({ id: 'del-2', eventId, endpointId: endpoint2Id });

    const summary = await service.publishPending();

    expect(summary.processedCount).toBe(1);
    expect(summary.enqueuedDeliveries).toBe(2);
    expect(summary.errors).toBe(0);

    // Verify BullMQ jobs enqueued with deterministic job IDs
    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'webhook-delivery',
      { deliveryId: 'del-1' },
      expect.objectContaining({ jobId: 'webhook-delivery-del-1' }),
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      'webhook-delivery',
      { deliveryId: 'del-2' },
      expect.objectContaining({ jobId: 'webhook-delivery-del-2' }),
    );

    // Verify outbox marked COMPLETED
    expect(mockPrisma.webhookOutbox.update).toHaveBeenCalledWith({
      where: { id: outboxId },
      data: expect.objectContaining({
        status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
        lastError: null,
      }),
    });
  });

  it('completes outbox row if event has no matching enabled endpoints', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: outboxId, eventId }]),
        webhookOutbox: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    });

    mockPrisma.webhookEvent.findUnique.mockResolvedValue(mockEvent);
    // 0 endpoints
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

    const summary = await service.publishPending();

    expect(summary.processedCount).toBe(1);
    expect(summary.enqueuedDeliveries).toBe(0);
    expect(mockQueue.add).not.toHaveBeenCalled();

    expect(mockPrisma.webhookOutbox.update).toHaveBeenCalledWith({
      where: { id: outboxId },
      data: expect.objectContaining({
        status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
      }),
    });
  });

  it('reschedules outbox row with backoff when Redis enqueueing fails', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: outboxId, eventId }]),
        webhookOutbox: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    });

    mockPrisma.webhookEvent.findUnique.mockResolvedValue(mockEvent);
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoints[0]]);
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'del-1' });

    // Redis failure
    mockQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));

    const summary = await service.publishPending();

    expect(summary.errors).toBe(1);
    expect(mockPrisma.webhookOutbox.update).toHaveBeenCalledWith({
      where: { id: outboxId },
      data: expect.objectContaining({
        status: WEBHOOK_OUTBOX_STATUS.PENDING,
        attemptCount: { increment: 1 },
        lastError: expect.stringContaining('Redis connection refused'),
        availableAt: expect.any(Date),
      }),
    });
  });

  it('returns zero counts when no outbox rows are pending', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      return cb(tx);
    });

    const summary = await service.publishPending();

    expect(summary.processedCount).toBe(0);
    expect(summary.enqueuedDeliveries).toBe(0);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  describe('Crash Safety & Reconciliation Scenarios', () => {
    it('reconciles existing BullMQ job on crash recovery without duplicate enqueue', async () => {
      // Outbox item was claimed, delivery was created, job was enqueued in Redis, but worker crashed before outbox COMPLETED
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: outboxId, eventId }]),
          webhookOutbox: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(tx);
      });

      mockPrisma.webhookEvent.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoints[0]]);

      // Existing delivery in PENDING
      mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
        id: 'del-existing',
        eventId,
        endpointId: endpoint1Id,
        status: 'PENDING',
      });

      // Existing job in BullMQ
      mockQueue.getJob.mockResolvedValueOnce({
        id: 'webhook-delivery:del-existing',
        getState: jest.fn().mockResolvedValue('waiting'),
      });

      const summary = await service.publishPending();

      expect(summary.processedCount).toBe(1);
      expect(summary.enqueuedDeliveries).toBe(0); // Job already existed, not enqueued twice
      expect(mockQueue.add).not.toHaveBeenCalled();

      // Outbox successfully completed upon reconciliation
      expect(mockPrisma.webhookOutbox.update).toHaveBeenCalledWith({
        where: { id: outboxId },
        data: expect.objectContaining({
          status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
          lastError: null,
        }),
      });
    });

    it('safely recovers and completes partial endpoint fanout without duplicates', async () => {
      // Scenario: Endpoint 1 was already queued, but worker crashed before Endpoint 2 was queued
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: outboxId, eventId }]),
          webhookOutbox: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(tx);
      });

      mockPrisma.webhookEvent.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue(mockEndpoints); // 2 endpoints

      // Endpoint 1 has existing delivery and already-enqueued job
      mockPrisma.webhookDelivery.findFirst
        .mockResolvedValueOnce({
          id: 'del-1',
          eventId,
          endpointId: endpoint1Id,
          status: 'PENDING',
        })
        .mockResolvedValueOnce(null); // Endpoint 2 does not have delivery yet

      mockPrisma.webhookDelivery.create.mockResolvedValueOnce({
        id: 'del-2',
        eventId,
        endpointId: endpoint2Id,
        status: 'PENDING',
      });

      // Job 1 exists in BullMQ; Job 2 does not exist
      mockQueue.getJob
        .mockResolvedValueOnce({ id: 'webhook-delivery:del-1' })
        .mockResolvedValueOnce(null);

      const summary = await service.publishPending();

      expect(summary.processedCount).toBe(1);
      expect(summary.enqueuedDeliveries).toBe(1); // Only del-2 enqueued

      // Only del-2 added to queue
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: 'del-2' },
        expect.objectContaining({ jobId: 'webhook-delivery-del-2' }),
      );

      // Outbox is marked completed now that all endpoints are represented
      expect(mockPrisma.webhookOutbox.update).toHaveBeenCalledWith({
        where: { id: outboxId },
        data: expect.objectContaining({
          status: WEBHOOK_OUTBOX_STATUS.COMPLETED,
        }),
      });
    });

    it('recovers deliveries stuck in PROCESSING past lease timeout', async () => {
      const staleDeliveries = [
        {
          id: 'stale-del-1',
          attemptCount: 1,
          status: 'PROCESSING',
          claimedAt: new Date(Date.now() - 150000), // Stale (> 120s)
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(staleDeliveries);
      mockQueue.getJob.mockResolvedValue(null);

      const recovered = await service.recoverStaleDeliveries();

      expect(recovered).toBe(1);

      // Verify lingering attempt marked ABANDONED
      expect(mockPrisma.webhookAttempt.updateMany).toHaveBeenCalledWith({
        where: {
          deliveryId: 'stale-del-1',
          outcome: 'STARTED',
        },
        data: expect.objectContaining({
          outcome: 'ABANDONED',
          errorCode: 'INTERRUPTED_BY_CRASH_OR_TIMEOUT',
        }),
      });

      // Verify delivery rescheduled to RETRYING
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'stale-del-1' },
        data: expect.objectContaining({
          status: 'RETRYING',
          claimedAt: null,
          nextAttemptAt: expect.any(Date),
        }),
      });

      // Verify recovery retry job enqueued
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: 'stale-del-1' },
        expect.objectContaining({
          jobId: 'webhook-delivery-stale-del-1-attempt-2',
          delay: 5000,
        }),
      );
    });

    it('recovers orphaned PENDING manual replay deliveries when BullMQ job is missing', async () => {
      const pendingReplays = [
        {
          id: 'replay-del-1',
          origin: 'MANUAL_REPLAY',
          status: 'PENDING',
          attemptCount: 0,
          endpoint: {
            id: endpoint1Id,
            isEnabled: true,
            deletedAt: null,
          },
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(pendingReplays);
      mockQueue.getJob.mockResolvedValue(null);

      const recovered = await service.recoverPendingReplays();

      expect(recovered).toBe(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: 'replay-del-1' },
        expect.objectContaining({
          jobId: 'webhook-delivery-replay-del-1-initial',
        }),
      );
    });

    it('skips duplicate enqueue if BullMQ job for pending replay already exists', async () => {
      const pendingReplays = [
        {
          id: 'replay-del-2',
          origin: 'MANUAL_REPLAY',
          status: 'PENDING',
          attemptCount: 0,
          endpoint: {
            id: endpoint1Id,
            isEnabled: true,
            deletedAt: null,
          },
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(pendingReplays);
      mockQueue.getJob.mockResolvedValue({ id: 'webhook-delivery-replay-del-2-initial' });

      const recovered = await service.recoverPendingReplays();

      expect(recovered).toBe(0);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('marks pending replay FAILED if destination endpoint was deleted', async () => {
      const pendingReplays = [
        {
          id: 'replay-del-3',
          origin: 'MANUAL_REPLAY',
          status: 'PENDING',
          attemptCount: 0,
          endpoint: {
            id: endpoint1Id,
            isEnabled: true,
            deletedAt: new Date(), // Deleted
          },
        },
      ];

      mockPrisma.webhookDelivery.findMany.mockResolvedValue(pendingReplays);

      const recovered = await service.recoverPendingReplays();

      expect(recovered).toBe(0);
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'replay-del-3' },
        data: expect.objectContaining({
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          lastErrorCode: 'ENDPOINT_DELETED',
        }),
      });
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
