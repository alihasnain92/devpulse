import { ConnectionOptions } from 'bullmq';

export const MONITOR_CHECKS_QUEUE_NAME = 'monitor-checks';

export const MONITOR_JOB_NAMES = {
  SCHEDULED_CHECK: 'scheduled-check',
  MANUAL_CHECK: 'manual-check',
} as const;

export function getRedisConnectionOptions(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db:
        parsed.pathname && parsed.pathname.length > 1
          ? parseInt(parsed.pathname.slice(1), 10)
          : 0,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}
