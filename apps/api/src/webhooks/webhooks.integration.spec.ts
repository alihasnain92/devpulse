import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Webhooks Management API (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: `wh-test-a-${Date.now()}@devpulse.dev`,
    name: 'Webhook User A',
    password: 'Password123!',
  };

  const userB = {
    email: `wh-test-b-${Date.now()}@devpulse.dev`,
    name: 'Webhook User B',
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
  let webhookAId: string;

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
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'wh-test-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('POST /webhooks', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set(CSRF_HEADERS)
        .send({
          name: 'Slack Alerts',
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(res.status).toBe(401);
    });

    it('rejects missing name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/name/i);
    });

    it('rejects empty name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: '',
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/name/i);
    });

    it('rejects whitespace-only name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: '     ',
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/name/i);
    });

    it('rejects name exceeding 100 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'A'.repeat(101),
          url: 'https://example.com/webhook',
          events: ['incident.created'],
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/100 characters/i);
    });

    it('rejects description exceeding 255 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Valid Name',
          url: 'https://example.com/webhook',
          description: 'D'.repeat(256),
          events: ['incident.created'],
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/255 characters/i);
    });

    it('rejects invalid or prohibited SSRF destination URLs', async () => {
      // Private IP literal
      const resLoopback = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Internal Attack',
          url: 'http://127.0.0.1:9000/hook',
          events: ['incident.created'],
        });

      expect(resLoopback.status).toBe(400);

      // Cloud metadata
      const resMetadata = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'AWS Metadata',
          url: 'http://169.254.169.254/latest',
          events: ['incident.created'],
        });

      expect(resMetadata.status).toBe(400);
    });

    it('rejects unknown event types', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Invalid Events',
          url: 'https://example.com/webhook',
          events: ['unsupported.event.type'],
        });

      expect(res.status).toBe(400);
    });

    it('creates webhook endpoint, trims name, saves description, and returns raw signing secret strictly once', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: '  PagerDuty Webhook  ',
          url: 'https://events.pagerduty.com/integration/devpulse',
          description: '  Primary on-call pager integration  ',
          events: ['incident.created', 'incident.resolved'],
        });

      expect(res.status).toBe(201);
      expect(res.body.endpoint).toBeDefined();
      expect(res.body.endpoint.userId).toBe(userAId);
      expect(res.body.endpoint.name).toBe('PagerDuty Webhook');
      expect(res.body.endpoint.description).toBe('Primary on-call pager integration');
      expect(res.body.endpoint.isEnabled).toBe(true);
      expect(res.body.signingSecret).toMatch(/^whsec_[0-9a-f]{64}$/);

      webhookAId = res.body.endpoint.id;

      // Verify DB stored trimmed name, description, and encrypted secret, NOT the raw secret
      const stored = await prisma.webhookEndpoint.findUnique({
        where: { id: webhookAId },
      });
      expect(stored?.name).toBe('PagerDuty Webhook');
      expect(stored?.description).toBe('Primary on-call pager integration');
      expect(stored?.encryptedSecret).not.toBe(res.body.signingSecret);
      expect(stored?.encryptedSecret).toContain(':');
    });

    it('allows a single user to reuse the same webhook name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'PagerDuty Webhook',
          url: 'https://events.pagerduty.com/integration/secondary',
          events: ['incident.created'],
        });

      expect(res.status).toBe(201);
      expect(res.body.endpoint.name).toBe('PagerDuty Webhook');

      // Clean up the duplicate endpoint
      await prisma.webhookEndpoint.delete({ where: { id: res.body.endpoint.id } });
    });

    it('allows multiple users to use the same webhook name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Cookie', userBCookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'PagerDuty Webhook',
          url: 'https://events.pagerduty.com/integration/userb',
          events: ['incident.created'],
        });

      expect(res.status).toBe(201);
      expect(res.body.endpoint.name).toBe('PagerDuty Webhook');

      // Clean up User B's endpoint
      await prisma.webhookEndpoint.delete({ where: { id: res.body.endpoint.id } });
    });
  });

  describe('GET /webhooks & GET /webhooks/:id (Tenant Isolation)', () => {
    it('lists User A endpoints with name and description, and never leaks signing secret', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(webhookAId);
      expect(res.body[0].name).toBe('PagerDuty Webhook');
      expect(res.body[0].description).toBe('Primary on-call pager integration');
      expect(res.body[0].signingSecret).toBeUndefined();
      expect(res.body[0].encryptedSecret).toBeUndefined();
    });

    it('retrieves single webhook endpoint by ID with name and description', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(webhookAId);
      expect(res.body.name).toBe('PagerDuty Webhook');
      expect(res.body.description).toBe('Primary on-call pager integration');
      expect(res.body.signingSecret).toBeUndefined();
      expect(res.body.encryptedSecret).toBeUndefined();
    });

    it('returns empty list for User B (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 404 when User B attempts to read User A endpoint by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/${webhookAId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /webhooks/:id & DELETE /webhooks/:id', () => {
    it('rejects update with empty name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('rejects update with whitespace-only name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ name: '     ' });

      expect(res.status).toBe(400);
    });

    it('rejects update with name exceeding 100 characters', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ name: 'Z'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('rejects update with description exceeding 255 characters', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({ description: 'Z'.repeat(256) });

      expect(res.status).toBe(400);
    });

    it('returns 404 when User B attempts to update User A endpoint', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userBCookie)
        .set(CSRF_HEADERS)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(404);
    });

    it('updates endpoint properties, trimming name and description for User A', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          isEnabled: false,
          name: '  Paused Hook  ',
          description: '  Updated context  ',
        });

      expect(res.status).toBe(200);
      expect(res.body.isEnabled).toBe(false);
      expect(res.body.name).toBe('Paused Hook');
      expect(res.body.description).toBe('Updated context');

      const check = await prisma.webhookEndpoint.findUnique({
        where: { id: webhookAId },
      });
      expect(check?.name).toBe('Paused Hook');
      expect(check?.description).toBe('Updated context');
    });

    it('returns 404 when User B attempts to delete User A endpoint', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/webhooks/${webhookAId}`)
        .set('Cookie', userBCookie)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(404);
    });

    it('deletes endpoint for User A', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/webhooks/${webhookAId}`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.webhookEndpoint.findUnique({
        where: { id: webhookAId },
      });
      expect(check).toBeNull();
    });
  });
});
