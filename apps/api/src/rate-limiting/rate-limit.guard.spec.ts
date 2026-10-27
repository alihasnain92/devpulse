import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiterService } from './rate-limiter.service';
import { RATE_LIMIT_HEADERS, RATE_LIMIT_POLICIES } from '@devpulse/shared';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let rateLimiterService: {
    checkRateLimit: jest.Mock;
    checkMultiRateLimit: jest.Mock;
    ping: jest.Mock;
  };

  const createMockContext = (options: {
    method?: string;
    path?: string;
    ip?: string;
    forwardedFor?: string;
    user?: { id: string; email?: string };
    apiKey?: { id: string; keyPrefix?: string };
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  }): {
    context: ExecutionContext;
    headers: Record<string, string>;
  } => {
    const headers: Record<string, string> = {};
    const req = {
      method: options.method || 'GET',
      path: options.path || '/monitors',
      url: options.path || '/monitors',
      ip: options.ip || '127.0.0.1',
      socket: { remoteAddress: options.ip || '127.0.0.1' },
      headers: {
        ...(options.forwardedFor ? { 'x-forwarded-for': options.forwardedFor } : {}),
      },
      user: options.user,
      apiKey: options.apiKey,
      body: options.body || {},
      params: options.params || {},
    };

    const res = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      getHeader: jest.fn((k: string) => headers[k]),
    };

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, headers };
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    rateLimiterService = {
      checkRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        limit: 120,
        current: 1,
        remaining: 119,
        resetMs: 60000,
        reset: Math.floor(Date.now() / 1000) + 60,
        retryAfter: 60,
      }),
      checkMultiRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        limit: 10,
        current: 1,
        remaining: 9,
        resetMs: 60000,
        reset: Math.floor(Date.now() / 1000) + 60,
        retryAfter: 60,
      }),
      ping: jest.fn().mockResolvedValue(true),
    };

    guard = new RateLimitGuard(
      reflector,
      rateLimiterService as unknown as RateLimiterService,
    );
  });

  it('skips rate limiting when @SkipRateLimit() decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // SKIP_RATE_LIMIT
    const { context } = createMockContext({});

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(rateLimiterService.checkRateLimit).not.toHaveBeenCalled();
    expect(rateLimiterService.checkMultiRateLimit).not.toHaveBeenCalled();
  });

  describe('Unauthenticated Auth endpoints', () => {
    it('applies atomic dual-layer IP + SHA-256 email hashing for login attempts', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const { context, headers } = createMockContext({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'Alice@Example.COM', password: 'secretpassword' },
        ip: '192.168.1.100',
      });

      const canActivate = await guard.canActivate(context);
      expect(canActivate).toBe(true);

      // Verify atomic multi-rate check was called with hashed email and not plaintext
      expect(rateLimiterService.checkMultiRateLimit).toHaveBeenCalledTimes(1);
      const items = rateLimiterService.checkMultiRateLimit.mock.calls[0][0];
      expect(items).toHaveLength(2);
      expect(items[0].key).not.toContain('Alice@Example.COM');
      expect(items[0].key).not.toContain('secretpassword');
      expect(items[0].key).toContain('rl:auth:login:192.168.1.100:');

      // Verify rate limit response headers set
      expect(headers[RATE_LIMIT_HEADERS.LIMIT]).toBeDefined();
      expect(headers[RATE_LIMIT_HEADERS.REMAINING]).toBeDefined();
    });

    it('throws 429 HttpException with standard payload when auth rate limit exceeded', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      rateLimiterService.checkMultiRateLimit.mockResolvedValueOnce({
        allowed: false,
        limit: 5,
        current: 6,
        remaining: 0,
        resetMs: 45000,
        reset: Math.floor(Date.now() / 1000) + 45,
        retryAfter: 45,
      });

      const { context } = createMockContext({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'alice@example.com' },
      });

      try {
        await guard.canActivate(context);
        fail('Expected 429 HttpException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const res = httpErr.getResponse() as Record<string, unknown>;
        expect(res.statusCode).toBe(429);
        expect(res.message).toBe('Too many requests. Please try again later.');
        expect(res.retryAfter).toBe(45);
      }
    });

    it('throws 503 Service Unavailable when fail-closed on Redis failure', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      rateLimiterService.checkMultiRateLimit.mockResolvedValueOnce({
        allowed: false,
        limit: 5,
        current: 5,
        remaining: 0,
        resetMs: 60000,
        reset: Math.floor(Date.now() / 1000) + 60,
        retryAfter: 60,
        serviceUnavailable: true,
      });

      const { context } = createMockContext({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'alice@example.com' },
      });

      try {
        await guard.canActivate(context);
        fail('Expected 503 HttpException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const res = httpErr.getResponse() as Record<string, unknown>;
        expect(res.statusCode).toBe(503);
        expect(res.message).toContain('temporarily unavailable');
      }
    });
  });

  describe('Authenticated user requests', () => {
    it('applies USER_READ policy for GET requests', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const user = { id: 'user-uuid-1', email: 'alice@example.com' };
      const { context } = createMockContext({
        method: 'GET',
        path: '/monitors',
        user,
      });

      await guard.canActivate(context);

      expect(rateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        `${RATE_LIMIT_POLICIES.USER_READ.keyPrefix}:user-uuid-1`,
        RATE_LIMIT_POLICIES.USER_READ.limit,
        RATE_LIMIT_POLICIES.USER_READ.ttlMs,
      );
    });

    it('applies USER_WRITE policy for mutating requests', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const user = { id: 'user-uuid-1', email: 'alice@example.com' };
      const { context } = createMockContext({
        method: 'POST',
        path: '/monitors',
        user,
      });

      await guard.canActivate(context);

      expect(rateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        `${RATE_LIMIT_POLICIES.USER_WRITE.keyPrefix}:user-uuid-1`,
        RATE_LIMIT_POLICIES.USER_WRITE.limit,
        RATE_LIMIT_POLICIES.USER_WRITE.ttlMs,
      );
    });

    it('applies atomic dual-key throttling for manual monitor checks (user quota + target monitor quota)', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const user = { id: 'user-uuid-1', email: 'alice@example.com' };
      const { context } = createMockContext({
        method: 'POST',
        path: '/monitors/mon-uuid-42/check',
        params: { id: 'mon-uuid-42' },
        user,
      });

      await guard.canActivate(context);

      expect(rateLimiterService.checkMultiRateLimit).toHaveBeenCalledTimes(1);
      const items = rateLimiterService.checkMultiRateLimit.mock.calls[0][0];
      expect(items).toEqual([
        {
          key: `${RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.keyPrefix}:user-uuid-1`,
          limit: RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.limit,
          windowMs: RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.ttlMs,
        },
        {
          key: `${RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.keyPrefix}:mon-uuid-42`,
          limit: RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.limit,
          windowMs: RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.ttlMs,
        },
      ]);
    });
  });

  describe('Programmatic API Key requests', () => {
    it('applies API_KEY policy using apiKey.id without leaking raw token', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const apiKey = { id: 'key-record-id-999', keyPrefix: 'dp_live_1234' };
      const { context } = createMockContext({
        method: 'GET',
        path: '/monitors',
        apiKey,
      });

      await guard.canActivate(context);

      expect(rateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        `${RATE_LIMIT_POLICIES.API_KEY.keyPrefix}:key-record-id-999`,
        RATE_LIMIT_POLICIES.API_KEY.limit,
        RATE_LIMIT_POLICIES.API_KEY.ttlMs,
      );
    });
  });

  describe('Client IP extraction and trusted proxy handling', () => {
    const originalTrustProxy = process.env.TRUST_PROXY;

    afterEach(() => {
      process.env.TRUST_PROXY = originalTrustProxy;
    });

    it('uses socket address when TRUST_PROXY is not enabled, ignoring spoofed headers', async () => {
      delete process.env.TRUST_PROXY;
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const { context } = createMockContext({
        method: 'POST',
        path: '/auth/login',
        ip: '10.0.0.1',
        forwardedFor: '203.0.113.195, 70.41.3.18',
        body: { email: 'bob@example.com' },
      });

      await guard.canActivate(context);

      const items = rateLimiterService.checkMultiRateLimit.mock.calls[0][0];
      expect(items[0].key).toContain('10.0.0.1');
      expect(items[0].key).not.toContain('203.0.113.195');
    });

    it('extracts client IP from x-forwarded-for when TRUST_PROXY is enabled', async () => {
      process.env.TRUST_PROXY = 'true';
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const { context } = createMockContext({
        method: 'POST',
        path: '/auth/login',
        ip: '10.0.0.1',
        forwardedFor: '203.0.113.195, 70.41.3.18',
        body: { email: 'bob@example.com' },
      });

      await guard.canActivate(context);

      const items = rateLimiterService.checkMultiRateLimit.mock.calls[0][0];
      expect(items[0].key).toContain('203.0.113.195');
    });
  });
});
