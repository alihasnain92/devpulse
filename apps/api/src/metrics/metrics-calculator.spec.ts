import {
  calculateUptime,
  calculateMean,
  calculatePercentile,
  getTimeWindowRange,
  aggregateTimeBuckets,
  CheckRecord,
} from './metrics-calculator';

describe('MetricsCalculator', () => {
  describe('calculateUptime', () => {
    it('returns null when totalChecks is 0 (avoids misleading 0% or 100%)', () => {
      expect(calculateUptime(0, 0)).toBeNull();
      expect(calculateUptime(5, 0)).toBeNull();
    });

    it('returns 100 for all successful checks', () => {
      expect(calculateUptime(10, 10)).toBe(100);
      expect(calculateUptime(1, 1)).toBe(100);
    });

    it('returns 0 when 0 successful checks exist out of total > 0', () => {
      expect(calculateUptime(0, 10)).toBe(0);
      expect(calculateUptime(0, 1)).toBe(0);
    });

    it('calculates accurate percentage rounded to 2 decimals', () => {
      // 199 / 200 = 99.5%
      expect(calculateUptime(199, 200)).toBe(99.5);
      // 1 / 3 = 33.33%
      expect(calculateUptime(1, 3)).toBe(33.33);
      // 2 / 3 = 66.67%
      expect(calculateUptime(2, 3)).toBe(66.67);
    });
  });

  describe('calculateMean', () => {
    it('returns null for an empty array', () => {
      expect(calculateMean([])).toBeNull();
    });

    it('returns the element itself for a single-item array', () => {
      expect(calculateMean([42])).toBe(42);
    });

    it('calculates arithmetic mean rounded to 1 decimal place', () => {
      expect(calculateMean([10, 20, 30])).toBe(20);
      // (10 + 20 + 25) / 3 = 18.333... -> 18.3
      expect(calculateMean([10, 20, 25])).toBe(18.3);
    });
  });

  describe('calculatePercentile (nearest-rank method)', () => {
    it('returns null for empty array', () => {
      expect(calculatePercentile([], 50)).toBeNull();
      expect(calculatePercentile([], 95)).toBeNull();
      expect(calculatePercentile([], 99)).toBeNull();
    });

    it('returns the single value for N=1 across all percentiles', () => {
      expect(calculatePercentile([150], 50)).toBe(150);
      expect(calculatePercentile([150], 95)).toBe(150);
      expect(calculatePercentile([150], 99)).toBe(150);
    });

    it('calculates correct percentiles for 10 sorted numbers [10..100]', () => {
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      // k = ceil(0.50 * 10) = 5 -> index 4 -> 50
      expect(calculatePercentile(latencies, 50)).toBe(50);
      // k = ceil(0.95 * 10) = 10 -> index 9 -> 100
      expect(calculatePercentile(latencies, 95)).toBe(100);
      // k = ceil(0.99 * 10) = 10 -> index 9 -> 100
      expect(calculatePercentile(latencies, 99)).toBe(100);
      // k = ceil(0.10 * 10) = 1 -> index 0 -> 10
      expect(calculatePercentile(latencies, 10)).toBe(10);
    });

    it('calculates correct percentiles for 100 sorted numbers 1..100', () => {
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(calculatePercentile(latencies, 50)).toBe(50);
      expect(calculatePercentile(latencies, 95)).toBe(95);
      expect(calculatePercentile(latencies, 99)).toBe(99);
      expect(calculatePercentile(latencies, 1)).toBe(1);
    });

    it('handles identical values correctly', () => {
      const latencies = [200, 200, 200, 200, 200];
      expect(calculatePercentile(latencies, 50)).toBe(200);
      expect(calculatePercentile(latencies, 95)).toBe(200);
      expect(calculatePercentile(latencies, 99)).toBe(200);
    });
  });

  describe('getTimeWindowRange', () => {
    const fixedNow = new Date('2026-10-26T14:35:22.000Z');

    it('creates 24 1-hour buckets for 24h window', () => {
      const range = getTimeWindowRange('24h', fixedNow);
      expect(range.bucketCount).toBe(24);
      expect(range.bucketDurationMs).toBe(3600000);
      // current hour start is 14:00:00.000Z
      // from is 14:00 - 23h = 15:00 previous day
      // to is 14:00 + 1h = 15:00 current day
      expect(range.to.getTime() - range.from.getTime()).toBe(24 * 3600000);
      expect(range.from.toISOString()).toBe('2026-10-25T15:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-10-26T15:00:00.000Z');
    });

    it('creates 7 1-day buckets for 7d window', () => {
      const range = getTimeWindowRange('7d', fixedNow);
      expect(range.bucketCount).toBe(7);
      expect(range.bucketDurationMs).toBe(86400000);
      // current day start is 2026-10-26T00:00:00.000Z
      // from is 2026-10-20T00:00:00.000Z (7 days total coverage)
      expect(range.from.toISOString()).toBe('2026-10-20T00:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-10-27T00:00:00.000Z');
    });

    it('creates 30 1-day buckets for 30d window', () => {
      const range = getTimeWindowRange('30d', fixedNow);
      expect(range.bucketCount).toBe(30);
      expect(range.bucketDurationMs).toBe(86400000);
      expect(range.to.getTime() - range.from.getTime()).toBe(30 * 86400000);
    });
  });

  describe('aggregateTimeBuckets', () => {
    const fixedNow = new Date('2026-10-26T14:30:00.000Z');
    const range = getTimeWindowRange('24h', fixedNow);

    it('returns empty buckets with null uptime and null latency when no checks exist', () => {
      const buckets = aggregateTimeBuckets([], range, '24h');
      expect(buckets).toHaveLength(24);
      expect(buckets[0].totalChecks).toBe(0);
      expect(buckets[0].successfulChecks).toBe(0);
      expect(buckets[0].failedChecks).toBe(0);
      expect(buckets[0].uptimePercent).toBeNull();
      expect(buckets[0].avgLatencyMs).toBeNull();
    });

    it('places checks into the correct hourly bucket and calculates metrics', () => {
      // Bucket 23 is 2026-10-26T14:00:00.000Z to 15:00:00.000Z
      const checks: CheckRecord[] = [
        {
          checkedAt: '2026-10-26T14:05:00.000Z',
          isSuccess: true,
          latencyMs: 120,
        },
        {
          checkedAt: '2026-10-26T14:15:00.000Z',
          isSuccess: true,
          latencyMs: 140,
        },
        {
          checkedAt: '2026-10-26T14:25:00.000Z',
          isSuccess: false,
          latencyMs: 500,
        },
      ];

      const buckets = aggregateTimeBuckets(checks, range, '24h');
      const latestBucket = buckets[23];

      expect(latestBucket.totalChecks).toBe(3);
      expect(latestBucket.successfulChecks).toBe(2);
      expect(latestBucket.failedChecks).toBe(1);
      // 2 / 3 = 66.67%
      expect(latestBucket.uptimePercent).toBe(66.67);
      // successful latencies: 120, 140 -> mean = 130
      expect(latestBucket.avgLatencyMs).toBe(130);
    });
  });
});
