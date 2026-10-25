import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Auth & Session Security (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: `integration-test-${Date.now()}@devpulse.dev`,
    name: 'Integration Tester',
    password: 'StrongIntegrationPassword123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let accessTokenCookie: string;
  let refreshTokenCookie: string;

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
  });

  afterAll(async () => {
    // Clean up only isolated test accounts without modifying or resetting development data
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'integration-test-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  // Helper to extract cookie value
  const getCookie = (res: request.Response, cookieName: string): string | undefined => {
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    if (!setCookie) return undefined;
    const found = setCookie.find((c: string) => c.startsWith(`${cookieName}=`));
    return found ? found.split(';')[0] : undefined;
  };

  describe('CSRF and Header Protection', () => {
    it('POST /auth/register: should reject state-changing requests missing CSRF header with 403', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);

      expect(response.status).toBe(403);
    });
  });

  describe('User Registration', () => {
    it('POST /auth/register: should reject invalid input with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(CSRF_HEADERS)
        .send({
          email: 'not-an-email',
          name: '',
          password: 'short',
        });

      expect(response.status).toBe(400);
    });

    it('POST /auth/register: should successfully register a new user and set HTTP-only cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(CSRF_HEADERS)
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(testUser.email.toLowerCase());
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user.hashedPassword).toBeUndefined();

      accessTokenCookie = getCookie(response, AUTH_COOKIES.ACCESS_TOKEN)!;
      refreshTokenCookie = getCookie(response, AUTH_COOKIES.REFRESH_TOKEN)!;

      expect(accessTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toBeDefined();
      const rawCookies = (response.headers['set-cookie'] || []) as unknown as string[];
      expect(rawCookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('POST /auth/register: should reject duplicate email with 409 Conflict', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(CSRF_HEADERS)
        .send(testUser);

      expect(response.status).toBe(409);
    });
  });

  describe('User Login', () => {
    it('POST /auth/login: should reject invalid password with generic 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(CSRF_HEADERS)
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        });

      expect(response.status).toBe(401);
    });

    it('POST /auth/login: should successfully authenticate and issue new session cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(CSRF_HEADERS)
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(testUser.email.toLowerCase());

      accessTokenCookie = getCookie(response, AUTH_COOKIES.ACCESS_TOKEN)!;
      refreshTokenCookie = getCookie(response, AUTH_COOKIES.REFRESH_TOKEN)!;

      expect(accessTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toBeDefined();
    });
  });

  describe('Protected Profile Endpoint (GET /users/me)', () => {
    it('GET /users/me: should reject unauthenticated requests with 401', async () => {
      const response = await request(app.getHttpServer()).get('/users/me');
      expect(response.status).toBe(401);
    });

    it('GET /users/me: should return authenticated safe profile when access token cookie is present', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', accessTokenCookie);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(testUser.email.toLowerCase());
      expect(response.body.name).toBe(testUser.name);
      expect(response.body.id).toBeDefined();
      expect(response.body.hashedPassword).toBeUndefined();
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    let secondRotatedRefreshCookie: string;

    it('POST /auth/refresh: should rotate refresh token and issue new access & refresh cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(CSRF_HEADERS)
        .set('Cookie', refreshTokenCookie);

      expect(response.status).toBe(200);
      secondRotatedRefreshCookie = getCookie(response, AUTH_COOKIES.REFRESH_TOKEN)!;
      expect(secondRotatedRefreshCookie).toBeDefined();
      expect(secondRotatedRefreshCookie).not.toBe(refreshTokenCookie);
    });

    it('POST /auth/refresh: should detect reuse when previously rotated token is presented again', async () => {
      // Attempting to use the already-rotated `refreshTokenCookie`
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(CSRF_HEADERS)
        .set('Cookie', refreshTokenCookie);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('revoked due to reuse detection');
    });

    it('POST /auth/refresh: subsequent tokens in compromised family should now also be revoked', async () => {
      // Because reuse was detected above, the second token in the same family should now be revoked
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(CSRF_HEADERS)
        .set('Cookie', secondRotatedRefreshCookie);

      expect(response.status).toBe(401);
    });
  });

  describe('Logout & Session Revocation', () => {
    it('POST /auth/logout: should revoke session and clear authentication cookies', async () => {
      // First login again to get fresh session
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set(CSRF_HEADERS)
        .send({ email: testUser.email, password: testUser.password });

      const activeRefreshCookie = getCookie(loginRes, AUTH_COOKIES.REFRESH_TOKEN)!;

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set(CSRF_HEADERS)
        .set('Cookie', activeRefreshCookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('Logged out successfully');

      // Attempting to refresh with the logged-out session must now fail
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(CSRF_HEADERS)
        .set('Cookie', activeRefreshCookie);

      expect(refreshRes.status).toBe(401);
    });
  });
});
