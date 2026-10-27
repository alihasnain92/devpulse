import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicy } from '@devpulse/shared';

export const RATE_LIMIT_METADATA_KEY = 'devpulse:rate_limit_policy';
export const SKIP_RATE_LIMIT_METADATA_KEY = 'devpulse:skip_rate_limit';

export interface RateLimitOptions {
  limit?: number;
  ttlMs?: number;
  keyPrefix?: string;
  policy?: RateLimitPolicy;
  fallbackFailClosed?: boolean;
}

/**
 * Decorator to apply explicit rate limit policy or overrides on a controller or route handler.
 */
export const RateLimit = (options: RateLimitOptions | RateLimitPolicy) => {
  const normalized: RateLimitOptions =
    'limit' in options && 'ttlMs' in options && 'keyPrefix' in options
      ? { policy: options as RateLimitPolicy }
      : (options as RateLimitOptions);

  return SetMetadata(RATE_LIMIT_METADATA_KEY, normalized);
};

/**
 * Decorator to skip rate limiting entirely on an endpoint (e.g. internal health probes).
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_METADATA_KEY, true);
