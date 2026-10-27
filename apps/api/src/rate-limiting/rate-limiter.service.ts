import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../monitoring/queue/queue.constants';
import {
  MULTI_KEY_SLIDING_WINDOW_LUA_SCRIPT,
  SLIDING_WINDOW_LUA_SCRIPT,
} from './rate-limiter.constants';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetMs: number;
  reset: number;
  retryAfter: number;
  fallbackUsed?: boolean;
  serviceUnavailable?: boolean;
}

export interface MultiRateLimitItem {
  key: string;
  limit: number;
  windowMs: number;
}

export interface CheckRateLimitOptions {
  fallbackFailClosed?: boolean;
}

interface MemoryBucket {
  timestamps: number[];
}

@Injectable()
export class RateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private redis: Redis | null = null;
  private isRedisHealthy = false;
  private lastWarningTimestamp = 0;

  // In-memory sliding window fallback (bounded to 5,000 keys)
  private readonly memoryFallback = new Map<string, MemoryBucket>();
  private readonly MAX_MEMORY_KEYS = 5000;

  constructor() {
    this.initRedis();
  }

  async onModuleInit(): Promise<void> {
    if (this.redis) {
      if (this.redis.status === 'wait') {
        try {
          await this.redis.connect();
          await this.redis.ping();
          this.isRedisHealthy = true;
        } catch (err: unknown) {
          this.logger.warn(
            `RateLimiter Redis initial connection failed: ${(err as Error).message}. Will use in-memory fallback until reconnected.`,
          );
          this.isRedisHealthy = false;
        }
      }
    }
  }

  private initRedis(): void {
    try {
      const options = getRedisConnectionOptions();
      this.redis = new Redis({
        ...options,
        lazyConnect: true,
        enableOfflineQueue: true,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) return null; // Avoid spamming connection retries
          return Math.min(times * 500, 2000);
        },
      });

      this.redis.on('connect', () => {
        this.isRedisHealthy = true;
        this.logger.log('RateLimiter Redis client connected successfully');
      });

      this.redis.on('ready', () => {
        this.isRedisHealthy = true;
      });

      this.redis.on('error', (err) => {
        this.isRedisHealthy = false;
        const now = Date.now();
        // Log warning at most once every 30 seconds
        if (now - this.lastWarningTimestamp > 30000) {
          this.logger.warn(
            `RateLimiter Redis connection error: ${err.message}. Using process-local fallback.`,
          );
          this.lastWarningTimestamp = now;
        }
      });

      this.redis.on('close', () => {
        this.isRedisHealthy = false;
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to initialize Redis for RateLimiter: ${(err as Error).message}. Using in-memory fallback.`,
      );
      this.isRedisHealthy = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
    this.memoryFallback.clear();
  }

  /**
   * Allows injecting a mock Redis client for unit testing.
   */
  setRedisClient(client: Redis | null): void {
    this.redis = client;
    this.isRedisHealthy = client !== null;
  }

  /**
   * Health ping for Redis.
   */
  async ping(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const res = await this.redis.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Executes atomic sliding window rate limiting.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    options: CheckRateLimitOptions = {},
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const memberId = `${now}:${crypto.randomUUID()}`;

    if (this.redis) {
      try {
        const raw = await this.redis.eval(
          SLIDING_WINDOW_LUA_SCRIPT,
          1,
          key,
          windowMs.toString(),
          limit.toString(),
          now.toString(),
          memberId,
        );

        if (Array.isArray(raw) && raw.length >= 4) {
          const allowed = Number(raw[0]) === 1;
          const current = Number(raw[1]);
          const remaining = Number(raw[2]);
          const resetMs = Number(raw[3]);
          const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
          const reset = Math.floor(now / 1000) + resetSeconds;

          return {
            allowed,
            limit,
            current,
            remaining,
            resetMs,
            reset,
            retryAfter: resetSeconds,
            fallbackUsed: false,
          };
        }
      } catch (err: unknown) {
        const n = Date.now();
        if (n - this.lastWarningTimestamp > 30000) {
          this.logger.warn(
            `Redis evaluation failed during rate limiting for key '${key}': ${(err as Error).message}. Applying fallback policy.`,
          );
          this.lastWarningTimestamp = n;
        }
      }
    }

    // Redis unavailable: apply explicit fallback policy
    return this.checkInMemoryFallback(key, limit, windowMs, options);
  }

  /**
   * Executes atomic multi-key sliding window rate limiting without partial/asymmetric quota consumption.
   */
  async checkMultiRateLimit(
    items: MultiRateLimitItem[],
    options: CheckRateLimitOptions = {},
  ): Promise<RateLimitResult> {
    if (items.length === 0) {
      return {
        allowed: true,
        limit: 0,
        current: 0,
        remaining: 0,
        resetMs: 0,
        reset: Math.floor(Date.now() / 1000),
        retryAfter: 0,
        fallbackUsed: false,
      };
    }

    if (items.length === 1) {
      return this.checkRateLimit(
        items[0].key,
        items[0].limit,
        items[0].windowMs,
        options,
      );
    }

    const now = Date.now();
    const memberId = `${now}:${crypto.randomUUID()}`;
    const keys = items.map((i) => i.key);
    const windowMs = Math.max(...items.map((i) => i.windowMs));
    const limits = items.map((i) => i.limit.toString());

    if (this.redis) {
      try {
        const raw = await this.redis.eval(
          MULTI_KEY_SLIDING_WINDOW_LUA_SCRIPT,
          keys.length,
          ...keys,
          windowMs.toString(),
          now.toString(),
          memberId,
          ...limits,
        );

        if (Array.isArray(raw) && raw.length >= 4) {
          const allowed = Number(raw[0]) === 1;
          const current = Number(raw[1]);
          const remaining = Number(raw[2]);
          const resetMs = Number(raw[3]);
          const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
          const reset = Math.floor(now / 1000) + resetSeconds;

          return {
            allowed,
            limit: items[0].limit,
            current,
            remaining,
            resetMs,
            reset,
            retryAfter: resetSeconds,
            fallbackUsed: false,
          };
        }
      } catch (err: unknown) {
        const n = Date.now();
        if (n - this.lastWarningTimestamp > 30000) {
          this.logger.warn(
            `Redis multi-key evaluation failed: ${(err as Error).message}. Applying fallback policy.`,
          );
          this.lastWarningTimestamp = n;
        }
      }
    }

    // Redis unavailable: apply multi-key in-memory fallback
    return this.checkMultiInMemoryFallback(items, options);
  }

  /**
   * Bounded in-memory sliding window fallback for Redis degradation.
   */
  private checkInMemoryFallback(
    key: string,
    limit: number,
    windowMs: number,
    options: CheckRateLimitOptions,
  ): RateLimitResult {
    const now = Date.now();

    // If route specifies strict fail-closed on Redis failure
    if (options.fallbackFailClosed) {
      const resetSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      return {
        allowed: false,
        limit,
        current: limit,
        remaining: 0,
        resetMs: windowMs,
        reset: Math.floor(now / 1000) + resetSeconds,
        retryAfter: resetSeconds,
        fallbackUsed: true,
        serviceUnavailable: true,
      };
    }

    const clearBefore = now - windowMs;

    let bucket = this.memoryFallback.get(key);
    if (!bucket) {
      // Memory limit protection: prune oldest if size exceeded
      if (this.memoryFallback.size >= this.MAX_MEMORY_KEYS) {
        const firstKey = this.memoryFallback.keys().next().value;
        if (firstKey) this.memoryFallback.delete(firstKey);
      }
      bucket = { timestamps: [] };
      this.memoryFallback.set(key, bucket);
    }

    // Filter out expired timestamps
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > clearBefore);

    if (bucket.timestamps.length < limit) {
      bucket.timestamps.push(now);
      const current = bucket.timestamps.length;
      const resetSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      return {
        allowed: true,
        limit,
        current,
        remaining: limit - current,
        resetMs: windowMs,
        reset: Math.floor(now / 1000) + resetSeconds,
        retryAfter: resetSeconds,
        fallbackUsed: true,
      };
    }

    // Limit exceeded in local window
    const oldest = bucket.timestamps[0] || now;
    const resetMs = Math.max(1000, oldest + windowMs - now);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    return {
      allowed: false,
      limit,
      current: bucket.timestamps.length,
      remaining: 0,
      resetMs,
      reset: Math.floor(now / 1000) + resetSeconds,
      retryAfter: resetSeconds,
      fallbackUsed: true,
    };
  }

  /**
   * Bounded in-memory sliding window fallback for multi-key evaluation.
   * Atomically verifies all buckets without partial consumption on rejection.
   */
  private checkMultiInMemoryFallback(
    items: MultiRateLimitItem[],
    options: CheckRateLimitOptions,
  ): RateLimitResult {
    const now = Date.now();
    const maxWindowMs = Math.max(...items.map((i) => i.windowMs));

    if (options.fallbackFailClosed) {
      const resetSeconds = Math.max(1, Math.ceil(maxWindowMs / 1000));
      return {
        allowed: false,
        limit: items[0].limit,
        current: items[0].limit,
        remaining: 0,
        resetMs: maxWindowMs,
        reset: Math.floor(now / 1000) + resetSeconds,
        retryAfter: resetSeconds,
        fallbackUsed: true,
        serviceUnavailable: true,
      };
    }

    // Step 1: Clean and verify limits for ALL items without modifying
    for (const item of items) {
      const clearBefore = now - item.windowMs;
      let bucket = this.memoryFallback.get(item.key);
      if (!bucket) {
        if (this.memoryFallback.size >= this.MAX_MEMORY_KEYS) {
          const firstKey = this.memoryFallback.keys().next().value;
          if (firstKey) this.memoryFallback.delete(firstKey);
        }
        bucket = { timestamps: [] };
        this.memoryFallback.set(item.key, bucket);
      }
      bucket.timestamps = bucket.timestamps.filter((ts) => ts > clearBefore);

      if (bucket.timestamps.length >= item.limit) {
        // Reject without adding to any bucket (zero partial consumption)
        const oldest = bucket.timestamps[0] || now;
        const resetMs = Math.max(1000, oldest + item.windowMs - now);
        const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
        return {
          allowed: false,
          limit: item.limit,
          current: bucket.timestamps.length,
          remaining: 0,
          resetMs,
          reset: Math.floor(now / 1000) + resetSeconds,
          retryAfter: resetSeconds,
          fallbackUsed: true,
        };
      }
    }

    // Step 2: All items are under limit -> consume quota on all items atomically
    let minRemaining = 999999;
    for (const item of items) {
      const bucket = this.memoryFallback.get(item.key)!;
      bucket.timestamps.push(now);
      const remaining = Math.max(0, item.limit - bucket.timestamps.length);
      if (remaining < minRemaining) {
        minRemaining = remaining;
      }
    }

    const resetSeconds = Math.max(1, Math.ceil(maxWindowMs / 1000));
    return {
      allowed: true,
      limit: items[0].limit,
      current: items[0].limit - minRemaining,
      remaining: minRemaining,
      resetMs: maxWindowMs,
      reset: Math.floor(now / 1000) + resetSeconds,
      retryAfter: resetSeconds,
      fallbackUsed: true,
    };
  }

  /**
   * Resets rate limit for a specific key (useful for tests and administrative unlocks).
   */
  async resetLimit(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Ignore deletion errors during degradation
      }
    }
  }
}
