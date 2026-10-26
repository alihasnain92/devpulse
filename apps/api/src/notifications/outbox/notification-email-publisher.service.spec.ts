import { NotificationEmailPublisherService } from './notification-email-publisher.service';
import {
  NOTIFICATION_EMAIL_OUTBOX_STATUS,
  NOTIFICATION_EMAIL_STATUS,
} from '@devpulse/shared';

describe('NotificationEmailPublisherService', () => {
  let service: NotificationEmailPublisherService;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      $queryRaw: jest.fn(),
      notificationEmailOutbox: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      notificationEmailDelivery: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new NotificationEmailPublisherService(mockPrisma);
    service.setQueue(mockQueue as any);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return 0 processed count when no pending outbox rows exist', async () => {
    mockPrisma.notificationEmailOutbox.findMany.mockResolvedValue([]);

    const result = await service.publishPending();
    expect(result.processedCount).toBe(0);
    expect(result.enqueuedEmails).toBe(0);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should claim row, dispatch to BullMQ, and mark COMPLETED', async () => {
    const candidate = {
      id: 'outbox-1',
      deliveryId: 'del-1',
      status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
    };

    mockPrisma.notificationEmailOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'outbox-1', deliveryId: 'del-1' }]);
    mockPrisma.notificationEmailOutbox.update.mockResolvedValue({
      id: 'outbox-1',
      deliveryId: 'del-1',
    });

    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-1',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
    });

    const result = await service.publishPending();

    expect(result.processedCount).toBe(1);
    expect(result.enqueuedEmails).toBe(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-email',
      { deliveryId: 'del-1' },
      expect.objectContaining({
        jobId: 'notification-email-del-1',
      }),
    );
    expect(mockPrisma.notificationEmailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
        }),
      }),
    );
  });

  it('should mark outbox COMPLETED without re-enqueuing if delivery is already DELIVERED', async () => {
    const candidate = {
      id: 'outbox-2',
      deliveryId: 'del-2',
      status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
    };

    mockPrisma.notificationEmailOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'outbox-2', deliveryId: 'del-2' }]);
    mockPrisma.notificationEmailOutbox.update.mockResolvedValue({
      id: 'outbox-2',
      deliveryId: 'del-2',
    });

    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-2',
      status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
    });

    const result = await service.publishPending();

    expect(result.processedCount).toBe(1);
    expect(result.enqueuedEmails).toBe(0);
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.notificationEmailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-2' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
        }),
      }),
    );
  });

  it('should reconcile stale PROCESSING outbox row when BullMQ job already exists', async () => {
    const candidate = {
      id: 'outbox-stale',
      deliveryId: 'del-stale',
      status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PROCESSING,
    };

    mockPrisma.notificationEmailOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'outbox-stale', deliveryId: 'del-stale' },
    ]);
    mockPrisma.notificationEmailOutbox.update.mockResolvedValue({
      id: 'outbox-stale',
      deliveryId: 'del-stale',
    });

    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-stale',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
    });

    // Simulate BullMQ job already present from earlier crash
    mockQueue.getJob.mockResolvedValue({ id: 'notification-email-del-stale' });

    const result = await service.publishPending();

    expect(result.processedCount).toBe(1);
    expect(result.enqueuedEmails).toBe(0); // Not enqueued again
    expect(mockQueue.add).not.toHaveBeenCalled(); // Deduplicated cleanly
    expect(mockPrisma.notificationEmailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-stale' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_OUTBOX_STATUS.COMPLETED,
        }),
      }),
    );
  });

  it('should reschedule outbox row to PENDING with backoff if Redis is unavailable', async () => {
    const candidate = {
      id: 'outbox-redis-fail',
      deliveryId: 'del-redis-fail',
      status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
    };

    mockPrisma.notificationEmailOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'outbox-redis-fail', deliveryId: 'del-redis-fail' },
    ]);
    mockPrisma.notificationEmailOutbox.update.mockResolvedValue({
      id: 'outbox-redis-fail',
      deliveryId: 'del-redis-fail',
    });

    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-redis-fail',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
    });

    // Simulate Redis outage during queue.add()
    mockQueue.getJob.mockResolvedValue(null);
    mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));

    const result = await service.publishPending();

    expect(result.processedCount).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.enqueuedEmails).toBe(0);

    // Verify outbox row returned to PENDING with backoff
    expect(mockPrisma.notificationEmailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-redis-fail' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING,
          claimedAt: null,
          attemptCount: { increment: 1 },
          lastError: expect.stringContaining('Redis connection refused'),
        }),
      }),
    );
  });

  describe('recoverStaleDeliveries', () => {
    it('should recover stale PROCESSING delivery and re-enqueue for bounded retry', async () => {
      const staleDelivery = {
        id: 'del-stale-1',
        status: NOTIFICATION_EMAIL_STATUS.PROCESSING,
        attemptCount: 1,
        claimedAt: new Date(Date.now() - 300000),
      };

      mockPrisma.notificationEmailDelivery.findMany.mockResolvedValue([staleDelivery]);

      const count = await service.recoverStaleDeliveries();

      expect(count).toBe(1);
      expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-stale-1' },
          data: expect.objectContaining({
            status: NOTIFICATION_EMAIL_STATUS.RETRYING,
            lastErrorCode: 'STALE_LEASE_RECOVERED',
          }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-email',
        { deliveryId: 'del-stale-1' },
        expect.objectContaining({
          jobId: expect.stringContaining('notification-email-del-stale-1-recovered-'),
        }),
      );
    });

    it('should mark stale PROCESSING delivery as FAILED when MAX_ATTEMPTS reached', async () => {
      const staleDelivery = {
        id: 'del-stale-max',
        status: NOTIFICATION_EMAIL_STATUS.PROCESSING,
        attemptCount: 5,
        claimedAt: new Date(Date.now() - 300000),
      };

      mockPrisma.notificationEmailDelivery.findMany.mockResolvedValue([staleDelivery]);

      const count = await service.recoverStaleDeliveries();

      expect(count).toBe(0);
      expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-stale-max' },
          data: expect.objectContaining({
            status: NOTIFICATION_EMAIL_STATUS.FAILED,
            lastErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
          }),
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
