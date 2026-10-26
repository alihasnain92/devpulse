import { StatsWindow, TimeBucketDto } from '@devpulse/shared';

export interface CheckRecord {
  checkedAt: Date | string;
  isSuccess: boolean;
  latencyMs: number;
}

export interface WindowRange {
  from: Date;
  to: Date;
  bucketDurationMs: number;
  bucketCount: number;
}

/**
 * Calculates uptime percentage. Returns null if totalChecks is 0.
 * Never returns misleading 0% or 100% when there is no data.
 */
export function calculateUptime(
  successfulChecks: number,
  totalChecks: number,
): number | null {
  if (totalChecks <= 0) {
    return null;
  }
  const percent = (successfulChecks / totalChecks) * 100;
  return Number(percent.toFixed(2));
}

/**
 * Calculates arithmetic mean. Returns null if array is empty.
 */
export function calculateMean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Number((sum / values.length).toFixed(1));
}

/**
 * Calculates percentile using the standard nearest-rank method:
 *   k = ceil((P / 100) * N)
 * on 1-indexed sorted values (index k - 1 in 0-indexed array).
 * Returns null if sortedValues is empty.
 */
export function calculatePercentile(
  sortedValues: number[],
  percentile: number,
): number | null {
  const n = sortedValues.length;
  if (n === 0) {
    return null;
  }
  if (percentile <= 0) {
    return sortedValues[0];
  }
  if (percentile >= 100) {
    return sortedValues[n - 1];
  }

  const k = Math.ceil((percentile / 100) * n);
  const index = Math.min(Math.max(k - 1, 0), n - 1);
  return sortedValues[index];
}

/**
 * Returns UTC-aligned time window boundaries and bucket configuration.
 */
export function getTimeWindowRange(
  window: StatsWindow,
  now: Date = new Date(),
): WindowRange {
  if (window === '24h') {
    const bucketDurationMs = 60 * 60 * 1000; // 1 hour
    const bucketCount = 24;
    const currentHourStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        0,
        0,
        0,
      ),
    );
    const from = new Date(currentHourStart.getTime() - 23 * bucketDurationMs);
    const to = new Date(currentHourStart.getTime() + bucketDurationMs);
    return { from, to, bucketDurationMs, bucketCount };
  }

  if (window === '7d') {
    const bucketDurationMs = 24 * 60 * 60 * 1000; // 1 day
    const bucketCount = 7;
    const currentDayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const from = new Date(currentDayStart.getTime() - 6 * bucketDurationMs);
    const to = new Date(currentDayStart.getTime() + bucketDurationMs);
    return { from, to, bucketDurationMs, bucketCount };
  }

  // 30d
  const bucketDurationMs = 24 * 60 * 60 * 1000; // 1 day
  const bucketCount = 30;
  const currentDayStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const from = new Date(currentDayStart.getTime() - 29 * bucketDurationMs);
  const to = new Date(currentDayStart.getTime() + bucketDurationMs);
  return { from, to, bucketDurationMs, bucketCount };
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Aggregates a list of check records into uniform UTC-aligned time buckets.
 */
export function aggregateTimeBuckets(
  checks: CheckRecord[],
  windowRange: WindowRange,
  window: StatsWindow,
): TimeBucketDto[] {
  const { from, bucketDurationMs, bucketCount } = windowRange;
  const buckets: TimeBucketDto[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketStartMs = from.getTime() + i * bucketDurationMs;
    const bucketEndMs = bucketStartMs + bucketDurationMs;
    const bucketStartDate = new Date(bucketStartMs);

    let label: string;
    if (window === '24h') {
      const hh = String(bucketStartDate.getUTCHours()).padStart(2, '0');
      const mm = String(bucketStartDate.getUTCMinutes()).padStart(2, '0');
      label = `${hh}:${mm}`;
    } else {
      const month = MONTH_NAMES[bucketStartDate.getUTCMonth()];
      const day = bucketStartDate.getUTCDate();
      label = `${month} ${day}`;
    }

    const checksInBucket = checks.filter((c) => {
      const t = new Date(c.checkedAt).getTime();
      return t >= bucketStartMs && t < bucketEndMs;
    });

    const totalChecks = checksInBucket.length;
    const successfulChecks = checksInBucket.filter((c) => c.isSuccess).length;
    const failedChecks = totalChecks - successfulChecks;

    const uptimePercent = calculateUptime(successfulChecks, totalChecks);

    const successfulLatencies = checksInBucket
      .filter((c) => c.isSuccess && typeof c.latencyMs === 'number')
      .map((c) => c.latencyMs);

    const avgLatencyMs = calculateMean(successfulLatencies);

    buckets.push({
      timestamp: bucketStartDate.toISOString(),
      label,
      uptimePercent,
      avgLatencyMs,
      totalChecks,
      successfulChecks,
      failedChecks,
    });
  }

  return buckets;
}
