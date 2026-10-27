import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  AUTH_COOKIES,
  RATE_LIMIT_HEADERS,
  RATE_LIMIT_POLICIES,
  SECURITY_CONFIG,
} from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from './rate-limiter.service';

describe('Rate Limiting & Security Hardening (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rateLimiter: RateLimiterService;

  const testUser = {
    email: `ratelimit-test-${Date.now()}@devpulse.dev`,
    name: 'RateLimit Tester',
    password: 'StrongRateLimitPassword123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let accessTokenCookie: string;
  let userId: string;
  let monitorId: string;

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
    rateLimiter = app.get<RateLimiterService>(RateLimiterService);

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(testUser);

    expect(regRes.status).toBe(201);
    userId = regRes.body.user.id;

    const setCookie = regRes.headers['set-cookie'] as unknown as string[];
    const accessCookie = setCookie.find((c) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    accessTokenCookie = accessCookie!.split(';')[0];

    // Create a monitor for check tests
    const monRes = await request(app.getHttpServer())
      .post('/monitors')
      .set(CSRF_HEADERS)
      .set('Cookie', [accessTokenCookie])
      .send({
        name: 'RateLimit Test Monitor',
        url: 'https://example.com',
        intervalSeconds: 60,
      });

    expect(monRes.status).toBe(201);
    monitorId = monRes.body.id;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'ratelimit-test-' } },
      });
    } catch {
      // ignore cleanup error
    }
    await app.close();
  });

  describe('Standard Rate Limit Headers', () => {
    it('sets X-RateLimit headers on authenticated requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('Cookie', [accessTokenCookie]);

      expect(res.status).toBe(200);
      expect(res.headers[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()]).toBe(
        RATE_LIMIT_POLICIES.USER_READ.limit.toString(),
      );
      expect(
        res.headers[RATE_LIMIT_HEADERS.REMAINING.toLowerCase()],
      ).toBeDefined();
      expect(res.headers[RATE_LIMIT_HEADERS.RESET.toLowerCase()]).toBeDefined();
    });
  });

  describe('Auth Login Rate Limiting & Brute-Force Defense', () => {
    const targetEmail = `brute-target-${Date.now()}@devpulse.dev`;

    it('throttles login attempts after exceeding policy limit and returns generic error', async () => {
      // Limit is 5 attempts / min
      for (let i = 0; i < RATE_LIMIT_POLICIES.AUTH_LOGIN.limit; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set(CSRF_HEADERS)
          .send({
            email: targetEmail,
            password: 'wrongpassword',
          });

        // 401 Unauthorized for invalid credentials
        expect(res.status).toBe(401);
      }

      // Next attempt must be blocked with HTTP 429
      const blockedRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set(CSRF_HEADERS)
        .send({
          email: targetEmail,
          password: 'wrongpassword',
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.statusCode).toBe(429);
      expect(blockedRes.body.message).toBe(
        'Too many requests. Please try again later.',
      );
      expect(
        blockedRes.headers[RATE_LIMIT_HEADERS.RETRY_AFTER.toLowerCase()],
      ).toBeDefined();
    });
  });

  describe('Manual Monitor Check Dual-Key Rate Limiting', () => {
    it('blocks rapid manual checks when per-target quota (3/min) is reached', async () => {
      // Reset rate limit keys for clean testing
      await rateLimiter.resetLimit(
        `${RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.keyPrefix}:${userId}`,
      );
      await rateLimiter.resetLimit(
        `${RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.keyPrefix}:${monitorId}`,
      );

      // Trigger 3 checks successfully
      for (let i = 0; i < RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.limit; i++) {
        const res = await request(app.getHttpServer())
          .post(`/monitors/${monitorId}/check`)
          .set(CSRF_HEADERS)
          .set('Cookie', [accessTokenCookie]);

        expect(res.status).toBe(202);
      }

      // 4th check to the same monitor within 1 min must be rejected with 429
      const fourthRes = await request(app.getHttpServer())
        .post(`/monitors/${monitorId}/check`)
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie]);

      expect(fourthRes.status).toBe(429);
      expect(fourthRes.body.statusCode).toBe(429);
      expect(
        fourthRes.headers[RATE_LIMIT_HEADERS.RETRY_AFTER.toLowerCase()],
      ).toBeDefined();
    });
  });

  describe('Programmatic API Key Rate Limiting', () => {
    let apiKeyRaw: string;

    beforeAll(async () => {
      const keyRes = await request(app.getHttpServer())
        .post('/api-keys')
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie])
        .send({
          name: 'RateLimit Test Key',
          scopes: ['monitors:read'],
        });

      expect(keyRes.status).toBe(201);
      apiKeyRaw = keyRes.body.rawKey;
    });

    it('enforces API key policy with standard rate limit headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('x-api-key', apiKeyRaw);

      expect(res.status).toBe(200);
      expect(res.headers[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()]).toBe(
        RATE_LIMIT_POLICIES.API_KEY.limit.toString(),
      );
      expect(
        res.headers[RATE_LIMIT_HEADERS.REMAINING.toLowerCase()],
      ).toBeDefined();
    });
  });

  describe('Manual Replay Rate Limiting & Idempotency Bypass', () => {
    it('allows idempotent retry even if manual replay rate limit is exhausted', async () => {
      // 1. Create a webhook endpoint and delivery record
      const epRes = await request(app.getHttpServer())
        .post('/webhooks')
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie])
        .send({
          name: 'Replay Rate Limit Endpoint',
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(epRes.status).toBe(201);
      const ep = epRes.body.endpoint;

      const event = await prisma.webhookEvent.create({
        data: {
          userId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-test-1',
          dedupeKey: `dedupe-${Date.now()}`,
          payload: { test: true },
        },
      });

      const delivery = await prisma.webhookDelivery.create({
        data: {
          eventId: event.id,
          endpointId: ep.id,
          endpointName: ep.name,
          destinationUrl: ep.url,
          status: 'FAILED',
        },
      });

      // 1. Create one successful manual replay using key A
      const keyA = `replay-key-a-${Date.now()}`;
      const firstReplay = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${delivery.id}/replay`)
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie])
        .set('Idempotency-Key', keyA);

      expect(firstReplay.status).toBe(202);
      expect(firstReplay.body.isIdempotent).toBe(false);
      const deliveryACount = await prisma.webhookDelivery.count();

      // 2. Exhaust user replay quota using other unique keys
      for (let i = 0; i < RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_USER.limit; i++) {
        await rateLimiter.checkRateLimit(
          `rl:replay:user:${userId}`,
          RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_USER.limit,
          RATE_LIMIT_POLICIES.WEBHOOK_REPLAY_USER.ttlMs,
        );
      }

      // 3. Retry key A
      const retryReplay = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${delivery.id}/replay`)
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie])
        .set('Idempotency-Key', keyA);

      // 4. Confirm existing replay is returned idempotently
      expect(retryReplay.status).toBe(200);
      expect(retryReplay.body.isIdempotent).toBe(true);
      expect(retryReplay.body.delivery.id).toBe(
        firstReplay.body.replayDelivery.id,
      );

      // 5. Confirm no new delivery or job is created
      const countAfterRetryA = await prisma.webhookDelivery.count();
      expect(countAfterRetryA).toBe(deliveryACount);

      // 6. Submit brand-new key Z
      const keyZ = `replay-key-z-${Date.now()}`;
      const newReplay = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/${delivery.id}/replay`)
        .set(CSRF_HEADERS)
        .set('Cookie', [accessTokenCookie])
        .set('Idempotency-Key', keyZ);

      // 7. Confirm 429 Too Many Requests
      expect(newReplay.status).toBe(429);
      expect(newReplay.body.statusCode).toBe(429);

      // 8. Confirm key Z created no database delivery
      const countAfterKeyZ = await prisma.webhookDelivery.count();
      expect(countAfterKeyZ).toBe(deliveryACount);
    });
  });
});
