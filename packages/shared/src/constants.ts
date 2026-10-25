export enum HttpMethod {
  GET = 'GET',
  HEAD = 'HEAD',
}

export const MONITOR_LIMITS = {
  MIN_INTERVAL_SECONDS: 30,
  MAX_INTERVAL_SECONDS: 3600,
  DEFAULT_INTERVAL_SECONDS: 60,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 30000,
  DEFAULT_TIMEOUT_MS: 10000,
  MAX_RESPONSE_BYTES: 1024 * 1024, // 1MB response stream limit
  DEFAULT_EXPECTED_STATUS: 200,
  CONSECUTIVE_FAILURES_FOR_INCIDENT: 3,
} as const;

export const AUTH_COOKIES = {
  ACCESS_TOKEN: 'devpulse_access_token',
  REFRESH_TOKEN: 'devpulse_refresh_token',
} as const;

export const AUTH_EXPIRY = {
  ACCESS_TOKEN_MS: 15 * 60 * 1000, // 15 minutes
  ACCESS_TOKEN_SECONDS: 15 * 60,
  REFRESH_TOKEN_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  REFRESH_TOKEN_SECONDS: 7 * 24 * 60 * 60,
} as const;

export const SECURITY_CONFIG = {
  CSRF_HEADER_NAME: 'x-devpulse-csrf',
  CSRF_HEADER_VALUE: '1',
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  BCRYPT_SALT_ROUNDS: 12,
} as const;

export const DEMO_CONFIG = {
  DEMO_USER_EMAIL: 'demo@devpulse.dev',
} as const;
