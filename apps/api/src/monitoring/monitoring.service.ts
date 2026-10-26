import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckResultDto,
  HttpMethod,
  ImmediateCheckResponse,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringHttpClientService } from './http/monitoring-http-client.service';
import { SchedulerService } from './queue/scheduler.service';
import { IncidentsService } from '../incidents/incidents.service';

interface PrismaCheckResultRecord {
  id: string;
  monitorId: string;
  statusCode: number | null;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  isSeeded: boolean;
  jobId: string | null;
  checkedAt: Date;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpClient: MonitoringHttpClientService,
    private readonly schedulerService: SchedulerService,
    private readonly incidentsService: IncidentsService,
  ) {}

  /**
   * Executes a monitor check with full pre-check protection, serialized
   * row-level locking concurrency control, idempotent persistence, and atomic
   * incident evaluation.
   */
  async runMonitorCheck(
    monitorId: string,
    jobId?: string,
  ): Promise<CheckResultDto | null> {
    // 1. Pre-check: Fetch monitor and verify active state before network call
    const monitor = await this.prisma.monitor.findUnique({
      where: { id: monitorId },
    });

    if (!monitor) {
      this.logger.warn(
        `Pre-check aborted: Monitor ${monitorId} does not exist. Skipping check.`,
      );
      return null;
    }

    if (monitor.isPaused) {
      this.logger.log(
        `Pre-check aborted: Monitor ${monitorId} is paused. Skipping outbound request.`,
      );
      return null;
    }

    // 2. Idempotency pre-check: If this jobId has already been recorded, return existing result immediately
    if (jobId) {
      const existing = await this.prisma.checkResult.findUnique({
        where: { jobId },
      });
      if (existing) {
        this.logger.warn(
          `Idempotency check: CheckResult for jobId ${jobId} already exists. Returning recorded result.`,
        );
        return this.formatCheckResult(
          existing as unknown as PrismaCheckResultRecord,
        );
      }
    }

    // 3. Outbound HTTP Check with SSRF defense, connection pinning, and timeout
    const execution = await this.httpClient.executeCheck(
      monitor.url,
      monitor.method as HttpMethod,
      monitor.timeoutMs,
      monitor.expectedStatus,
    );

    const isSuccess =
      !execution.errorMessage && execution.statusCode === monitor.expectedStatus;

    // 4. Atomic Transaction with Row-Level Lock on Monitor to serialize check evaluation
    try {
      return await this.prisma.$transaction(
        async (tx: any) => {
          // Acquire exclusive row-level lock on the monitor to serialize all concurrent checks
          const lockedMonitors: {
            id: string;
            isPaused: boolean;
            expectedStatus: number;
          }[] = await tx.$queryRaw`
            SELECT id, "isPaused", "expectedStatus" FROM "monitors" WHERE id = ${monitor.id} FOR UPDATE
          `;

          if (!lockedMonitors || lockedMonitors.length === 0) {
            this.logger.warn(
              `Post-execution check aborted: Monitor ${monitorId} was deleted while check was in-flight.`,
            );
            return null;
          }

          const lockedMonitor = lockedMonitors[0];
          if (lockedMonitor.isPaused) {
            this.logger.log(
              `Post-execution check aborted: Monitor ${monitorId} was paused while check was in-flight. Skipping persistence.`,
            );
            return null;
          }

          // Re-verify jobId within transaction to guard against concurrent retry races
          if (jobId) {
            const existingJob = await tx.checkResult.findUnique({
              where: { jobId },
            });
            if (existingJob) {
              return this.formatCheckResult(
                existingJob as unknown as PrismaCheckResultRecord,
              );
            }
          }

          // Persist check result with explicit execution-start timestamp
          const created = await tx.checkResult.create({
            data: {
              monitorId: monitor.id,
              statusCode: execution.statusCode ?? null,
              latencyMs: Math.round(execution.latencyMs),
              isSuccess,
              errorMessage: execution.errorMessage ?? null,
              jobId: jobId ?? null,
              checkedAt: execution.executedAt ?? new Date(),
            },
          });

          this.logger.log(
            `Recorded check for monitor ${monitor.id}: status=${execution.statusCode ?? 'ERR'}, latency=${Math.round(execution.latencyMs)}ms, success=${isSuccess}`,
          );

          // Atomic Incident Transition Evaluation
          await this.incidentsService.evaluateIncidentTransition(
            tx,
            monitor.id,
            created,
            lockedMonitor.expectedStatus,
          );

          return this.formatCheckResult(
            created as unknown as PrismaCheckResultRecord,
          );
        },
        { timeout: 15000 },
      );
    } catch (err: unknown) {
      // Handle potential race condition on unique constraint for jobId
      const prismaError = err as { code?: string };
      if (jobId && prismaError?.code === 'P2002') {
        const existing = await this.prisma.checkResult.findUnique({
          where: { jobId },
        });
        if (existing) {
          return this.formatCheckResult(
            existing as unknown as PrismaCheckResultRecord,
          );
        }
      }
      throw err;
    }
  }

  /**
   * Enqueues an immediate manual check job, verifying monitor ownership.
   */
  async enqueueManualCheck(
    monitorId: string,
    userId: string,
  ): Promise<ImmediateCheckResponse> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor with ID '${monitorId}' not found`);
    }

    const { id: checkJobId } = await this.schedulerService.enqueueManualCheck(
      monitor.id,
    );

    return {
      message: 'Check queued successfully',
      checkJobId,
      statusUrl: `/monitors/${monitorId}/checks/latest`,
    };
  }

  /**
   * Fetches recent check results for a monitor, verifying ownership.
   */
  async getRecentChecks(
    monitorId: string,
    userId: string,
    limit = 10,
  ): Promise<CheckResultDto[]> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor with ID '${monitorId}' not found`);
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    const checks = await this.prisma.checkResult.findMany({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      take: safeLimit,
    });

    return checks.map((c: unknown) =>
      this.formatCheckResult(c as unknown as PrismaCheckResultRecord),
    );
  }

  /**
   * Fetches the latest check result for a monitor, verifying ownership.
   */
  async getLatestCheck(
    monitorId: string,
    userId: string,
  ): Promise<CheckResultDto | null> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor with ID '${monitorId}' not found`);
    }

    const latest = await this.prisma.checkResult.findFirst({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
    });

    if (!latest) {
      return null;
    }

    return this.formatCheckResult(
      latest as unknown as PrismaCheckResultRecord,
    );
  }

  private formatCheckResult(record: PrismaCheckResultRecord): CheckResultDto {
    return {
      id: record.id,
      monitorId: record.monitorId,
      statusCode: record.statusCode,
      latencyMs: record.latencyMs,
      isSuccess: record.isSuccess,
      errorMessage: record.errorMessage,
      isSeeded: record.isSeeded,
      jobId: record.jobId,
      checkedAt: record.checkedAt.toISOString(),
    };
  }
}
