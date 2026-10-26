import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Metrics & Analytics API (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: `metrics-test-a-${Date.now()}@devpulse.dev`,
    name: 'Metrics User A',
    password: 'Password123!',
  };

  const userB = {
    email: `metrics-test-b-${Date.now()}@devpulse.dev`,
    name: 'Metrics User B',
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
  let monitorAId: string;
  let emptyMonitorId: string;

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

    // Create monitor for User A (paused to avoid background worker interference)
    const monA = await prisma.monitor.create({
      data: {
        userId: userAId,
        name: 'Telemetry Endpoint A',
        url: 'https://example.com/health',
        isPaused: true,
      },
    });
    monitorAId = monA.id;

    // Create empty monitor for User A (no checks)
    const emptyMon = await prisma.monitor.create({
      data: {
        userId: userAId,
        name: 'Empty Endpoint',
        url: 'https://example.com/empty',
        isPaused: true,
      },
    });
    emptyMonitorId = emptyMon.id;

    // Populate deterministic check results for monitorA:
    // 4 successful checks (100ms, 150ms, 200ms, 250ms)
    // 1 failed check (500ms)
    // 1 seeded check (999ms) which MUST be ignored
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const eightMinutesAgo = new Date(now.getTime() - 8 * 60 * 1000);
    const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);
    const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    await prisma.checkResult.createMany({
      data: [
        {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 100,
          isSuccess: true,
          checkedAt: tenMinutesAgo,
          isSeeded: false,
        },
        {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 150,
          isSuccess: true,
          checkedAt: eightMinutesAgo,
          isSeeded: false,
        },
        {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 200,
          isSuccess: true,
          checkedAt: sixMinutesAgo,
          isSeeded: false,
        },
        {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 250,
          isSuccess: true,
          checkedAt: fourMinutesAgo,
          isSeeded: false,
        },
        {
          monitorId: monitorAId,
          statusCode: 500,
          latencyMs: 500,
          isSuccess: false,
          errorMessage: 'HTTP 500 Internal Server Error',
          checkedAt: twoMinutesAgo,
          isSeeded: false,
        },
        // Seeded check (must be excluded from metrics)
        {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 999,
          isSuccess: true,
          checkedAt: now,
          isSeeded: true,
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'metrics-test-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('Monitor Stats (GET /monitors/:id/stats)', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app.getHttpServer()).get(
        `/monitors/${monitorAId}/stats`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when invalid window is provided', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/stats?window=invalid_window`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(400);
    });

    it('returns 404 when User B queries User A monitor (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/stats`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
    });

    it('returns null metrics and empty series when monitor has no checks', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${emptyMonitorId}/stats?window=24h`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.monitorId).toBe(emptyMonitorId);
      expect(res.body.window).toBe('24h');
      expect(res.body.totalChecks).toBe(0);
      expect(res.body.successfulChecks).toBe(0);
      expect(res.body.failedChecks).toBe(0);
      expect(res.body.uptimePercent).toBeNull();
      expect(res.body.avgLatencyMs).toBeNull();
      expect(res.body.p50LatencyMs).toBeNull();
      expect(res.body.p95LatencyMs).toBeNull();
      expect(res.body.p99LatencyMs).toBeNull();
      expect(res.body.series).toHaveLength(24);
      expect(res.body.series[0].uptimePercent).toBeNull();
    });

    it('calculates correct 24h metrics and excludes seeded data', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/stats?window=24h`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.monitorId).toBe(monitorAId);
      expect(res.body.window).toBe('24h');
      // 5 live checks: 4 successful, 1 failed (seeded check excluded!)
      expect(res.body.totalChecks).toBe(5);
      expect(res.body.successfulChecks).toBe(4);
      expect(res.body.failedChecks).toBe(1);
      // 4 / 5 = 80.0%
      expect(res.body.uptimePercent).toBe(80);

      // Latencies of successful: [100, 150, 200, 250]
      // Mean = 700 / 4 = 175.0
      expect(res.body.avgLatencyMs).toBe(175);
      // p50 nearest-rank = 150
      expect(res.body.p50LatencyMs).toBe(150);
      // p95 nearest-rank = 250
      expect(res.body.p95LatencyMs).toBe(250);
      // p99 nearest-rank = 250
      expect(res.body.p99LatencyMs).toBe(250);

      // Series contains 24 hourly buckets
      expect(res.body.series).toHaveLength(24);
      const totalSeriesChecks = res.body.series.reduce(
        (sum: number, b: { totalChecks: number }) => sum + b.totalChecks,
        0,
      );
      expect(totalSeriesChecks).toBe(5);
    });

    it('supports 7d and 30d window parameters', async () => {
      const res7d = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/stats?window=7d`)
        .set('Cookie', userACookie);

      expect(res7d.status).toBe(200);
      expect(res7d.body.window).toBe('7d');
      expect(res7d.body.series).toHaveLength(7);

      const res30d = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/stats?window=30d`)
        .set('Cookie', userACookie);

      expect(res30d.status).toBe(200);
      expect(res30d.body.window).toBe('30d');
      expect(res30d.body.series).toHaveLength(30);
    });
  });

  describe('Dashboard Summary (GET /monitors/dashboard/summary)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get(
        '/monitors/dashboard/summary',
      );
      expect(res.status).toBe(401);
    });

    it('returns empty dashboard summary for User B with 0 monitors', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors/dashboard/summary')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.totalMonitors).toBe(0);
      expect(res.body.activeMonitors).toBe(0);
      expect(res.body.pausedMonitors).toBe(0);
      expect(res.body.passingEndpoints).toBe(0);
      expect(res.body.failingEndpoints).toBe(0);
      expect(res.body.neverCheckedEndpoints).toBe(0);
      expect(res.body.activeIncidents).toBe(0);
      expect(res.body.systemUptime24h).toBeNull();
    });

    it('returns accurate aggregated summary for User A', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors/dashboard/summary')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.totalMonitors).toBe(2);
      expect(res.body.pausedMonitors).toBe(2);
      expect(res.body.activeMonitors).toBe(0);

      // monitorA latest live check was 500 (failing)
      // emptyMonitor has no checks (neverChecked)
      expect(res.body.failingEndpoints).toBe(1);
      expect(res.body.neverCheckedEndpoints).toBe(1);
      expect(res.body.passingEndpoints).toBe(0);
      expect(res.body.activeIncidents).toBe(0);

      // System uptime 24h across User A monitors: 4 / 5 = 80.0%
      expect(res.body.systemUptime24h).toBe(80);
    });
  });
});
