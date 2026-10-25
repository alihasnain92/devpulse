import { HttpMethod, MONITOR_LIMITS, DEMO_CONFIG } from './constants';

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

  describe('DEMO_CONFIG', () => {
    it('should provide the standard demo email', () => {
      expect(DEMO_CONFIG.DEMO_USER_EMAIL).toBe('demo@devpulse.dev');
    });
  });
});
