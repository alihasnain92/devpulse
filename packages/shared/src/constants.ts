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

export const WEBHOOK_EVENT_TYPES = [
  'incident.created',
  'incident.resolved',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_CONFIG = {
  SECRET_PREFIX: 'whsec_',
  SIGNATURE_HEADER_NAME: 'x-devpulse-signature',
  SIGNATURE_VERSION: 'v1',
  DEFAULT_TOLERANCE_SECONDS: 300, // 5 minutes
  MAX_ENDPOINTS_PER_USER: 20,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 255,
} as const;

export const WEBHOOK_DELIVERIES_QUEUE_NAME = 'webhook-deliveries';

export const WEBHOOK_DELIVERY_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  RETRYING: 'RETRYING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;

export type WebhookDeliveryStatus =
  (typeof WEBHOOK_DELIVERY_STATUS)[keyof typeof WEBHOOK_DELIVERY_STATUS];

export const WEBHOOK_DELIVERY_ORIGIN = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL_REPLAY: 'MANUAL_REPLAY',
} as const;

export type WebhookDeliveryOrigin =
  (typeof WEBHOOK_DELIVERY_ORIGIN)[keyof typeof WEBHOOK_DELIVERY_ORIGIN];

export const WEBHOOK_PAGINATION_CONFIG = {
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;

export const WEBHOOK_OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type WebhookOutboxStatus =
  (typeof WEBHOOK_OUTBOX_STATUS)[keyof typeof WEBHOOK_OUTBOX_STATUS];

export const WEBHOOK_ATTEMPT_STATUS = {
  STARTED: 'STARTED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
} as const;

export type WebhookAttemptStatus =
  (typeof WEBHOOK_ATTEMPT_STATUS)[keyof typeof WEBHOOK_ATTEMPT_STATUS];

export const WEBHOOK_LEASE_CONFIG = {
  OUTBOX_LEASE_TIMEOUT_MS: 60000, // 60 seconds
  DELIVERY_LEASE_TIMEOUT_MS: 120000, // 120 seconds
} as const;

export const WEBHOOK_RETRY_CONFIG = {
  MAX_ATTEMPTS: 6,
  BASE_DELAY_MS: 30000, // 30 seconds
  MAX_DELAY_MS: 7200000, // 2 hours
  BACKOFF_EXPONENT: 2,
  JITTER_FACTOR: 0.2, // +/- 20% jitter
  DELIVERY_TIMEOUT_MS: 10000, // 10s
  MAX_RESPONSE_PREVIEW_BYTES: 1024, // 1KB
} as const;

export const API_KEY_SCOPES = [
  'monitors:read',
  'monitors:write',
  'incidents:read',
  'webhooks:read',
  'webhooks:write',
  'notifications:read',
  'notifications:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const NOTIFICATION_TYPE = {
  INCIDENT_CREATED: 'INCIDENT_CREATED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  inAppIncidentCreated: true,
  inAppIncidentResolved: true,
  emailIncidentCreated: false,
  emailIncidentResolved: false,
} as const;

export const NOTIFICATION_EMAIL_QUEUE_NAME = 'notification-emails';

export const NOTIFICATION_EMAIL_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  RETRYING: 'RETRYING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;

export type NotificationEmailStatus =
  (typeof NOTIFICATION_EMAIL_STATUS)[keyof typeof NOTIFICATION_EMAIL_STATUS];

export const NOTIFICATION_EMAIL_OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type NotificationEmailOutboxStatus =
  (typeof NOTIFICATION_EMAIL_OUTBOX_STATUS)[keyof typeof NOTIFICATION_EMAIL_OUTBOX_STATUS];

export const NOTIFICATION_EMAIL_LEASE_CONFIG = {
  OUTBOX_LEASE_TIMEOUT_MS: 60000, // 60 seconds
  DELIVERY_LEASE_TIMEOUT_MS: 120000, // 120 seconds
} as const;

export const NOTIFICATION_EMAIL_RETRY_CONFIG = {
  MAX_ATTEMPTS: 5,
  BASE_DELAY_MS: 30000, // 30 seconds
  MAX_DELAY_MS: 1800000, // 30 minutes
  BACKOFF_EXPONENT: 2,
  JITTER_FACTOR: 0.2, // +/- 20% jitter
} as const;

export const NOTIFICATION_PAGINATION_CONFIG = {
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;

export const API_KEY_CONFIG = {
  PREFIX: 'dp_live_',
  HEADER_NAME: 'x-api-key',
  DISPLAY_PREFIX_LENGTH: 12,
  MAX_KEYS_PER_USER: 10,
} as const;

export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

export const RATE_LIMIT_POLICIES = {
  // Authentication endpoints
  AUTH_LOGIN: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 5,
    ipLimit: 20,
    keyPrefix: 'rl:auth:login',
  },
  AUTH_REGISTER: {
    ttlMs: 10 * 60 * 1000, // 10 minutes
    limit: 5,
    ipLimit: 15,
    keyPrefix: 'rl:auth:register',
  },
  AUTH_REFRESH: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 30,
    keyPrefix: 'rl:auth:refresh',
  },

  // Authenticated user standard endpoints
  USER_READ: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 120,
    keyPrefix: 'rl:user:read',
  },
  USER_WRITE: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 60,
    keyPrefix: 'rl:user:write',
  },

  // Programmatic API Keys
  API_KEY: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 120,
    keyPrefix: 'rl:api-key',
  },

  // Monitor manual check
  MONITOR_CHECK_USER: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 10,
    keyPrefix: 'rl:monitor:check:user',
  },
  MONITOR_CHECK_TARGET: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 3,
    keyPrefix: 'rl:monitor:check:target',
  },

  // Webhook management mutations
  WEBHOOK_MUTATION: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 30,
    keyPrefix: 'rl:webhook:mutation',
  },

  // Webhook manual replay
  WEBHOOK_REPLAY_USER: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 10,
    keyPrefix: 'rl:replay:user',
  },
  WEBHOOK_REPLAY_DELIVERY: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 5,
    keyPrefix: 'rl:replay:del',
  },

  // Notification mutations
  NOTIFICATION_MUTATION: {
    ttlMs: 60 * 1000, // 1 minute
    limit: 60,
    keyPrefix: 'rl:notification:mutation',
  },
} as const;

export type RateLimitPolicyKey = keyof typeof RATE_LIMIT_POLICIES;
export type RateLimitPolicy = (typeof RATE_LIMIT_POLICIES)[RateLimitPolicyKey];
