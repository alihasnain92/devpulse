import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DashboardSummaryDto,
  MonitorStatsDto,
  StatsWindow,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateTimeBuckets,
  calculateMean,
  calculatePercentile,
  calculateUptime,
  getTimeWindowRange,
} from './metrics-calculator';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves aggregated uptime and latency statistics for a specific monitor
   * over the specified time window ('24h' | '7d' | '30d').
   * Verifies ownership and returns 404 if the monitor does not belong to the user.
   */
  async getMonitorStats(
    monitorId: string,
    userId: string,
    window: StatsWindow = '24h',
  ): Promise<MonitorStatsDto> {
    // Verify monitor ownership in database query
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor ${monitorId} not found`);
    }

    const range = getTimeWindowRange(window);

    // Query non-seeded checks within the window range
    const checks = await this.prisma.checkResult.findMany({
      where: {
        monitorId,
        checkedAt: {
          gte: range.from,
          lte: range.to,
        },
        isSeeded: false,
      },
      select: {
        checkedAt: true,
        isSuccess: true,
        latencyMs: true,
      },
      orderBy: {
        checkedAt: 'asc',
      },
    });

    const totalChecks = checks.length;
    const successfulChecks = checks.filter(
      (c: { isSuccess: boolean }) => c.isSuccess,
    ).length;
    const failedChecks = totalChecks - successfulChecks;
    const uptimePercent = calculateUptime(successfulChecks, totalChecks);

    const successfulLatencies = checks
      .filter(
        (c: { isSuccess: boolean; latencyMs: number }) =>
          c.isSuccess && typeof c.latencyMs === 'number',
      )
      .map((c: { latencyMs: number }) => c.latencyMs)
      .sort((a: number, b: number) => a - b);

    const avgLatencyMs = calculateMean(successfulLatencies);
    const p50LatencyMs = calculatePercentile(successfulLatencies, 50);
    const p95LatencyMs = calculatePercentile(successfulLatencies, 95);
    const p99LatencyMs = calculatePercentile(successfulLatencies, 99);

    const series = aggregateTimeBuckets(checks, range, window);

    return {
      monitorId,
      window,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      uptimePercent,
      totalChecks,
      successfulChecks,
      failedChecks,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      series,
    };
  }

  /**
   * Computes system-wide dashboard summary metrics for an authenticated user:
   * monitor counts, health status breakdown, active incidents, and 24h uptime.
   */
  async getDashboardSummary(userId: string): Promise<DashboardSummaryDto> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, isPaused: true },
    });

    const totalMonitors = monitors.length;
    const activeMonitors = monitors.filter(
      (m: { isPaused: boolean }) => !m.isPaused,
    ).length;
    const pausedMonitors = monitors.filter(
      (m: { isPaused: boolean }) => m.isPaused,
    ).length;

    if (totalMonitors === 0) {
      return {
        totalMonitors: 0,
        activeMonitors: 0,
        pausedMonitors: 0,
        passingEndpoints: 0,
        failingEndpoints: 0,
        neverCheckedEndpoints: 0,
        activeIncidents: 0,
        systemUptime24h: null,
      };
    }

    const monitorIds = monitors.map((m: { id: string }) => m.id);

    // Active incidents across all user's monitors
    const activeIncidents = await this.prisma.incident.count({
      where: {
        monitor: { userId },
        isResolved: false,
      },
    });

    // Find latest check for each monitor (non-seeded) using DISTINCT ON
    const latestChecks = await this.prisma.checkResult.findMany({
      where: {
        monitorId: { in: monitorIds },
        isSeeded: false,
      },
      distinct: ['monitorId'],
      orderBy: [{ monitorId: 'asc' }, { checkedAt: 'desc' }],
      select: {
        monitorId: true,
        isSuccess: true,
      },
    });

    const latestCheckMap = new Map<string, boolean>();
    for (const c of latestChecks as Array<{ monitorId: string; isSuccess: boolean }>) {
      latestCheckMap.set(c.monitorId, c.isSuccess);
    }

    let passingEndpoints = 0;
    let failingEndpoints = 0;
    let neverCheckedEndpoints = 0;

    for (const m of monitors as Array<{ id: string; isPaused: boolean }>) {
      const isSuccess = latestCheckMap.get(m.id);
      if (isSuccess === undefined) {
        neverCheckedEndpoints++;
      } else if (isSuccess) {
        passingEndpoints++;
      } else {
        failingEndpoints++;
      }
    }

    // 24h system uptime across all monitors of the user
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total24hChecks, successful24hChecks] = await Promise.all([
      this.prisma.checkResult.count({
        where: {
          monitor: { userId },
          checkedAt: { gte: twentyFourHoursAgo },
          isSeeded: false,
        },
      }),
      this.prisma.checkResult.count({
        where: {
          monitor: { userId },
          checkedAt: { gte: twentyFourHoursAgo },
          isSuccess: true,
          isSeeded: false,
        },
      }),
    ]);

    const systemUptime24h = calculateUptime(successful24hChecks, total24hChecks);

    return {
      totalMonitors,
      activeMonitors,
      pausedMonitors,
      passingEndpoints,
      failingEndpoints,
      neverCheckedEndpoints,
      activeIncidents,
      systemUptime24h,
    };
  }
}
