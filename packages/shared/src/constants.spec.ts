import {
  HttpMethod,
  MONITOR_LIMITS,
  AUTH_COOKIES,
  AUTH_EXPIRY,
  SECURITY_CONFIG,
  DEMO_CONFIG,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_CONFIG,
  API_KEY_SCOPES,
  API_KEY_CONFIG,
} from './constants';

describe('Shared Constants', () => {
  describe('HttpMethod', () => {
    it('should export GET and HEAD methods for Level 1 monitoring', () => {
      expect(HttpMethod.GET).toBe('GET');
      expect(HttpMethod.HEAD).toBe('HEAD');
      expect(Object.values(HttpMethod)).toEqual(['GET', 'HEAD']);
    });
  });

  describe('MONITOR_LIMITS', () => {
    it('should enforce reasonable check intervals', () => {
      expect(MONITOR_LIMITS.MIN_INTERVAL_SECONDS).toBe(30);
      expect(MONITOR_LIMITS.MAX_INTERVAL_SECONDS).toBe(3600);
      expect(MONITOR_LIMITS.DEFAULT_INTERVAL_SECONDS).toBe(60);
      expect(MONITOR_LIMITS.MIN_INTERVAL_SECONDS).toBeLessThan(MONITOR_LIMITS.MAX_INTERVAL_SECONDS);
    });

    it('should enforce reasonable network timeouts', () => {
      expect(MONITOR_LIMITS.MIN_TIMEOUT_MS).toBe(1000);
      expect(MONITOR_LIMITS.MAX_TIMEOUT_MS).toBe(30000);
      expect(MONITOR_LIMITS.DEFAULT_TIMEOUT_MS).toBe(10000);
      expect(MONITOR_LIMITS.MIN_TIMEOUT_MS).toBeLessThan(MONITOR_LIMITS.MAX_TIMEOUT_MS);
    });

    it('should configure safety limits and incident thresholds', () => {
      expect(MONITOR_LIMITS.MAX_RESPONSE_BYTES).toBe(1024 * 1024); // 1MB stream cap
      expect(MONITOR_LIMITS.DEFAULT_EXPECTED_STATUS).toBe(200);
      expect(MONITOR_LIMITS.CONSECUTIVE_FAILURES_FOR_INCIDENT).toBe(3);
    });
  });

  describe('AUTH_COOKIES and AUTH_EXPIRY', () => {
    it('should define distinct cookie names', () => {
      expect(AUTH_COOKIES.ACCESS_TOKEN).toBe('devpulse_access_token');
      expect(AUTH_COOKIES.REFRESH_TOKEN).toBe('devpulse_refresh_token');
      expect(AUTH_COOKIES.ACCESS_TOKEN).not.toBe(AUTH_COOKIES.REFRESH_TOKEN);
    });

    it('should define reasonable expiration times', () => {
      expect(AUTH_EXPIRY.ACCESS_TOKEN_MS).toBe(15 * 60 * 1000);
      expect(AUTH_EXPIRY.REFRESH_TOKEN_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(AUTH_EXPIRY.ACCESS_TOKEN_MS).toBeLessThan(AUTH_EXPIRY.REFRESH_TOKEN_MS);
    });
  });

  describe('SECURITY_CONFIG', () => {
    it('should enforce secure password and hashing parameters', () => {
      expect(SECURITY_CONFIG.MIN_PASSWORD_LENGTH).toBe(8);
      expect(SECURITY_CONFIG.MAX_PASSWORD_LENGTH).toBe(128);
      expect(SECURITY_CONFIG.BCRYPT_SALT_ROUNDS).toBeGreaterThanOrEqual(10);
      expect(SECURITY_CONFIG.CSRF_HEADER_NAME).toBe('x-devpulse-csrf');
    });
  });

  describe('DEMO_CONFIG', () => {
    it('should provide the standard demo email', () => {
      expect(DEMO_CONFIG.DEMO_USER_EMAIL).toBe('demo@devpulse.dev');
    });
  });

  describe('Webhook & API Key Constants', () => {
    it('should define explicit webhook event types', () => {
      expect(WEBHOOK_EVENT_TYPES).toContain('incident.created');
      expect(WEBHOOK_EVENT_TYPES).toContain('incident.resolved');
      expect(WEBHOOK_EVENT_TYPES).toHaveLength(2);
    });

    it('should define webhook signature configuration', () => {
      expect(WEBHOOK_CONFIG.SECRET_PREFIX).toBe('whsec_');
      expect(WEBHOOK_CONFIG.SIGNATURE_HEADER_NAME).toBe('x-devpulse-signature');
      expect(WEBHOOK_CONFIG.SIGNATURE_VERSION).toBe('v1');
      expect(WEBHOOK_CONFIG.DEFAULT_TOLERANCE_SECONDS).toBe(300);
      expect(WEBHOOK_CONFIG.MAX_ENDPOINTS_PER_USER).toBe(20);
      expect(WEBHOOK_CONFIG.MAX_NAME_LENGTH).toBe(100);
      expect(WEBHOOK_CONFIG.MAX_DESCRIPTION_LENGTH).toBe(255);
    });

    it('should define explicit least-privilege API key scopes', () => {
      expect(API_KEY_SCOPES).toEqual([
        'monitors:read',
        'monitors:write',
        'incidents:read',
        'webhooks:read',
        'webhooks:write',
      ]);
    });

    it('should define API key configuration and prefix', () => {
      expect(API_KEY_CONFIG.PREFIX).toBe('dp_live_');
      expect(API_KEY_CONFIG.HEADER_NAME).toBe('x-api-key');
    });
  });
});
