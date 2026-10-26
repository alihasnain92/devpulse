import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringService } from './monitoring.service';

describe('Monitoring & Check Execution (Integration - Isolated devpulse_test)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let monitoringService: MonitoringService;

  const userA = {
    email: `mon-check-user-a-${Date.now()}@devpulse.dev`,
    name: 'Check User A',
    password: 'Password123!Secure',
  };

  const userB = {
    email: `mon-check-user-b-${Date.now()}@devpulse.dev`,
    name: 'Check User B',
    password: 'Password123!Secure',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;
  let monitorAId: string;

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
    monitoringService = app.get<MonitoringService>(MonitoringService);

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
    userBId = resB.body.user.id;
    const cookiesB = resB.headers['set-cookie'];
    const accessCookieB = cookiesB.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userBCookie = accessCookieB.split(';')[0];

    // Create a Monitor for User A
    const monRes = await request(app.getHttpServer())
      .post('/monitors')
      .set('Cookie', [userACookie])
      .set(CSRF_HEADERS)
      .send({
        name: 'Target Service A',
        url: 'https://example.com',
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatus: 200,
      });
    expect(monRes.status).toBe(201);
    monitorAId = monRes.body.id;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          id: { in: [userAId, userBId].filter(Boolean) },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('Manual Check Trigger (POST /monitors/:id/check)', () => {
    it('should reject check trigger without authentication (401)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitors/${monitorAId}/check`)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(401);
    });

    it('should reject check trigger without CSRF header (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitors/${monitorAId}/check`)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(403);
    });

    it('User B should receive 404 when trying to trigger check on User A monitor (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitors/${monitorAId}/check`)
        .set('Cookie', [userBCookie])
        .set(CSRF_HEADERS);

      expect(res.status).toBe(404);
    });

    it('User A should trigger manual check and receive 202 Accepted with checkJobId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitors/${monitorAId}/check`)
        .set('Cookie', [userACookie])
        .set(CSRF_HEADERS);

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('checkJobId');
      expect(res.body).toHaveProperty(
        'statusUrl',
        `/monitors/${monitorAId}/checks/latest`,
      );
    });
  });

  describe('Check Discovery Endpoints (GET /monitors/:id/checks & /latest)', () => {
    it('User B should receive 404 when requesting User A latest check', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/checks/latest`)
        .set('Cookie', [userBCookie]);

      expect(res.status).toBe(404);
    });

    it('User B should receive 404 when requesting User A checks list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/checks`)
        .set('Cookie', [userBCookie]);

      expect(res.status).toBe(404);
    });

    it('User A should get 200 with empty/null body if no checks have completed yet', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/checks/latest`)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('User A should get check list after a check result is recorded', async () => {
      // Directly persist a check result to test retrieval
      await prisma.checkResult.create({
        data: {
          monitorId: monitorAId,
          statusCode: 200,
          latencyMs: 85,
          isSuccess: true,
          errorMessage: null,
          jobId: `test-integration-job-${Date.now()}`,
        },
      });

      const listRes = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/checks?limit=5`)
        .set('Cookie', [userACookie]);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body[0].monitorId).toBe(monitorAId);
      expect(listRes.body[0].statusCode).toBe(200);
      expect(listRes.body[0].isSuccess).toBe(true);

      const latestRes = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/checks/latest`)
        .set('Cookie', [userACookie]);

      expect(latestRes.status).toBe(200);
      expect(latestRes.body).not.toBeNull();
      expect(latestRes.body.monitorId).toBe(monitorAId);
      expect(latestRes.body.statusCode).toBe(200);
    });
  });

  describe('SSRF Safety & Pre-check Enforcement in Check Execution', () => {
    let loopbackMonitorId: string;
    let privateMonitorId: string;

    beforeAll(async () => {
      // Create monitors targeting loopback and private IPs
      const lbRes = await request(app.getHttpServer())
        .post('/monitors')
        .set('Cookie', [userACookie])
        .set(CSRF_HEADERS)
        .send({
          name: 'Loopback Target',
          url: 'http://127.0.0.1:8080/admin',
        });
      loopbackMonitorId = lbRes.body.id;

      const privRes = await request(app.getHttpServer())
        .post('/monitors')
        .set('Cookie', [userACookie])
        .set(CSRF_HEADERS)
        .send({
          name: 'Private RFC 1918 Target',
          url: 'http://192.168.1.100/status',
        });
      privateMonitorId = privRes.body.id;
    });

    it('should block loopback check execution and persist sanitized SSRF_BLOCKED error', async () => {
      const result = await monitoringService.runMonitorCheck(
        loopbackMonitorId,
        `ssrf-job-${Date.now()}`,
      );

      expect(result).not.toBeNull();
      expect(result?.isSuccess).toBe(false);
      expect(result?.statusCode).toBeNull();
      expect(result?.errorMessage).toContain('SSRF_BLOCKED');
      expect(result?.errorMessage).toMatch(/loopback/i);
    });

    it('should block RFC 1918 private IP check execution and persist sanitized SSRF_BLOCKED error', async () => {
      const result = await monitoringService.runMonitorCheck(
        privateMonitorId,
        `ssrf-priv-job-${Date.now()}`,
      );

      expect(result).not.toBeNull();
      expect(result?.isSuccess).toBe(false);
      expect(result?.statusCode).toBeNull();
      expect(result?.errorMessage).toContain('SSRF_BLOCKED');
      expect(result?.errorMessage).toMatch(/private/i);
    });

    it('should abort cleanly without check result if monitor is paused', async () => {
      // Pause loopback monitor
      await request(app.getHttpServer())
        .patch(`/monitors/${loopbackMonitorId}`)
        .set('Cookie', [userACookie])
        .set(CSRF_HEADERS)
        .send({ isPaused: true });

      const checkCountBefore = await prisma.checkResult.count({
        where: { monitorId: loopbackMonitorId },
      });

      const result = await monitoringService.runMonitorCheck(
        loopbackMonitorId,
        `paused-job-${Date.now()}`,
      );

      expect(result).toBeNull();

      const checkCountAfter = await prisma.checkResult.count({
        where: { monitorId: loopbackMonitorId },
      });
      expect(checkCountAfter).toBe(checkCountBefore);
    });
  });
});
