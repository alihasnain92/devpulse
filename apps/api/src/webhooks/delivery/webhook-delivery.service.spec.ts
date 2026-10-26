import { Test, TestingModule } from '@nestjs/testing';
import {
  WEBHOOK_ATTEMPT_STATUS,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_RETRY_CONFIG,
} from '@devpulse/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookCryptoService } from '../crypto/webhook-crypto.service';
import { WebhookSignerService } from '../crypto/webhook-signer.service';
import { WebhookHttpClientService } from '../http/webhook-http-client.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

describe('WebhookDeliveryService (Unit)', () => {
  let service: WebhookDeliveryService;

  const mockPrisma = {
    $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    webhookDelivery: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    webhookAttempt: {
      create: jest.fn().mockImplementation((args) => ({
        id: 'att-123',
        ...args.data,
      })),
      update: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockCrypto = {
    decryptSecret: jest.fn().mockReturnValue('whsec_mock_raw_secret_12345'),
  };

  const mockSigner = {
    signPayload: jest.fn().mockReturnValue({
      header: 't=1700000000,v1=signature_digest_hex',
      timestamp: 1700000000,
      signature: 'signature_digest_hex',
    }),
  };

  const mockHttpClient = {
    executeDelivery: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const deliveryId = 'del-123';
  const eventId = 'evt-123';
  const endpointId = 'ep-123';

  const mockDeliveryRecord = {
    id: deliveryId,
    eventId,
    endpointId,
    status: WEBHOOK_DELIVERY_STATUS.PENDING,
    attemptCount: 0,
    nextAttemptAt: null,
    deliveredAt: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    event: {
      id: eventId,
      userId: 'usr-1',
      type: 'incident.created',
      payload: {
        id: 'evt-123',
        type: 'incident.created',
        data: { incident: { id: 'inc-1', monitorId: 'mon-1' } },
      },
    },
    endpoint: {
      id: endpointId,
      url: 'https://webhook.site/test',
      events: ['incident.created', 'incident.resolved'],
      isEnabled: true,
      encryptedSecret: 'iv:authtag:ciphertext',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookCryptoService, useValue: mockCrypto },
        { provide: WebhookSignerService, useValue: mockSigner },
        { provide: WebhookHttpClientService, useValue: mockHttpClient },
      ],
    }).compile();

    service = module.get<WebhookDeliveryService>(WebhookDeliveryService);
    service.setQueue(mockQueue as any);
  });

  describe('processDelivery Idempotency & Validation', () => {
    it('skips processing if delivery is already DELIVERED', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.DELIVERED);
      expect(mockHttpClient.executeDelivery).not.toHaveBeenCalled();
      expect(mockPrisma.webhookAttempt.create).not.toHaveBeenCalled();
    });

    it('marks delivery as FAILED if endpoint was deleted', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        endpoint: null,
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(result?.error).toBe('ENDPOINT_DELETED');
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: {
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          lastErrorCode: 'ENDPOINT_DELETED',
          nextAttemptAt: null,
        },
      });
      expect(mockHttpClient.executeDelivery).not.toHaveBeenCalled();
    });

    it('marks delivery as FAILED if endpoint is disabled', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        endpoint: { ...mockDeliveryRecord.endpoint, isEnabled: false },
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(result?.error).toBe('ENDPOINT_DISABLED');
      expect(mockHttpClient.executeDelivery).not.toHaveBeenCalled();
    });

    it('marks delivery as FAILED if endpoint does not subscribe to event', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        endpoint: {
          ...mockDeliveryRecord.endpoint,
          events: ['incident.resolved'], // does not match incident.created
        },
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(result?.error).toBe('ENDPOINT_UNSUBSCRIBED');
      expect(mockHttpClient.executeDelivery).not.toHaveBeenCalled();
    });
  });

  describe('processDelivery Outbound Execution', () => {
    it('executes successful delivery on HTTP 200, persists attempt, and marks DELIVERED', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDeliveryRecord);
      mockHttpClient.executeDelivery.mockResolvedValue({
        statusCode: 200,
        latencyMs: 145,
        isSuccess: true,
        errorMessage: null,
        responsePreview: '{"ok":true}',
        resolvedIp: '93.184.216.34',
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.isSuccess).toBe(true);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.DELIVERED);
      expect(result?.httpStatus).toBe(200);

      // Verify signing
      expect(mockCrypto.decryptSecret).toHaveBeenCalledWith('iv:authtag:ciphertext');
      expect(mockSigner.signPayload).toHaveBeenCalled();

      // Verify headers passed to HTTP client
      expect(mockHttpClient.executeDelivery).toHaveBeenCalledWith(
        'https://webhook.site/test',
        JSON.stringify(mockDeliveryRecord.event.payload),
        expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'DevPulse-Webhooks/1',
          'X-DevPulse-Event-Id': eventId,
          'X-DevPulse-Delivery-Id': deliveryId,
          'X-DevPulse-Signature': 't=1700000000,v1=signature_digest_hex',
        }),
        WEBHOOK_RETRY_CONFIG.DELIVERY_TIMEOUT_MS,
      );

      // Verify attempt created in STARTED status BEFORE network request
      expect(mockPrisma.webhookAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId,
          attemptNumber: 1,
          outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
        }),
      });

      // Verify attempt updated to SUCCESS after HTTP response
      expect(mockPrisma.webhookAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-123' },
        data: expect.objectContaining({
          httpStatus: 200,
          outcome: WEBHOOK_ATTEMPT_STATUS.SUCCESS,
          durationMs: 145,
          responsePreview: '{"ok":true}',
        }),
      });

      // Verify delivery updated to DELIVERED
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: expect.objectContaining({
          status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
          attemptCount: 1,
          lastHttpStatus: 200,
          lastErrorCode: null,
          nextAttemptAt: null,
        }),
      });

      // No retry queued
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('marks permanent failure immediately on HTTP 404 without scheduling retry', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDeliveryRecord);
      mockHttpClient.executeDelivery.mockResolvedValue({
        statusCode: 404,
        latencyMs: 80,
        isSuccess: false,
        errorMessage: 'HTTP 404 response received',
        responsePreview: 'Not Found',
        resolvedIp: '93.184.216.34',
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.isSuccess).toBe(false);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);

      expect(mockPrisma.webhookAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
          attemptNumber: 1,
        }),
      });

      expect(mockPrisma.webhookAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-123' },
        data: expect.objectContaining({
          outcome: WEBHOOK_ATTEMPT_STATUS.FAILED,
          httpStatus: 404,
        }),
      });

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: expect.objectContaining({
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          nextAttemptAt: null,
        }),
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('schedules exponential backoff retry on transient HTTP 500 error', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDeliveryRecord);
      mockHttpClient.executeDelivery.mockResolvedValue({
        statusCode: 500,
        latencyMs: 120,
        isSuccess: false,
        errorMessage: 'HTTP 500 response received',
        responsePreview: 'Server Error',
        resolvedIp: '93.184.216.34',
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.isSuccess).toBe(false);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.RETRYING);

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: expect.objectContaining({
          status: WEBHOOK_DELIVERY_STATUS.RETRYING,
          attemptCount: 1,
          lastHttpStatus: 500,
        }),
      });

      // Verify BullMQ retry job enqueued
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId },
        expect.objectContaining({
          delay: expect.any(Number),
          jobId: `webhook-delivery:${deliveryId}:attempt-2`,
        }),
      );
    });

    it('marks delivery as FAILED when reaching maximum attempts (6)', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        attemptCount: 5, // Next attempt will be 6 (max)
      });
      mockHttpClient.executeDelivery.mockResolvedValue({
        statusCode: 503,
        latencyMs: 95,
        isSuccess: false,
        errorMessage: 'HTTP 503 response received',
        responsePreview: null,
        resolvedIp: null,
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.isSuccess).toBe(false);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: expect.objectContaining({
          status: WEBHOOK_DELIVERY_STATUS.FAILED,
          attemptCount: 6,
          nextAttemptAt: null,
        }),
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Error Classification and Backoff Calculation', () => {
    it('classifies permanent vs transient errors accurately', () => {
      expect(service.isPermanentError(200)).toBe(false);
      expect(service.isPermanentError(301)).toBe(true);
      expect(service.isPermanentError(302)).toBe(true);
      expect(service.isPermanentError(400)).toBe(true);
      expect(service.isPermanentError(401)).toBe(true);
      expect(service.isPermanentError(403)).toBe(true);
      expect(service.isPermanentError(404)).toBe(true);
      expect(service.isPermanentError(410)).toBe(true);
      expect(service.isPermanentError(422)).toBe(true);

      // Transient
      expect(service.isPermanentError(408)).toBe(false); // Request Timeout
      expect(service.isPermanentError(429)).toBe(false); // Rate Limited
      expect(service.isPermanentError(500)).toBe(false);
      expect(service.isPermanentError(502)).toBe(false);
      expect(service.isPermanentError(503)).toBe(false);
      expect(service.isPermanentError(504)).toBe(false);
      expect(service.isPermanentError(null)).toBe(false); // Network error
    });

    it('calculates exponential delay with bounded jitter', () => {
      for (let attempt = 1; attempt <= 6; attempt++) {
        const delay = service.calculateBackoffDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(
          WEBHOOK_RETRY_CONFIG.MAX_DELAY_MS * (1 + WEBHOOK_RETRY_CONFIG.JITTER_FACTOR),
        );
      }
    });
  });

  describe('Crash Safety, Lease Recovery & Concurrency', () => {
    it('creates durable attempt record in STARTED status before calling HTTP client', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDeliveryRecord);
      const callOrder: string[] = [];

      mockPrisma.webhookAttempt.create.mockImplementation((args) => {
        callOrder.push('attempt.create');
        return { id: 'att-first', ...args.data };
      });

      mockHttpClient.executeDelivery.mockImplementation(async () => {
        callOrder.push('http.execute');
        return {
          statusCode: 200,
          latencyMs: 50,
          isSuccess: true,
          errorMessage: null,
          responsePreview: '{"ok":true}',
          resolvedIp: '93.184.216.34',
        };
      });

      mockPrisma.webhookAttempt.update.mockImplementation((args) => {
        callOrder.push('attempt.update');
        return args;
      });

      await service.processDelivery(deliveryId);

      // Verify that attempt record is created BEFORE HTTP execution
      expect(callOrder).toEqual([
        'attempt.create',
        'http.execute',
        'attempt.update',
      ]);
    });

    it('recovers from crashed attempt in STARTED by marking it ABANDONED and creating a new attempt', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        attemptCount: 1,
      });

      // Simulate a previous attempt that remained in 'STARTED' because worker crashed
      mockPrisma.webhookAttempt.findFirst.mockResolvedValue({
        id: 'crashed-attempt-1',
        deliveryId,
        attemptNumber: 1,
        outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
      });

      mockHttpClient.executeDelivery.mockResolvedValue({
        statusCode: 200,
        latencyMs: 60,
        isSuccess: true,
        errorMessage: null,
        responsePreview: '{"ok":true}',
        resolvedIp: '93.184.216.34',
      });

      const result = await service.processDelivery(deliveryId);

      expect(result?.isSuccess).toBe(true);
      expect(result?.attemptNumber).toBe(2);

      // Verify old attempt marked ABANDONED
      expect(mockPrisma.webhookAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'crashed-attempt-1' },
          data: expect.objectContaining({
            outcome: WEBHOOK_ATTEMPT_STATUS.ABANDONED,
            errorCode: 'INTERRUPTED_BY_CRASH_OR_TIMEOUT',
          }),
        }),
      );

      // Verify new attempt created with incremented attemptNumber = 2
      expect(mockPrisma.webhookAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId,
          attemptNumber: 2,
          outcome: WEBHOOK_ATTEMPT_STATUS.STARTED,
        }),
      });
    });

    it('safely skips duplicate execution if delivery is concurrently being processed within lease', async () => {
      // Simulate delivery is currently in PROCESSING with a fresh lease (10 seconds ago)
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        ...mockDeliveryRecord,
        status: WEBHOOK_DELIVERY_STATUS.PROCESSING,
        claimedAt: new Date(Date.now() - 10000), // 10s ago, well within 120s lease
      });

      const result = await service.processDelivery(deliveryId);

      // Concurrently processing within lease -> should safely return null and not invoke HTTP
      expect(result).toBeNull();
      expect(mockHttpClient.executeDelivery).not.toHaveBeenCalled();
      expect(mockPrisma.webhookAttempt.create).not.toHaveBeenCalled();
    });
  });
});
