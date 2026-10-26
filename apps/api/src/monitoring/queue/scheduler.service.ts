import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MONITOR_CHECKS_QUEUE_NAME,
  MONITOR_JOB_NAMES,
  getRedisConnectionOptions,
} from './queue.constants';

export interface ReconciliationResult {
  added: number;
  removed: number;
  updated: number;
  totalActive: number;
}

@Injectable()
export class SchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SchedulerService.name);
  private queue: Queue;

  constructor(private readonly prisma: PrismaService) {
    this.queue = new Queue(MONITOR_CHECKS_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });

    this.queue.on('error', (err) => {
      this.logger.warn(`BullMQ Queue error: ${err.message}`);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    // Reconcile schedulers on startup in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      try {
        const stats = await this.reconcileSchedulers();
        this.logger.log(
          `Scheduler reconciliation complete: ${stats.totalActive} active monitors, ` +
            `${stats.added} added, ${stats.removed} removed, ${stats.updated} updated.`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed initial scheduler reconciliation: ${message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.close();
      this.logger.log('Scheduler queue closed gracefully');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error closing scheduler queue: ${message}`);
    }
  }

  getSchedulerKey(monitorId: string): string {
    return `monitor:${monitorId}`;
  }

  async scheduleMonitor(monitor: {
    id: string;
    intervalSeconds: number;
  }): Promise<void> {
    const schedulerKey = this.getSchedulerKey(monitor.id);
    const intervalMs = monitor.intervalSeconds * 1000;

    await this.queue.upsertJobScheduler(
      schedulerKey,
      { every: intervalMs },
      {
        name: MONITOR_JOB_NAMES.SCHEDULED_CHECK,
        data: { monitorId: monitor.id },
      },
    );

    this.logger.log(
      `Registered scheduler '${schedulerKey}' with interval ${monitor.intervalSeconds}s`,
    );
  }

  async removeMonitorSchedule(monitorId: string): Promise<boolean> {
    const schedulerKey = this.getSchedulerKey(monitorId);
    try {
      const removed = await this.queue.removeJobScheduler(schedulerKey);
      this.logger.log(`Removed scheduler '${schedulerKey}' (success: ${removed})`);
      return removed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to remove scheduler '${schedulerKey}': ${message}`,
      );
      return false;
    }
  }

  async enqueueManualCheck(monitorId: string): Promise<{ id: string }> {
    const job = await this.queue.add(
      MONITOR_JOB_NAMES.MANUAL_CHECK,
      { monitorId, isManual: true },
      {
        priority: 1, // High priority for manual checks
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Enqueued manual check job ${job.id} for monitor ${monitorId}`);
    return { id: job.id ?? `job-${Date.now()}` };
  }

  async reconcileSchedulers(): Promise<ReconciliationResult> {
    const activeMonitors = await this.prisma.monitor.findMany({
      where: { isPaused: false },
      select: { id: true, intervalSeconds: true },
    });

    const activeMap = new Map(
      activeMonitors.map((m: { id: string; intervalSeconds: number }) => [
        m.id,
        m,
      ]),
    );
    const currentSchedulers = await this.queue.getJobSchedulers();

    let added = 0;
    let removed = 0;
    let updated = 0;

    const schedulerMap = new Map<
      string,
      (typeof currentSchedulers)[number]
    >();

    for (const sched of currentSchedulers) {
      if (sched.key && sched.key.startsWith('monitor:')) {
        const monitorId = sched.key.slice('monitor:'.length);
        schedulerMap.set(monitorId, sched);
      }
    }

    // 1. Remove orphaned or paused schedulers
    for (const [monitorId, sched] of schedulerMap.entries()) {
      if (!activeMap.has(monitorId)) {
        await this.queue.removeJobScheduler(sched.key);
        removed++;
        this.logger.log(
          `Reconciliation: removed orphan scheduler for monitor ${monitorId}`,
        );
      }
    }

    // 2. Add missing or update altered schedulers
    for (const monitor of activeMonitors) {
      const existing = schedulerMap.get(monitor.id);
      const expectedIntervalMs = monitor.intervalSeconds * 1000;

      if (!existing) {
        await this.scheduleMonitor(monitor);
        added++;
        this.logger.log(
          `Reconciliation: scheduled missing monitor ${monitor.id}`,
        );
      } else if (existing.every !== expectedIntervalMs) {
        await this.scheduleMonitor(monitor);
        updated++;
        this.logger.log(
          `Reconciliation: updated interval for monitor ${monitor.id} from ${existing.every}ms to ${expectedIntervalMs}ms`,
        );
      }
    }

    return {
      added,
      removed,
      updated,
      totalActive: activeMonitors.length,
    };
  }

  // Exposed for testing and inspection
  getQueue(): Queue {
    return this.queue;
  }
}
