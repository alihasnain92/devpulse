import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, HttpMethod, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Monitors CRUD & Tenant Isolation (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: `mon-test-a-${Date.now()}@devpulse.dev`,
    name: 'User A',
    password: 'Password123!',
  };

  const userB = {
    email: `mon-test-b-${Date.now()}@devpulse.dev`,
    name: 'User B',
    password: 'Password123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;

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
    userBId = resB.body.user.id;
    const cookiesB = resB.headers['set-cookie'];
    const accessCookieB = cookiesB.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userBCookie = accessCookieB.split(';')[0];
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'mon-test-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('Monitor Creation (POST /monitors)', () => {
    it('should create a monitor with valid data and default values for User A', async () => {
      const payload = {
        name: 'Production Health',
        url: 'https://api.devpulse.dev/health',
      };

      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Production Health');
      expect(res.body.url).toBe('https://api.devpulse.dev/health');
      expect(res.body.method).toBe(HttpMethod.GET);
      expect(res.body.intervalSeconds).toBe(60);
      expect(res.body.timeoutMs).toBe(10000);
      expect(res.body.expectedStatus).toBe(200);
      expect(res.body.isPaused).toBe(false);
      expect(res.body.userId).toBe(userAId);

      // Verify directly in PostgreSQL
      const persisted = await prisma.monitor.findUnique({
        where: { id: res.body.id },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.userId).toBe(userAId);
    });

    it('should create a monitor with custom configuration values', async () => {
      const payload = {
        name: 'Staging Ping',
        url: 'http://staging.devpulse.dev/ping',
        method: HttpMethod.HEAD,
        intervalSeconds: 120,
        timeoutMs: 5000,
        expectedStatus: 204,
      };

      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.method).toBe(HttpMethod.HEAD);
      expect(res.body.intervalSeconds).toBe(120);
      expect(res.body.timeoutMs).toBe(5000);
      expect(res.body.expectedStatus).toBe(204);
    });

    it('should reject creation without authentication (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .send({ name: 'Unauth', url: 'https://example.com' });

      expect(res.status).toBe(401);
    });

    it('should reject creation without CSRF header (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set('Cookie', userACookie)
        .set('Origin', 'http://localhost:3000')
        .send({ name: 'No CSRF', url: 'https://example.com' });

      expect(res.status).toBe(403);
    });

    it('should reject invalid URL schemes (400)', async () => {
      const invalidUrls = [
        'ftp://example.com/file',
        'javascript:alert(1)',
        'file:///etc/passwd',
        'not-a-valid-url',
        'http://',
      ];

      for (const url of invalidUrls) {
        const res = await request(app.getHttpServer())
          .post('/monitors')
          .set(CSRF_HEADERS)
          .set('Cookie', userACookie)
          .send({ name: 'Invalid URL Test', url });

        expect(res.status).toBe(400);
      }
    });

    it('should reject invalid interval limits (400)', async () => {
      // Below min (30s)
      const resLow = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Low Interval', url: 'https://example.com', intervalSeconds: 15 });
      expect(resLow.status).toBe(400);

      // Above max (3600s)
      const resHigh = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'High Interval', url: 'https://example.com', intervalSeconds: 7200 });
      expect(resHigh.status).toBe(400);
    });

    it('should reject invalid timeout limits (400)', async () => {
      // Below min (1000ms)
      const resLow = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Low Timeout', url: 'https://example.com', timeoutMs: 500 });
      expect(resLow.status).toBe(400);

      // Above max (30000ms)
      const resHigh = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'High Timeout', url: 'https://example.com', timeoutMs: 45000 });
      expect(resHigh.status).toBe(400);
    });

    it('should reject unsupported HTTP methods (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Bad Method', url: 'https://example.com', method: 'DELETE' });

      expect(res.status).toBe(400);
    });

    it('should reject untrusted userId in request body (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({
          name: 'Injected User',
          url: 'https://example.com',
          userId: userBId, // Malicious user ID injection
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Monitor Retrieval & Tenant Isolation (GET /monitors & GET /monitors/:id)', () => {
    let monitorAId: string;

    beforeAll(async () => {
      // Create a designated monitor for User A
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Tenant Isolation Monitor A', url: 'https://a.example.com' });
      monitorAId = res.body.id;
    });

    it('User A should list their own monitors', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const ids = res.body.map((m: { id: string }) => m.id);
      expect(ids).toContain(monitorAId);
    });

    it('User B should NOT see User A monitors in their list', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      const ids = res.body.map((m: { id: string }) => m.id);
      expect(ids).not.toContain(monitorAId);
    });

    it('User A should get their monitor details by ID (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(monitorAId);
      expect(res.body.name).toBe('Tenant Isolation Monitor A');
    });

    it('User B should receive 404 when trying to get User A monitor by ID (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should return 404 for non-existent monitor ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors/00000000-0000-0000-0000-000000000000')
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
    });
  });

  describe('Monitor Updates & Pause/Resume (PATCH /monitors/:id)', () => {
    let monitorId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Update Target', url: 'https://update.example.com' });
      monitorId = res.body.id;
    });

    it('User A should update monitor name and interval (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'New Target Name', intervalSeconds: 300 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Target Name');
      expect(res.body.intervalSeconds).toBe(300);

      // Verify in DB
      const inDb = await prisma.monitor.findUnique({ where: { id: monitorId } });
      expect(inDb?.name).toBe('New Target Name');
      expect(inDb?.intervalSeconds).toBe(300);
    });

    it('User A should pause and resume monitor (200)', async () => {
      // Pause
      const pauseRes = await request(app.getHttpServer())
        .patch(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ isPaused: true });

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.isPaused).toBe(true);

      // Resume
      const resumeRes = await request(app.getHttpServer())
        .patch(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ isPaused: false });

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.isPaused).toBe(false);
    });

    it('User B should receive 404 when attempting to update User A monitor (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userBCookie)
        .send({ name: 'Malicious Rename' });

      expect(res.status).toBe(404);

      // Verify DB was NOT modified
      const inDb = await prisma.monitor.findUnique({ where: { id: monitorId } });
      expect(inDb?.name).toBe('Update Target');
    });
  });

  describe('Monitor Deletion & Cascade Persistence (DELETE /monitors/:id)', () => {
    let monitorId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({ name: 'Delete Target', url: 'https://delete.example.com' });
      monitorId = res.body.id;
    });

    it('User B should receive 404 when attempting to delete User A monitor (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);

      // Verify monitor still exists in PostgreSQL
      const inDb = await prisma.monitor.findUnique({ where: { id: monitorId } });
      expect(inDb).not.toBeNull();
    });

    it('User A should delete their monitor (200) and verify removal', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/monitors/${monitorId}`)
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      // Verify deleted from PostgreSQL
      const inDb = await prisma.monitor.findUnique({ where: { id: monitorId } });
      expect(inDb).toBeNull();

      // Subsequent GET should return 404
      const getRes = await request(app.getHttpServer())
        .get(`/monitors/${monitorId}`)
        .set('Cookie', userACookie);
      expect(getRes.status).toBe(404);
    });

    it('Cascade Behavior: Deleting a User should automatically cascade-delete their monitors', async () => {
      // Create a temporary user with a monitor
      const tempUserRes = await request(app.getHttpServer())
        .post('/auth/register')
        .set(CSRF_HEADERS)
        .send({
          email: `cascade-test-${Date.now()}@devpulse.dev`,
          name: 'Cascade User',
          password: 'Password123!',
        });
      const tempUserId = tempUserRes.body.user.id;
      const tempCookie = tempUserRes.headers['set-cookie']
        .find((c: string) => c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`))
        .split(';')[0];

      const monRes = await request(app.getHttpServer())
        .post('/monitors')
        .set(CSRF_HEADERS)
        .set('Cookie', tempCookie)
        .send({ name: 'Cascade Monitor', url: 'https://cascade.example.com' });
      const tempMonId = monRes.body.id;

      // Verify monitor exists in PostgreSQL
      const beforeDelete = await prisma.monitor.findUnique({ where: { id: tempMonId } });
      expect(beforeDelete).not.toBeNull();

      // Delete the User directly from database
      await prisma.user.delete({ where: { id: tempUserId } });

      // Verify the Monitor was cascaded-deleted by PostgreSQL
      const afterDelete = await prisma.monitor.findUnique({ where: { id: tempMonId } });
      expect(afterDelete).toBeNull();
    });
  });
});
