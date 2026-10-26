import crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  AUTH_COOKIES,
  SECURITY_CONFIG,
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
} from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookOutboxPublisherService } from './outbox/webhook-outbox-publisher.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';

describe('Webhook Deliveries & Replay API (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: `wh-del-a-${Date.now()}@devpulse.dev`,
    name: 'Deliveries User A',
    password: 'Password123!',
  };

  const userB = {
    email: `wh-del-b-${Date.now()}@devpulse.dev`,
    name: 'Deliveries User B',
    password: 'Password123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let _userBId: string;

  let endpointAId: string;
  let eventAId: string;
  let deliveryA1Id: string;
  let deliveryA2Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Register User A
    const resA = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userA);
    expect(resA.status).toBe(201);
    userAId = resA.body.user.id;
    const cookiesA = resA.headers['set-cookie'];
    const accessCookieA = cookiesA.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userACookie = accessCookieA.split(';')[0];

    // Register User B
    const resB = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userB);
    expect(resB.status).toBe(201);
    _userBId = resB.body.user.id;
    const cookiesB = resB.headers['set-cookie'];
    const accessCookieB = cookiesB.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userBCookie = accessCookieB.split(';')[0];

    // Create Endpoint for User A
    const epRes = await request(app.getHttpServer())
      .post('/webhooks')
      .set('Cookie', userACookie)
      .set(CSRF_HEADERS)
      .send({
        name: 'Initial Endpoint A',
        url: 'https://webhook.site/initial-a',
        description: 'Test Webhook Endpoint A',
        events: ['incident.created', 'incident.resolved'],
      });
    expect(epRes.status).toBe(201);
    endpointAId = epRes.body.endpoint.id;

    // Create Webhook Event for User A
    const event = await prisma.webhookEvent.create({
      data: {
        userId: userAId,
        type: 'incident.created',
        sourceType: 'incident',
        sourceId: 'inc-test-1',
        dedupeKey: `evt:test:1:${Date.now()}`,
        payload: {
          incident: {
            id: 'inc-test-1',
            monitorId: 'mon-1',
            monitorName: 'Production API',
            startedAt: new Date().toISOString(),
            resolvedAt: null,
            cause: 'HTTP 500 Internal Server Error',
          },
        },
      },
    });
    eventAId = event.id;

    // Create Webhook Delivery #1 (DELIVERED) with snapshot
    const d1 = await prisma.webhookDelivery.create({
      data: {
        eventId: event.id,
        endpointId: endpointAId,
        endpointName: 'Initial Endpoint A',
        destinationUrl: 'https://webhook.site/initial-a',
        origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
        status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
        attemptCount: 1,
        deliveredAt: new Date(),
        lastHttpStatus: 200,
      },
    });
    deliveryA1Id = d1.id;

    // Create Webhook Attempt for Delivery #1
    await prisma.webhookAttempt.create({
      data: {
        deliveryId: d1.id,
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 5000),
        finishedAt: new Date(),
        durationMs: 120,
        httpStatus: 200,
        outcome: 'SUCCESS',
        errorCode: null,
        responsePreview: '{"received": true}',
      },
    });

    // Create Webhook Event #2 for User A
    const event2 = await prisma.webhookEvent.create({
      data: {
        userId: userAId,
        type: 'incident.resolved',
        sourceType: 'incident',
        sourceId: 'inc-test-2',
        dedupeKey: `evt:test:2:${Date.now()}`,
        payload: {
          incident: {
            id: 'inc-test-2',
            monitorId: 'mon-1',
            monitorName: 'Production API',
            startedAt: new Date(Date.now() - 60000).toISOString(),
            resolvedAt: new Date().toISOString(),
          },
        },
      },
    });

    // Create Webhook Delivery #2 (FAILED)
    const d2 = await prisma.webhookDelivery.create({
      data: {
        eventId: event2.id,
        endpointId: endpointAId,
        endpointName: 'Initial Endpoint A',
        destinationUrl: 'https://webhook.site/initial-a',
        origin: WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC,
        status: WEBHOOK_DELIVERY_STATUS.FAILED,
        attemptCount: 6,
        lastHttpStatus: 500,
        lastErrorCode: 'HTTP_500',
      },
    });
    deliveryA2Id = d2.id;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'wh-del-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('GET /webhooks/deliveries (Listing & Filtering)', () => {
    it('returns tenant-isolated deliveries for User A', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.total).toBeGreaterThanOrEqual(2);

      const ids = res.body.items.map((i: any) => i.id);
      expect(ids).toContain(deliveryA1Id);
      expect(ids).toContain(deliveryA2Id);

      // Verify eventType is included
      const d1 = res.body.items.find((i: any) => i.id === deliveryA1Id);
      expect(d1.eventType).toBe('incident.created');
      expect(d1.endpointName).toBe('Initial Endpoint A');
    });

    it('returns empty list for User B (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('filters deliveries by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries?status=FAILED')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      res.body.items.forEach((item: any) => {
        expect(item.status).toBe('FAILED');
      });
    });

    it('filters deliveries by eventType', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries?eventType=incident.resolved')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      res.body.items.forEach((item: any) => {
        expect(item.eventType).toBe('incident.resolved');
      });
    });

    it('filters deliveries by origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries?origin=AUTOMATIC')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      res.body.items.forEach((item: any) => {
        expect(item.origin).toBe('AUTOMATIC');
      });
    });

    it('supports cursor pagination', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/webhooks/deliveries?limit=1')
        .set('Cookie', userACookie);

      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(1);
      expect(page1.body.hasMore).toBe(true);
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request(app.getHttpServer())
        .get(`/webhooks/deliveries?limit=1&cursor=${page1.body.nextCursor}`)
        .set('Cookie', userACookie);

      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    });
  });

  describe('GET /webhooks/deliveries/:id (Details & Snapshots)', () => {
    it('returns delivery details including immutable snapshot vs current endpoint and safe event payload', async () => {
      // First update endpoint name and url to test snapshot preservation
      await request(app.getHttpServer())
        .patch(`/webhooks/${endpointAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Renamed Endpoint A',
          url: 'https://webhook.site/updated-a',
        });

      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(deliveryA1Id);

      // Snapshot preserves original endpoint configuration
      expect(res.body.endpointName).toBe('Initial Endpoint A');
      expect(res.body.destinationUrl).toBe('https://webhook.site/initial-a');

      // Current endpoint reflects live configuration
      expect(res.body.currentEndpoint).toBeDefined();
      expect(res.body.currentEndpoint.name).toBe('Renamed Endpoint A');
      expect(res.body.currentEndpoint.url).toBe('https://webhook.site/updated-a');
      expect(res.body.currentEndpoint.isDeleted).toBe(false);

      // Safe event payload exposed
      expect(res.body.event).toBeDefined();
      expect(res.body.event.type).toBe('incident.created');
      expect(res.body.event.payload.incident.id).toBe('inc-test-1');

      // Attempt exposed
      expect(res.body.latestAttempt).toBeDefined();
      expect(res.body.latestAttempt.httpStatus).toBe(200);
      expect(res.body.latestAttempt.outcome).toBe('SUCCESS');
    });

    it('returns 404 when User B attempts to access User A delivery', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /webhooks/deliveries/:id/attempts', () => {
    it('returns chronological attempts timeline', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}/attempts`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].attemptNumber).toBe(1);
      expect(res.body[0].outcome).toBe('SUCCESS');
      expect(res.body[0].durationMs).toBe(120);
      expect(res.body[0].responsePreview).toBe('{"received": true}');
    });

    it('returns 404 when User B requests User A attempts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}/attempts`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /webhooks/deliveries/:id/replay (Manual Replay & Idempotency)', () => {
    const idempotencyKey = `replay-test-${Date.now()}`;

    it('rejects replay without Idempotency-Key header', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Idempotency-Key');
    });

    it('successfully triggers manual replay and creates child delivery with lineage', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', idempotencyKey)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(202);
      expect(res.body.message).toContain('accepted');
      expect(res.body.originalDeliveryId).toBe(deliveryA1Id);

      const replayDel = res.body.replayDelivery;
      expect(replayDel.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);
      expect(replayDel.replayOfId).toBe(deliveryA1Id);
      expect(replayDel.eventId).toBe(eventAId);
      expect(replayDel.endpointId).toBe(endpointAId);
      // Snapshots the current endpoint name/url
      expect(replayDel.endpointName).toBe('Renamed Endpoint A');
      expect(replayDel.destinationUrl).toBe('https://webhook.site/updated-a');
    });

    it('returns identical replay response when same Idempotency-Key is reused (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', idempotencyKey)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('idempotent');
      expect(res.body.originalDeliveryId).toBe(deliveryA1Id);
      expect(res.body.replayDelivery.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);
      expect(res.body.replayDelivery.replayOfId).toBe(deliveryA1Id);
    });

    it('allows a subsequent replay with a DIFFERENT Idempotency-Key', async () => {
      const freshKey = `replay-test-fresh-${Date.now()}`;

      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', freshKey)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(202);
      expect(res.body.message).toContain('accepted');
      expect(res.body.replayDelivery.id).not.toBe(deliveryA1Id);
    });

    it('safely handles concurrent replay requests with the exact same Idempotency-Key without race conditions', async () => {
      const concurrentKey = `concurrent-replay-${Date.now()}`;

      // Dispatch 2 concurrent requests simultaneously with identical Idempotency-Key
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
          .set('Cookie', userACookie)
          .set('Idempotency-Key', concurrentKey)
          .set(CSRF_HEADERS),
        request(app.getHttpServer())
          .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
          .set('Cookie', userACookie)
          .set('Idempotency-Key', concurrentKey)
          .set(CSRF_HEADERS),
      ]);

      expect([200, 202]).toContain(res1.status);
      expect([200, 202]).toContain(res2.status);
      expect([res1.status, res2.status]).toContain(202);
      expect([res1.status, res2.status]).toContain(200);

      // Both must resolve to the EXACT SAME replay delivery ID
      expect(res1.body.replayDelivery.id).toBe(res2.body.replayDelivery.id);
      expect(res1.body.replayDelivery.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);
      expect(res2.body.replayDelivery.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);

      // One request accepts fresh (202), the other gets the idempotent return (200)
      const messages = [res1.body.message, res2.body.message];
      expect(messages.some((m: string) => m.includes('accepted'))).toBe(true);
      expect(messages.some((m: string) => m.includes('idempotent'))).toBe(true);

      // Ensure only 1 delivery was persisted with this idempotency hash in DB
      const idempotencyHash = crypto
        .createHash('sha256')
        .update(`replay:${userAId}:${concurrentKey}`)
        .digest('hex');
      const count = await prisma.webhookDelivery.count({
        where: { replayIdempotencyKey: idempotencyHash },
      });
      expect(count).toBe(1);
    });

    it('returns 202 Accepted with durable acceptance message when Redis is unavailable, leaving delivery PENDING for background recovery', async () => {
      const redisDownKey = `redis-down-${Date.now()}`;

      // Temporarily mock delivery queue.add to simulate Redis downtime
      const queue = app.get(WebhookDeliveryService).getQueue();
      const addSpy = jest
        .spyOn(queue, 'add')
        .mockRejectedValueOnce(new Error('Redis connection refused'));

      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', redisDownKey)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(202);
      expect(res.body.message).toContain('asynchronously');
      expect(res.body.message).not.toContain('queued for delivery');

      const replayDelId = res.body.replayDelivery.id;

      // Assert delivery was durably persisted in database with status PENDING
      const inDb = await prisma.webhookDelivery.findUnique({
        where: { id: replayDelId },
      });
      expect(inDb).toBeDefined();
      expect(inDb?.status).toBe(WEBHOOK_DELIVERY_STATUS.PENDING);
      expect(inDb?.origin).toBe(WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY);

      // Restore real queue.add and verify background recovery safely enqueues it
      addSpy.mockRestore();

      const outboxPublisher = app.get(WebhookOutboxPublisherService);
      const recoveredCount = await outboxPublisher.recoverPendingReplays(50);
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      // Check BullMQ has the deterministic job
      const jobId = `webhook-delivery-${replayDelId}-initial`;
      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.data.deliveryId).toBe(replayDelId);
    });

    it('preserves root delivery lineage when replaying a delivery that is already a manual replay', async () => {
      // 1. First replay of original automatic delivery (deliveryA1Id)
      const key1 = `lineage-step-1-${Date.now()}`;
      const replay1Res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', key1)
        .set(CSRF_HEADERS);

      expect(replay1Res.status).toBe(202);
      const delivery2Id = replay1Res.body.replayDelivery.id;
      expect(replay1Res.body.replayDelivery.replayOfId).toBe(deliveryA1Id);

      // 2. Second replay of the replay delivery (delivery2Id)
      const key2 = `lineage-step-2-${Date.now()}`;
      const replay2Res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${delivery2Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', key2)
        .set(CSRF_HEADERS);

      expect(replay2Res.status).toBe(202);
      const delivery3Id = replay2Res.body.replayDelivery.id;
      // Critical check: Root lineage must point back to deliveryA1Id, NOT delivery2Id!
      expect(replay2Res.body.replayDelivery.replayOfId).toBe(deliveryA1Id);

      // 3. Third replay of delivery3Id
      const key3 = `lineage-step-3-${Date.now()}`;
      const replay3Res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${delivery3Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', key3)
        .set(CSRF_HEADERS);

      expect(replay3Res.status).toBe(202);
      // All child replays must consistently reference root automatic deliveryA1Id
      expect(replay3Res.body.replayDelivery.replayOfId).toBe(deliveryA1Id);
    });

    it('returns 404 when User B attempts to replay User A delivery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userBCookie)
        .set('Idempotency-Key', `b-key-${Date.now()}`)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(404);
    });

    it('rejects replay with 409 Conflict if endpoint is disabled', async () => {
      // Disable endpoint
      await request(app.getHttpServer())
        .patch(`/webhooks/${endpointAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ isEnabled: false });

      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', `disabled-key-${Date.now()}`)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('disabled');

      // Re-enable endpoint
      await request(app.getHttpServer())
        .patch(`/webhooks/${endpointAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ isEnabled: true });
    });
  });

  describe('API Key Scoped Authentication & CSRF Protection on Phase 9 Routes', () => {
    let readOnlyApiKey: string;
    let writeOnlyApiKey: string;
    let unrelatedScopeApiKey: string;
    let revokedApiKey: string;
    let userBApiKey: string;

    beforeAll(async () => {
      // 1. Create read-only API key for User A (webhooks:read)
      const readRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Deliveries Read Only',
          scopes: ['webhooks:read'],
        });
      expect(readRes.status).toBe(201);
      readOnlyApiKey = readRes.body.rawKey;

      // 2. Create write-only API key for User A (webhooks:write)
      const writeRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Deliveries Write Only',
          scopes: ['webhooks:write'],
        });
      expect(writeRes.status).toBe(201);
      writeOnlyApiKey = writeRes.body.rawKey;

      // 3. Create unrelated scope key for User A (monitors:read)
      const unkRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Monitors Only',
          scopes: ['monitors:read'],
        });
      expect(unkRes.status).toBe(201);
      unrelatedScopeApiKey = unkRes.body.rawKey;

      // 4. Create and revoke an API key for User A
      const revRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Revoked Key',
          scopes: ['webhooks:read', 'webhooks:write'],
        });
      expect(revRes.status).toBe(201);
      revokedApiKey = revRes.body.rawKey;
      await request(app.getHttpServer())
        .patch(`/api-keys/${revRes.body.apiKey.id}/revoke`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS);

      // 5. Create API key for User B (tenant test)
      const bRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userBCookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'User B Key',
          scopes: ['webhooks:read', 'webhooks:write'],
        });
      expect(bRes.status).toBe(201);
      userBApiKey = bRes.body.rawKey;
    });

    it('allows GET /webhooks/deliveries with webhooks:read scope', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('x-api-key', readOnlyApiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('allows GET /webhooks/deliveries/:id with webhooks:read scope', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}`)
        .set('x-api-key', readOnlyApiKey);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(deliveryA1Id);
    });

    it('allows GET /webhooks/deliveries/:id/attempts with webhooks:read scope', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}/attempts`)
        .set('x-api-key', readOnlyApiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('denies POST replay with 403 when API key has only webhooks:read scope', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('x-api-key', readOnlyApiKey)
        .set('Idempotency-Key', `apikey-forbidden-${Date.now()}`);

      expect(res.status).toBe(403);
    });

    it('allows POST replay with webhooks:write scope without CSRF headers (programmatic API key)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('x-api-key', writeOnlyApiKey)
        .set('Idempotency-Key', `apikey-success-${Date.now()}`);

      expect(res.status).toBe(202);
      expect(res.body.replayDelivery).toBeDefined();
    });

    it('denies GET /webhooks/deliveries with 403 when API key lacks webhooks:read scope', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('x-api-key', unrelatedScopeApiKey);

      expect(res.status).toBe(403);
    });

    it('denies access with 401 when API key is revoked', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('x-api-key', revokedApiKey);

      expect(res.status).toBe(401);
    });

    it('returns 404 when User B API key attempts to access User A delivery (tenant boundary)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}`)
        .set('x-api-key', userBApiKey);

      expect(res.status).toBe(404);
    });

    it('rejects browser cookie-authenticated POST replay without CSRF header (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', `browser-no-csrf-${Date.now()}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Durable Recovery of Orphaned Manual Replays', () => {
    let outboxPublisher: WebhookOutboxPublisherService;

    beforeAll(() => {
      outboxPublisher = app.get<WebhookOutboxPublisherService>(
        WebhookOutboxPublisherService,
      );
    });

    it('reconciles orphaned PENDING manual replay delivery into BullMQ queue', async () => {
      // 1. Manually insert a PENDING manual replay delivery in DB simulating Redis failure during POST replay
      const orphanedDelivery = await prisma.webhookDelivery.create({
        data: {
          eventId: eventAId,
          endpointId: endpointAId,
          endpointName: 'Initial Endpoint A',
          destinationUrl: 'https://webhook.site/initial-a',
          origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
          replayOfId: deliveryA1Id,
          replayIdempotencyKey: `orphaned-key-${Date.now()}`,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
          attemptCount: 0,
        },
      });

      // 2. Run recovery
      const recoveredCount = await outboxPublisher.recoverPendingReplays(50);
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      // 3. Verify BullMQ has the deterministic job
      const queue = outboxPublisher.getQueue();
      const jobId = `webhook-delivery-${orphanedDelivery.id}-initial`;
      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.data.deliveryId).toBe(orphanedDelivery.id);

      // 4. Running recovery again should be a no-op (idempotent, existing job detected)
      const secondRun = await outboxPublisher.recoverPendingReplays(50);
      expect(secondRun).toBe(0);
    });

    it('marks orphaned PENDING manual replay as FAILED if destination endpoint was deleted', async () => {
      // Create a soft-deleted endpoint
      const deletedEndpoint = await prisma.webhookEndpoint.create({
        data: {
          userId: userAId,
          name: 'Deleted Endpoint',
          url: 'https://webhook.site/deleted-orphan',
          events: ['incident.created'],
          encryptedSecret: 'dummy',
          deletedAt: new Date(),
        },
      });

      const deadReplay = await prisma.webhookDelivery.create({
        data: {
          eventId: eventAId,
          endpointId: deletedEndpoint.id,
          endpointName: 'Deleted Endpoint',
          destinationUrl: 'https://webhook.site/deleted-orphan',
          origin: WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY,
          status: WEBHOOK_DELIVERY_STATUS.PENDING,
          attemptCount: 0,
        },
      });

      await outboxPublisher.recoverPendingReplays(50);

      const check = await prisma.webhookDelivery.findUnique({
        where: { id: deadReplay.id },
      });
      expect(check?.status).toBe(WEBHOOK_DELIVERY_STATUS.FAILED);
      expect(check?.lastErrorCode).toBe('ENDPOINT_DELETED');
    });
  });

  describe('Soft Deletion History Preservation', () => {
    it('preserves deliveries and attempts after soft-deleting endpoint and rejects replay with 409', async () => {
      // Delete the endpoint via API (soft-delete)
      const delRes = await request(app.getHttpServer())
        .delete(`/webhooks/${endpointAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify endpoint is hidden from GET /webhooks
      const epListRes = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Cookie', userACookie);
      expect(epListRes.status).toBe(200);
      expect(epListRes.body.some((e: any) => e.id === endpointAId)).toBe(false);

      // Deliveries still accessible in history!
      const histRes = await request(app.getHttpServer())
        .get('/webhooks/deliveries')
        .set('Cookie', userACookie);

      expect(histRes.status).toBe(200);
      const deliveryItem = histRes.body.items.find(
        (i: any) => i.id === deliveryA1Id,
      );
      expect(deliveryItem).toBeDefined();

      // Delivery details indicate endpoint is deleted
      const detailRes = await request(app.getHttpServer())
        .get(`/webhooks/deliveries/${deliveryA1Id}`)
        .set('Cookie', userACookie);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.currentEndpoint).toBeDefined();
      expect(detailRes.body.currentEndpoint.isDeleted).toBe(true);

      // Replay is rejected because endpoint is deleted
      const replayRes = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${deliveryA1Id}/replay`)
        .set('Cookie', userACookie)
        .set('Idempotency-Key', `deleted-replay-${Date.now()}`)
        .set(CSRF_HEADERS);

      expect(replayRes.status).toBe(409);
      expect(replayRes.body.message).toContain('deleted');
    });
  });
});
