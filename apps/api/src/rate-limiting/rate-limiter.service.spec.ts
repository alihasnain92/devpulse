import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';

interface MockRedisClient {
  eval: jest.Mock;
  del: jest.Mock;
  ping: jest.Mock;
  disconnect: jest.Mock;
  zcard?: (key: string) => Promise<number>;
}

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimiterService],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  describe('Sliding-window evaluation', () => {
    it('allows requests within limit and decrements remaining', async () => {
      const key = `test:allow:${Date.now()}`;
      const limit = 5;
      const ttlMs = 60000;

      const first = await service.checkRateLimit(key, limit, ttlMs);
      expect(first.allowed).toBe(true);
      expect(first.limit).toBe(limit);
      expect(first.remaining).toBe(4);
      expect(first.reset).toBeGreaterThan(Math.floor(Date.now() / 1000));

      const second = await service.checkRateLimit(key, limit, ttlMs);
      expect(second.allowed).toBe(true);
      expect(second.remaining).toBe(3);
    });

    it('blocks requests once limit is reached and returns retryAfter', async () => {
      const key = `test:block:${Date.now()}`;
      const limit = 2;
      const ttlMs = 10000;

      await service.checkRateLimit(key, limit, ttlMs);
      await service.checkRateLimit(key, limit, ttlMs);

      const third = await service.checkRateLimit(key, limit, ttlMs);
      expect(third.allowed).toBe(false);
      expect(third.remaining).toBe(0);
      expect(third.retryAfter).toBeGreaterThanOrEqual(1);
    });

    it('resets limit key on explicit resetLimit() call', async () => {
      const key = `test:reset:${Date.now()}`;
      const limit = 1;
      const ttlMs = 60000;

      const first = await service.checkRateLimit(key, limit, ttlMs);
      expect(first.allowed).toBe(true);

      const blocked = await service.checkRateLimit(key, limit, ttlMs);
      expect(blocked.allowed).toBe(false);

      await service.resetLimit(key);

      const afterReset = await service.checkRateLimit(key, limit, ttlMs);
      expect(afterReset.allowed).toBe(true);
    });
  });

  describe('Same-millisecond concurrency & Member Uniqueness', () => {
    it('strictly enforces limit when multiple concurrent requests occur on the exact same millisecond', async () => {
      const key = `test:concurrency:${Date.now()}`;
      const limit = 5;
      const ttlMs = 10000;
      const totalCalls = 20;

      // Freeze Date.now to exact same millisecond for all concurrent calls
      const frozenNow = 1770000000000;
      jest.spyOn(Date, 'now').mockReturnValue(frozenNow);

      const promises = Array.from({ length: totalCalls }).map(() =>
        service.checkRateLimit(key, limit, ttlMs),
      );

      const results = await Promise.all(promises);

      const allowedCount = results.filter((r) => r.allowed).length;
      const rejectedCount = results.filter((r) => !r.allowed).length;

      // Exactly 5 allowed, 15 rejected
      expect(allowedCount).toBe(5);
      expect(rejectedCount).toBe(15);

      // Verify Redis cardinality reflects exactly the 5 accepted requests
      const internalRedis = (service as unknown as { redis: { zcard: (k: string) => Promise<number> } | null }).redis;
      if (internalRedis) {
        const card = await internalRedis.zcard(key);
        expect(card).toBe(5);
      }

      // Verify normal window expiration: advance time beyond ttlMs
      Date.now = jest.fn().mockReturnValue(frozenNow + ttlMs + 1000);
      const afterWindow = await service.checkRateLimit(key, limit, ttlMs);
      expect(afterWindow.allowed).toBe(true);
      expect(afterWindow.remaining).toBe(4);
    });
  });

  describe('Atomic Multi-Key Sliding Window (Zero Partial Consumption)', () => {
    it('aborts without consuming any quota on Key 1 when Key 2 limit is exceeded', async () => {
      const userKey = `test:multi:user:${Date.now()}`;
      const targetKey = `test:multi:target:${Date.now()}`;

      // User limit = 10, Target limit = 2
      const items = [
        { key: userKey, limit: 10, windowMs: 60000 },
        { key: targetKey, limit: 2, windowMs: 60000 },
      ];

      // 1st request -> allowed
      const res1 = await service.checkMultiRateLimit(items);
      expect(res1.allowed).toBe(true);

      // 2nd request -> allowed
      const res2 = await service.checkMultiRateLimit(items);
      expect(res2.allowed).toBe(true);

      // 3rd request -> target reaches limit 2, rejected
      const res3 = await service.checkMultiRateLimit(items);
      expect(res3.allowed).toBe(false);

      // Verify userKey was NOT partially consumed on the 3rd request!
      // A direct check on userKey should show only 2 consumed slots (remaining = 8)
      const userAlone = await service.checkRateLimit(userKey, 10, 60000);
      expect(userAlone.allowed).toBe(true);
      // It consumed the 3rd slot now, so remaining is 7
      expect(userAlone.remaining).toBe(7);
    });
  });

  describe('Redis connectivity and ping', () => {
    it('returns ping status', async () => {
      const isAlive = await service.ping();
      expect(typeof isAlive).toBe('boolean');
    });
  });

  describe('Degraded fallback mechanism', () => {
    it('falls back to in-memory sliding window when Redis throws and fallbackFailClosed is false', async () => {
      const faultyService = new RateLimiterService();
      const mockRedis: MockRedisClient = {
        eval: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        del: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        ping: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        disconnect: jest.fn(),
      };
      (faultyService as unknown as { redis: MockRedisClient }).redis = mockRedis;

      const key = `test:fallback:open:${Date.now()}`;
      const limit = 3;
      const ttlMs = 60000;

      const res1 = await faultyService.checkRateLimit(key, limit, ttlMs);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await faultyService.checkRateLimit(key, limit, ttlMs);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await faultyService.checkRateLimit(key, limit, ttlMs);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);

      const res4 = await faultyService.checkRateLimit(key, limit, ttlMs);
      expect(res4.allowed).toBe(false);
      expect(res4.remaining).toBe(0);

      await faultyService.onModuleDestroy();
    });

    it('fails closed and flags serviceUnavailable when Redis throws and fallbackFailClosed is true', async () => {
      const faultyService = new RateLimiterService();
      const mockRedis: MockRedisClient = {
        eval: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        del: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        ping: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        disconnect: jest.fn(),
      };
      (faultyService as unknown as { redis: MockRedisClient }).redis = mockRedis;

      const key = `test:fallback:closed:${Date.now()}`;
      const res = await faultyService.checkRateLimit(key, 5, 60000, {
        fallbackFailClosed: true,
      });

      expect(res.allowed).toBe(false);
      expect(res.serviceUnavailable).toBe(true);
      expect(res.remaining).toBe(0);
      expect(res.retryAfter).toBe(60);

      await faultyService.onModuleDestroy();
    });

    it('cleans up in-memory entries when resetLimit is called', async () => {
      const faultyService = new RateLimiterService();
      const mockRedis: MockRedisClient = {
        eval: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        del: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        ping: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        disconnect: jest.fn(),
      };
      (faultyService as unknown as { redis: MockRedisClient }).redis = mockRedis;

      const key = `test:fallback:reset:${Date.now()}`;
      await faultyService.checkRateLimit(key, 1, 60000);
      const blocked = await faultyService.checkRateLimit(key, 1, 60000);
      expect(blocked.allowed).toBe(false);

      await faultyService.resetLimit(key);
      const allowed = await faultyService.checkRateLimit(key, 1, 60000);
      expect(allowed.allowed).toBe(true);

      await faultyService.onModuleDestroy();
    });
  });
});
