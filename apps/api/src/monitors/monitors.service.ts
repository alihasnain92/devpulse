import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { HttpMethod, MONITOR_LIMITS, MonitorDto } from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../monitoring/queue/scheduler.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';

interface PrismaMonitorRecord {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatus: number;
  isPaused: boolean;
  isSeeded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MonitorsService {
  private readonly logger = new Logger(MonitorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(userId: string, dto: CreateMonitorDto): Promise<MonitorDto> {
    const monitor = await this.prisma.monitor.create({
      data: {
        userId,
        name: dto.name,
        url: dto.url,
        method: dto.method ?? HttpMethod.GET,
        intervalSeconds:
          dto.intervalSeconds ?? MONITOR_LIMITS.DEFAULT_INTERVAL_SECONDS,
        timeoutMs: dto.timeoutMs ?? MONITOR_LIMITS.DEFAULT_TIMEOUT_MS,
        expectedStatus:
          dto.expectedStatus ?? MONITOR_LIMITS.DEFAULT_EXPECTED_STATUS,
      },
    });

    this.logger.log(`Created monitor ${monitor.id} for user ${userId}`);

    // Register recurring BullMQ check schedule if monitor is not paused
    if (!monitor.isPaused) {
      try {
        await this.schedulerService.scheduleMonitor({
          id: monitor.id,
          intervalSeconds: monitor.intervalSeconds,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to register BullMQ scheduler for new monitor ${monitor.id}: ${message}`,
        );
      }
    }

    return this.formatMonitor(monitor as unknown as PrismaMonitorRecord);
  }

  async findAll(userId: string): Promise<MonitorDto[]> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return monitors.map((m: unknown) =>
      this.formatMonitor(m as unknown as PrismaMonitorRecord),
    );
  }

  async findOne(id: string, userId: string): Promise<MonitorDto> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor with ID '${id}' not found`);
    }

    return this.formatMonitor(monitor as unknown as PrismaMonitorRecord);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateMonitorDto,
  ): Promise<MonitorDto> {
    const existing = await this.prisma.monitor.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`Monitor with ID '${id}' not found`);
    }

    const updated = await this.prisma.monitor.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.method !== undefined && { method: dto.method }),
        ...(dto.intervalSeconds !== undefined && {
          intervalSeconds: dto.intervalSeconds,
        }),
        ...(dto.timeoutMs !== undefined && { timeoutMs: dto.timeoutMs }),
        ...(dto.expectedStatus !== undefined && {
          expectedStatus: dto.expectedStatus,
        }),
        ...(dto.isPaused !== undefined && { isPaused: dto.isPaused }),
      },
    });

    this.logger.log(`Updated monitor ${id} for user ${userId}`);

    // Update BullMQ scheduler based on state changes
    try {
      if (updated.isPaused) {
        // Paused: remove recurring schedule
        await this.schedulerService.removeMonitorSchedule(updated.id);
      } else if (
        existing.isPaused ||
        existing.intervalSeconds !== updated.intervalSeconds
      ) {
        // Resumed or interval changed: upsert schedule with new interval
        await this.schedulerService.scheduleMonitor({
          id: updated.id,
          intervalSeconds: updated.intervalSeconds,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to update BullMQ scheduler for monitor ${updated.id}: ${message}`,
      );
    }

    return this.formatMonitor(updated as unknown as PrismaMonitorRecord);
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    const existing = await this.prisma.monitor.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`Monitor with ID '${id}' not found`);
    }

    // Remove BullMQ scheduler
    try {
      await this.schedulerService.removeMonitorSchedule(existing.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to remove BullMQ scheduler for monitor ${existing.id}: ${message}`,
      );
    }

    await this.prisma.monitor.delete({
      where: { id: existing.id },
    });

    this.logger.log(`Deleted monitor ${id} for user ${userId}`);
    return { message: 'Monitor deleted successfully' };
  }

  private formatMonitor(record: PrismaMonitorRecord): MonitorDto {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      url: record.url,
      method: record.method as HttpMethod,
      intervalSeconds: record.intervalSeconds,
      timeoutMs: record.timeoutMs,
      expectedStatus: record.expectedStatus,
      isPaused: record.isPaused,
      isSeeded: record.isSeeded,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
