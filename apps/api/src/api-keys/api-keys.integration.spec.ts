import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('API Keys & Scoped Authentication (Integration - Live PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: `apikey-test-a-${Date.now()}@devpulse.dev`,
    name: 'API Key User A',
    password: 'Password123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userAId: string;
  let fullScopeRawKey: string;
  let fullScopeKeyId: string;
  let readOnlyRawKey: string;

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

    // Create a monitor for User A to query
    await prisma.monitor.create({
      data: {
        userId: userAId,
        name: 'Monitored Service',
        url: 'https://example.com/health',
        isPaused: true,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'apikey-test-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('API Key Creation & Management', () => {
    it('creates a full-scoped API key returning the raw key once', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'CI Full Access Key',
          scopes: [
            'monitors:read',
            'monitors:write',
            'incidents:read',
            'webhooks:read',
            'webhooks:write',
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.apiKey).toBeDefined();
      expect(res.body.apiKey.name).toBe('CI Full Access Key');
      expect(res.body.rawKey).toMatch(/^dp_live_[0-9a-f]{48}$/);

      fullScopeRawKey = res.body.rawKey;
      fullScopeKeyId = res.body.apiKey.id;
    });

    it('creates a read-only scoped API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS)
        .send({
          name: 'Metrics Reader Only',
          scopes: ['monitors:read'],
        });

      expect(res.status).toBe(201);
      readOnlyRawKey = res.body.rawKey;
    });

    it('lists user API keys without revealing raw keys or hashes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-keys')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].rawKey).toBeUndefined();
      expect(res.body[0].hashedKey).toBeUndefined();
      expect(res.body[0].keyPrefix).toContain('dp_live_');
    });
  });

  describe('API Key Authentication & Scope Enforcement', () => {
    it('authenticates GET /monitors via x-api-key header without session cookies or CSRF header', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('x-api-key', fullScopeRawKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('Monitored Service');
    });

    it('authenticates GET /monitors via Authorization: Bearer dp_live_...', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('Authorization', `Bearer ${fullScopeRawKey}`);

      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('Monitored Service');
    });

    it('allows read-only key to execute GET /monitors', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('x-api-key', readOnlyRawKey);

      expect(res.status).toBe(200);
    });

    it('blocks read-only key from executing POST /monitors with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set('x-api-key', readOnlyRawKey)
        .send({
          name: 'Unauthorized Monitor',
          url: 'https://example.com/unauth',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("lacks required scope 'monitors:write'");
    });

    it('allows full-scope key to execute POST /monitors without CSRF header', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitors')
        .set('x-api-key', fullScopeRawKey)
        .send({
          name: 'Programmatic Monitor',
          url: 'https://example.com/programmatic',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Programmatic Monitor');
    });

    it('rejects an invalid API key with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('x-api-key', 'dp_live_invalid_key_value_00000000000000000000000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('API Key Revocation', () => {
    it('revokes an API key', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api-keys/${fullScopeKeyId}/revoke`)
        .set('Cookie', userACookie)
        .set(CSRF_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.isRevoked).toBe(true);
      expect(res.body.revokedAt).toBeDefined();
    });

    it('immediately rejects requests authenticated with the revoked key', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitors')
        .set('x-api-key', fullScopeRawKey);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or revoked API key');
    });
  });
});
