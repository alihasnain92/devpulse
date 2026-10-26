import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_OUTBOX_STATUS,
} from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';
import { WebhookOutboxPublisherService } from './outbox/webhook-outbox-publisher.service';
import { WebhookSignerService } from './crypto/webhook-signer.service';
import { WebhookHttpClientService } from './http/webhook-http-client.service';
import { IncidentsService } from '../incidents/incidents.service';

describe('Webhook Delivery Pipeline (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let webhooksService: WebhooksService;
  let deliveryService: WebhookDeliveryService;
  let outboxPublisher: WebhookOutboxPublisherService;
  let signerService: WebhookSignerService;
  let httpClient: WebhookHttpClientService;
  let incidentsService: IncidentsService;

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-1' }),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  };

  let userAId: string;
  let userBId: string;
  let monitorAId: string;
  let endpointA1Id: string;
  let endpointA2Id: string;
  let endpointBId: string;
  let endpointA1RawSecret: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    webhooksService = app.get<WebhooksService>(WebhooksService);
    deliveryService = app.get<WebhookDeliveryService>(WebhookDeliveryService);
    outboxPublisher = app.get<WebhookOutboxPublisherService>(
      WebhookOutboxPublisherService,
    );
    signerService = app.get<WebhookSignerService>(WebhookSignerService);
    httpClient = app.get<WebhookHttpClientService>(WebhookHttpClientService);
    incidentsService = app.get<IncidentsService>(IncidentsService);

    // Mock BullMQ queues to prevent external Redis dependency during unit-integration tests
    deliveryService.setQueue(mockQueue as any);
    outboxPublisher.setQueue(mockQueue as any);

    // Create User A
    const userA = await prisma.user.create({
      data: {
        email: `wh-pipe-a-${Date.now()}@devpulse.dev`,
        name: 'Pipeline User A',
        hashedPassword: 'hashed_pw_test',
      },
    });
    userAId = userA.id;

    // Create User B (for tenant isolation verification)
    const userB = await prisma.user.create({
      data: {
        email: `wh-pipe-b-${Date.now()}@devpulse.dev`,
        name: 'Pipeline User B',
        hashedPassword: 'hashed_pw_test',
      },
    });
    userBId = userB.id;

    // Create Monitor for User A
    const monitorA = await prisma.monitor.create({
      data: {
        userId: userAId,
        name: 'User A Production API',
        url: 'https://api.example.com/health',
        method: 'GET',
        intervalSeconds: 60,
        timeoutMs: 10000,
        expectedStatus: 200,
      },
    });
    monitorAId = monitorA.id;

    // Register Webhook Endpoint 1 for User A (subscribes to incident.created and incident.resolved)
    const ep1 = await webhooksService.create(userAId, {
      name: 'User A Incident Pager',
      url: 'https://webhook.site/user-a-pager',
      description: 'PagerDuty receiver',
      events: ['incident.created', 'incident.resolved'],
    });
    endpointA1Id = ep1.endpoint.id;
    endpointA1RawSecret = ep1.signingSecret;

    // Register Webhook Endpoint 2 for User A (subscribes ONLY to incident.resolved)
    const ep2 = await webhooksService.create(userAId, {
      name: 'User A Slack Recovery Channel',
      url: 'https://webhook.site/user-a-slack',
      events: ['incident.resolved'],
    });
    endpointA2Id = ep2.endpoint.id;

    // Register Webhook Endpoint for User B
    const epB = await webhooksService.create(userBId, {
      name: 'User B Webhook',
      url: 'https://webhook.site/user-b-hook',
      events: ['incident.created', 'incident.resolved'],
    });
    endpointBId = epB.endpoint.id;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          id: { in: [userAId, userBId] },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await outboxPublisher.onModuleDestroy();
    await app.close();
  });

  describe('1. Incident State Transition to Outbox Atomicity', () => {
    let incidentId: string;

    it('creates incident.created WebhookEvent and WebhookOutbox atomically in transaction', async () => {
      // Execute 3 consecutive failed checks in a transaction to trigger an incident
      const t0 = new Date('2026-10-27T01:00:00.000Z');
      const t1 = new Date('2026-10-27T01:01:00.000Z');
      const t2 = new Date('2026-10-27T01:02:00.000Z');

      await prisma.$transaction(async (tx) => {
        // Record 3 failures
        await tx.checkResult.createMany({
          data: [
            { monitorId: monitorAId, isSuccess: false, statusCode: 503, latencyMs: 100, checkedAt: t0 },
            { monitorId: monitorAId, isSuccess: false, statusCode: 503, latencyMs: 110, checkedAt: t1 },
            { monitorId: monitorAId, isSuccess: false, statusCode: 503, latencyMs: 120, checkedAt: t2 },
          ],
        });

        const incident = await incidentsService.evaluateIncidentTransition(
          tx as any,
          monitorAId,
          {
            id: 'chk-3',
            isSuccess: false,
            statusCode: 503,
            errorMessage: 'HTTP 503 Service Unavailable',
            checkedAt: t2,
          },
          200,
        );

        expect(incident).toBeDefined();
        incidentId = incident!.id;
      });

      // Verify WebhookEvent was persisted
      const event = await prisma.webhookEvent.findUnique({
        where: { dedupeKey: `incident.created:${incidentId}` },
      });
      expect(event).toBeDefined();
      expect(event?.userId).toBe(userAId);
      expect(event?.type).toBe('incident.created');
      expect((event?.payload as any)?.data?.incident?.id).toBe(incidentId);

      // Verify WebhookOutbox row was created in PENDING status
      const outbox = await prisma.webhookOutbox.findUnique({
        where: { eventId: event!.id },
      });
      expect(outbox).toBeDefined();
      expect(outbox?.status).toBe(WEBHOOK_OUTBOX_STATUS.PENDING);
    });

    it('prevents duplicate event creation when checking an already open incident', async () => {
      // 4th failure while incident is already open
      await prisma.$transaction(async (tx) => {
        await tx.checkResult.create({
          data: {
            monitorId: monitorAId,
            isSuccess: false,
            statusCode: 503,
            latencyMs: 130,
            checkedAt: new Date('2026-10-27T01:03:00.000Z'),
          },
        });

        await incidentsService.evaluateIncidentTransition(
          tx as any,
          monitorAId,
          {
            id: 'chk-4',
            isSuccess: false,
            statusCode: 503,
            errorMessage: 'HTTP 503 Service Unavailable',
            checkedAt: new Date('2026-10-27T01:03:00.000Z'),
          },
          200,
        );
      });

      // Total events for this incident must strictly remain 1
      const events = await prisma.webhookEvent.findMany({
        where: { sourceId: incidentId },
      });
      expect(events).toHaveLength(1);
    });
  });

  describe('2. Outbox Publisher & Delivery Fanout', () => {
    it('claims pending outbox row, fans out to subscribed endpoints, and marks outbox COMPLETED', async () => {
      mockQueue.add.mockClear();

      const summary = await outboxPublisher.publishPending();

      expect(summary.processedCount).toBeGreaterThanOrEqual(1);
      expect(summary.errors).toBe(0);

      // Endpoint A1 subscribes to incident.created; Endpoint A2 only to incident.resolved.
      // Endpoint B belongs to User B.
      // Therefore, exactly 1 delivery should have been created for Endpoint A1.
      const deliveries = await prisma.webhookDelivery.findMany({
        where: {
          endpoint: { userId: userAId },
        },
      });

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].endpointId).toBe(endpointA1Id);
      expect(deliveries[0].status).toBe(WEBHOOK_DELIVERY_STATUS.PENDING);

      // Verify no deliveries created for User B (tenant isolation)
      const userBDeliveries = await prisma.webhookDelivery.findMany({
        where: { endpointId: endpointBId },
      });
      expect(userBDeliveries).toHaveLength(0);

      // Verify BullMQ job was enqueued
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: deliveries[0].id },
        expect.objectContaining({ jobId: `webhook-delivery:${deliveries[0].id}` }),
      );
    });
  });

  describe('3. Webhook Delivery Execution & HMAC Verification', () => {
    it('executes delivery with valid HMAC signature and marks DELIVERED on HTTP 200', async () => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { endpointId: endpointA1Id },
      });
      expect(delivery).toBeDefined();

      // Mock HTTP client to intercept and inspect headers and signature
      let capturedHeaders: Record<string, string> = {};
      let capturedPayload = '';

      jest.spyOn(httpClient, 'executeDelivery').mockImplementation(
        async (_url, payloadString, headers) => {
          capturedPayload = payloadString;
          capturedHeaders = headers;
          return {
            statusCode: 200,
            latencyMs: 85,
            isSuccess: true,
            errorMessage: null,
            responsePreview: '{"received":true}',
            resolvedIp: '93.184.216.34',
          };
        },
      );

      const result = await deliveryService.processDelivery(delivery!.id);

      expect(result?.isSuccess).toBe(true);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.DELIVERED);

      // Verify WebhookAttempt was recorded
      const attempts = await prisma.webhookAttempt.findMany({
        where: { deliveryId: delivery!.id },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptNumber).toBe(1);
      expect(attempts[0].outcome).toBe('SUCCESS');
      expect(attempts[0].httpStatus).toBe(200);

      // Verify HMAC-SHA256 signature using Phase 7 WebhookSignerService and the raw endpoint secret
      const signatureHeader = capturedHeaders['X-DevPulse-Signature'];
      expect(signatureHeader).toBeDefined();
      expect(signatureHeader).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

      const verification = signerService.verifySignature(
        endpointA1RawSecret,
        capturedPayload,
        signatureHeader,
      );
      expect(verification.isValid).toBe(true);

      // Tampered payload verification fails
      const tamperedVerification = signerService.verifySignature(
        endpointA1RawSecret,
        capturedPayload + '{"tampered":true}',
        signatureHeader,
      );
      expect(tamperedVerification.isValid).toBe(false);
    });

    it('is idempotent: re-processing an already DELIVERED delivery does not make extra requests', async () => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { endpointId: endpointA1Id },
      });

      const spy = jest.spyOn(httpClient, 'executeDelivery');
      spy.mockClear();

      const result = await deliveryService.processDelivery(delivery!.id);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.DELIVERED);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('4. Resolution Event Pipeline & Multi-Endpoint Fanout', () => {
    it('creates incident.resolved event and fans out to both Endpoint A1 and Endpoint A2', async () => {
      // Resolve the incident via a successful check
      const tRecovery = new Date('2026-10-27T01:10:00.000Z');
      await prisma.$transaction(async (tx) => {
        const recoveryCheck = await tx.checkResult.create({
          data: {
            monitorId: monitorAId,
            isSuccess: true,
            statusCode: 200,
            latencyMs: 90,
            checkedAt: tRecovery,
          },
        });

        await incidentsService.evaluateIncidentTransition(
          tx as any,
          monitorAId,
          recoveryCheck,
          200,
        );
      });

      // Verify incident.resolved event was created
      const resolvedEvent = await prisma.webhookEvent.findFirst({
        where: {
          type: 'incident.resolved',
          userId: userAId,
        },
      });
      expect(resolvedEvent).toBeDefined();

      // Publish the outbox
      mockQueue.add.mockClear();
      const summary = await outboxPublisher.publishPending();

      expect(summary.processedCount).toBeGreaterThanOrEqual(1);

      // Both Endpoint A1 and A2 subscribe to incident.resolved!
      const deliveries = await prisma.webhookDelivery.findMany({
        where: { eventId: resolvedEvent!.id },
      });
      expect(deliveries).toHaveLength(2);
      const endpointIds = deliveries.map((d) => d.endpointId);
      expect(endpointIds).toContain(endpointA1Id);
      expect(endpointIds).toContain(endpointA2Id);
    });
  });

  describe('5. Error Classification & Disabled Endpoints', () => {
    it('aborts delivery and marks FAILED when endpoint is disabled', async () => {
      // Disable endpoint A2
      await prisma.webhookEndpoint.update({
        where: { id: endpointA2Id },
        data: { isEnabled: false },
      });

      const delivery = await prisma.webhookDelivery.findFirst({
        where: {
          endpointId: endpointA2Id,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
        },
      });
      expect(delivery).toBeDefined();

      const spy = jest.spyOn(httpClient, 'executeDelivery');
      spy.mockClear();

      const result = await deliveryService.processDelivery(delivery!.id);

      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(result?.error).toBe('ENDPOINT_DISABLED');
      expect(spy).not.toHaveBeenCalled();
    });

    it('marks permanent failure on HTTP 404 without retrying', async () => {
      // Create a dedicated test event so (eventId, endpointId) is unique
      const testEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-test-404',
          dedupeKey: `test:404:${Date.now()}`,
          payload: { test: 404 },
        },
      });

      const newDelivery = await prisma.webhookDelivery.create({
        data: {
          eventId: testEvent.id,
          endpointId: endpointA1Id,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
        },
      });

      jest.spyOn(httpClient, 'executeDelivery').mockResolvedValueOnce({
        statusCode: 404,
        latencyMs: 70,
        isSuccess: false,
        errorMessage: 'HTTP 404 response received',
        responsePreview: 'Not Found',
        resolvedIp: '93.184.216.34',
      });

      mockQueue.add.mockClear();

      const result = await deliveryService.processDelivery(newDelivery.id);

      expect(result?.isSuccess).toBe(false);
      expect(result?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(mockQueue.add).not.toHaveBeenCalled();

      // Clean up test delivery
      await prisma.webhookDelivery.delete({ where: { id: newDelivery.id } });
    });
  });

  describe('6. Hardened Crash Safety, Lease Recovery & Concurrency', () => {
    it('recovers stale PROCESSING outbox records whose lease expired', async () => {
      // Create a test event and an outbox row stuck in PROCESSING with an expired lease
      const crashEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-crash-outbox',
          dedupeKey: `test:crash:outbox:${Date.now()}`,
          payload: { incident: 'crash-outbox' },
        },
      });

      const staleClaimedAt = new Date(Date.now() - 75000); // 75s ago (> 60s lease)
      const staleOutbox = await prisma.webhookOutbox.create({
        data: {
          eventId: crashEvent.id,
          status: 'PROCESSING',
          claimedAt: staleClaimedAt,
        },
      });

      mockQueue.add.mockClear();

      // Poller runs and claims the stale outbox
      const summary = await outboxPublisher.publishPending();

      expect(summary.processedCount).toBeGreaterThanOrEqual(1);

      // Verify the outbox transitioned to COMPLETED
      const updatedOutbox = await prisma.webhookOutbox.findUnique({
        where: { id: staleOutbox.id },
      });
      expect(updatedOutbox?.status).toBe('COMPLETED');
      expect(updatedOutbox?.claimedAt).toBeNull();

      // Verify delivery was created
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { eventId: crashEvent.id },
      });
      expect(delivery).toBeDefined();
    });

    it('reconciles when BullMQ job exists but outbox was not completed', async () => {
      // Create event and delivery
      const event = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-crash-reconcile',
          dedupeKey: `test:crash:reconcile:${Date.now()}`,
          payload: { incident: 'crash-reconcile' },
        },
      });

      const outbox = await prisma.webhookOutbox.create({
        data: {
          eventId: event.id,
          status: 'PENDING',
        },
      });

      // Delivery already created in DB from a previous attempt
      const delivery = await prisma.webhookDelivery.create({
        data: {
          eventId: event.id,
          endpointId: endpointA1Id,
          status: 'PENDING',
        },
      });

      // Mock BullMQ reporting that the job is already present in queue
      mockQueue.getJob.mockImplementation(async (jobId: string) => {
        if (jobId === `webhook-delivery:${delivery.id}`) {
          return { id: jobId, getState: async () => 'waiting' };
        }
        return null;
      });

      mockQueue.add.mockClear();

      const summary = await outboxPublisher.publishPending();

      expect(summary.processedCount).toBeGreaterThanOrEqual(1);
      // No duplicate queue.add call for delivery
      expect(mockQueue.add).not.toHaveBeenCalledWith(
        'webhook-delivery',
        { deliveryId: delivery.id },
        expect.anything(),
      );

      // Outbox successfully marked COMPLETED
      const updatedOutbox = await prisma.webhookOutbox.findUnique({
        where: { id: outbox.id },
      });
      expect(updatedOutbox?.status).toBe('COMPLETED');

      mockQueue.getJob.mockReset();
    });

    it('safely handles partial endpoint fanout on retry without duplicate deliveries', async () => {
      // Re-enable endpoint A2 and subscribe to incident.created so all 3 endpoints match
      await prisma.webhookEndpoint.update({
        where: { id: endpointA2Id },
        data: {
          isEnabled: true,
          events: ['incident.created', 'incident.resolved'],
        },
      });

      // Create a 3rd endpoint for userA
      const endpointA3 = await webhooksService.create(userAId, {
        name: 'Third Integration Endpoint',
        url: 'https://third.endpoint.devpulse/hook',
        events: ['incident.created'],
      });

      const event = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-partial-fanout',
          dedupeKey: `test:crash:partial:${Date.now()}`,
          payload: { incident: 'partial-fanout' },
        },
      });

      const outbox = await prisma.webhookOutbox.create({
        data: {
          eventId: event.id,
          status: 'PENDING',
        },
      });

      // Endpoint A1 already has a delivery created and job enqueued
      const existingDelivery = await prisma.webhookDelivery.create({
        data: {
          eventId: event.id,
          endpointId: endpointA1Id,
          status: 'PENDING',
        },
      });

      mockQueue.getJob.mockImplementation(async (jobId: string) => {
        if (jobId === `webhook-delivery:${existingDelivery.id}`) {
          return { id: jobId };
        }
        return null;
      });

      mockQueue.add.mockClear();

      const summary = await outboxPublisher.publishPending();

      expect(summary.processedCount).toBeGreaterThanOrEqual(1);

      // All 3 endpoints should now have deliveries for this event
      const allDeliveries = await prisma.webhookDelivery.findMany({
        where: { eventId: event.id },
      });
      expect(allDeliveries).toHaveLength(3);

      // Verify no duplicates: each endpointId occurs exactly once
      const endpointIds = allDeliveries.map((d) => d.endpointId);
      expect(new Set(endpointIds).size).toBe(3);

      // Outbox completed
      const updatedOutbox = await prisma.webhookOutbox.findUnique({
        where: { id: outbox.id },
      });
      expect(updatedOutbox?.status).toBe('COMPLETED');

      // Cleanup endpointA3
      await prisma.webhookEndpoint.delete({
        where: { id: endpointA3.endpoint.id },
      });
      mockQueue.getJob.mockReset();
    });

    it('persists durable attempt in STARTED status BEFORE executing outbound HTTP request', async () => {
      const testEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-pre-http-check',
          dedupeKey: `test:pre-http:${Date.now()}`,
          payload: { test: 'pre-http' },
        },
      });

      const delivery = await prisma.webhookDelivery.create({
        data: {
          eventId: testEvent.id,
          endpointId: endpointA1Id,
          status: 'PENDING',
        },
      });

      let attemptFoundDuringHttp: any = null;

      // Spy on HTTP client: inside executeDelivery, inspect PostgreSQL database
      jest
        .spyOn(httpClient, 'executeDelivery')
        .mockImplementationOnce(async () => {
          // Check whether the WebhookAttempt row already exists in the database
          attemptFoundDuringHttp = await prisma.webhookAttempt.findFirst({
            where: { deliveryId: delivery.id },
          });

          return {
            statusCode: 200,
            latencyMs: 45,
            isSuccess: true,
            errorMessage: null,
            responsePreview: '{"ok":true}',
            resolvedIp: '93.184.216.34',
          };
        });

      await deliveryService.processDelivery(delivery.id);

      // Assert that BEFORE executeDelivery returned, an attempt in 'STARTED' existed
      expect(attemptFoundDuringHttp).toBeDefined();
      expect(attemptFoundDuringHttp.outcome).toBe('STARTED');
      expect(attemptFoundDuringHttp.attemptNumber).toBe(1);
      expect(attemptFoundDuringHttp.finishedAt).toBeNull();
      expect(attemptFoundDuringHttp.durationMs).toBeNull();

      // Assert that AFTER completion, the attempt was updated to SUCCESS
      const finalAttempt = await prisma.webhookAttempt.findFirst({
        where: { deliveryId: delivery.id },
      });
      expect(finalAttempt?.outcome).toBe('SUCCESS');
      expect(finalAttempt?.finishedAt).toBeDefined();
      expect(finalAttempt?.durationMs).toBe(45);
    });

    it('recovers from crashed attempt in STARTED by marking it ABANDONED and allocating attempt 2', async () => {
      const testEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-crashed-attempt',
          dedupeKey: `test:crashed-attempt:${Date.now()}`,
          payload: { test: 'crashed-attempt' },
        },
      });

      // Delivery with attemptCount = 1
      const delivery = await prisma.webhookDelivery.create({
        data: {
          eventId: testEvent.id,
          endpointId: endpointA1Id,
          status: 'PROCESSING',
          attemptCount: 1,
          claimedAt: new Date(Date.now() - 130000), // > 120s lease
        },
      });

      // Existing attempt left in 'STARTED' because worker died mid-flight
      const crashedAttempt = await prisma.webhookAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptNumber: 1,
          startedAt: new Date(Date.now() - 130000),
          outcome: 'STARTED',
        },
      });

      jest.spyOn(httpClient, 'executeDelivery').mockResolvedValueOnce({
        statusCode: 200,
        latencyMs: 50,
        isSuccess: true,
        errorMessage: null,
        responsePreview: '{"ok":true}',
        resolvedIp: '93.184.216.34',
      });

      // Worker retries delivery
      const result = await deliveryService.processDelivery(delivery.id);

      expect(result?.isSuccess).toBe(true);
      expect(result?.attemptNumber).toBe(2);

      // Verify old attempt #1 is still in DB, marked ABANDONED (not overwritten)
      const oldAttempt = await prisma.webhookAttempt.findUnique({
        where: { id: crashedAttempt.id },
      });
      expect(oldAttempt?.outcome).toBe('ABANDONED');
      expect(oldAttempt?.errorCode).toBe('INTERRUPTED_BY_CRASH_OR_TIMEOUT');
      expect(oldAttempt?.attemptNumber).toBe(1);

      // Verify new attempt #2 exists in SUCCESS
      const newAttempt = await prisma.webhookAttempt.findFirst({
        where: { deliveryId: delivery.id, attemptNumber: 2 },
      });
      expect(newAttempt?.outcome).toBe('SUCCESS');

      // Verify total attempts is 2
      const allAttempts = await prisma.webhookAttempt.findMany({
        where: { deliveryId: delivery.id },
      });
      expect(allAttempts).toHaveLength(2);
    });

    it('coordinates concurrent duplicate jobs without duplicate attempt numbers or double-sends', async () => {
      const testEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-concurrent-delivery',
          dedupeKey: `test:concurrent:${Date.now()}`,
          payload: { test: 'concurrent' },
        },
      });

      const delivery = await prisma.webhookDelivery.create({
        data: {
          eventId: testEvent.id,
          endpointId: endpointA1Id,
          status: 'PENDING',
          attemptCount: 0,
        },
      });

      jest.spyOn(httpClient, 'executeDelivery').mockImplementation(async () => {
        // Introduce small artificial latency to allow concurrency race
        await new Promise((res) => setTimeout(res, 50));
        return {
          statusCode: 200,
          latencyMs: 50,
          isSuccess: true,
          errorMessage: null,
          responsePreview: '{"ok":true}',
          resolvedIp: '93.184.216.34',
        };
      });

      // Launch 2 concurrent executions for the same deliveryId
      const [res1, res2] = await Promise.all([
        deliveryService.processDelivery(delivery.id),
        deliveryService.processDelivery(delivery.id),
      ]);

      // Exactly one executes or one reconciles
      const successfulExecutions = [res1, res2].filter(
        (r) => r !== null && r.isSuccess,
      );
      expect(successfulExecutions.length).toBeGreaterThanOrEqual(1);

      // Verify no duplicate attempt numbers in PostgreSQL
      const attempts = await prisma.webhookAttempt.findMany({
        where: { deliveryId: delivery.id },
      });

      const attemptNumbers = attempts.map((a) => a.attemptNumber);
      const uniqueAttemptNumbers = new Set(attemptNumbers);
      expect(attemptNumbers.length).toBe(uniqueAttemptNumbers.size);

      // Delivery is DELIVERED with attemptCount = 1
      const finalDelivery = await prisma.webhookDelivery.findUnique({
        where: { id: delivery.id },
      });
      expect(finalDelivery?.status).toBe(WEBHOOK_DELIVERY_STATUS.DELIVERED);
      expect(finalDelivery?.attemptCount).toBe(1);
    });
  });
});
