import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentDto,
  MONITOR_LIMITS,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';

interface PrismaIncidentRecord {
  id: string;
  monitorId: string;
  startedAt: Date;
  resolvedAt: Date | null;
  cause: string;
  isResolved: boolean;
  isSeeded: boolean;
  monitor?: {
    id: string;
    name: string;
    userId?: string;
  };
}

export interface IncidentFilterOptions {
  status?: 'active' | 'resolved' | 'all';
  limit?: number;
  offset?: number;
}

export interface PrismaTxClient {
  incident: any;
  checkResult: any;
  monitor: any;
  webhookEvent?: any;
  webhookOutbox?: any;
  $queryRaw: (query: any, ...values: any[]) => Promise<any>;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates monitor check outcome and atomically transitions incident state.
   * Executed within a transactional row lock to guarantee serialized evaluation.
   *
   * Rules:
   * 1. Three consecutive failures open exactly one incident.
   * 2. Further failures while an incident is open do not create duplicate incidents.
   * 3. A successful check resolves an active incident (if checkedAt >= incident.startedAt).
   * 4. A successful check when no incident is open does not create an incident.
   * 5. Sanitized cause captures failure reasons without exposing sensitive data.
   */
  async evaluateIncidentTransition(
    tx: PrismaTxClient,
    monitorId: string,
    checkResult: {
      id: string;
      isSuccess: boolean;
      statusCode: number | null;
      errorMessage: string | null;
      checkedAt: Date;
      isSeeded?: boolean;
    },
    expectedStatus = 200,
  ): Promise<IncidentDto | null> {
    // 1. Success Path: Check resolves an active incident if present
    if (checkResult.isSuccess) {
      const openIncident = await tx.incident.findFirst({
        where: { monitorId, isResolved: false },
      });

      if (openIncident) {
        // Enforce ordering policy: A stale check timestamped prior to incident start cannot resolve it
        if (checkResult.checkedAt >= openIncident.startedAt) {
          const resolved = await tx.incident.update({
            where: { id: openIncident.id },
            data: {
              isResolved: true,
              resolvedAt: checkResult.checkedAt,
            },
          });

          // Fetch monitor to attach tenant details to webhook event
          const monitor = tx.monitor?.findUnique
            ? await tx.monitor.findUnique({
                where: { id: monitorId },
                select: { id: true, name: true, userId: true },
              })
            : null;

          if (monitor) {
            await this.recordWebhookEventAndOutbox(
              tx,
              monitor.userId,
              'incident.resolved',
              openIncident.id,
              `incident.resolved:${openIncident.id}`,
              {
                id: `evt_inc_res_${openIncident.id}`,
                type: 'incident.resolved',
                createdAt: new Date().toISOString(),
                data: {
                  incident: {
                    id: openIncident.id,
                    monitorId: monitor.id,
                    monitorName: monitor.name,
                    startedAt: openIncident.startedAt.toISOString(),
                    resolvedAt: checkResult.checkedAt.toISOString(),
                    cause: openIncident.cause,
                  },
                },
              },
            );
          }

          this.logger.log(
            `Incident ${openIncident.id} for monitor ${monitorId} resolved by check ${checkResult.id} at ${checkResult.checkedAt.toISOString()}`,
          );

          return this.formatIncident(
            resolved as unknown as PrismaIncidentRecord,
          );
        } else {
          this.logger.warn(
            `Ignoring obsolete recovery check ${checkResult.id} for monitor ${monitorId}: checkedAt (${checkResult.checkedAt.toISOString()}) is older than incident start (${openIncident.startedAt.toISOString()}).`,
          );
        }
      }

      // Successful check with no active incident creates no incident
      return null;
    }

    // 2. Failure Path: Evaluate consecutive failure threshold
    const openIncident = await tx.incident.findFirst({
      where: { monitorId, isResolved: false },
    });

    if (openIncident) {
      // Incident already active: subsequent failures do not open duplicate incidents
      return this.formatIncident(
        openIncident as unknown as PrismaIncidentRecord,
      );
    }

    // Find the boundary of the most recent resolved incident (if any)
    const lastResolved = await tx.incident.findFirst({
      where: { monitorId, isResolved: true },
      orderBy: { resolvedAt: 'desc' },
    });

    // Query the latest N check results to evaluate streak
    const recentChecks = await tx.checkResult.findMany({
      where: {
        monitorId,
        ...(lastResolved?.resolvedAt
          ? { checkedAt: { gt: lastResolved.resolvedAt } }
          : {}),
      },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      take: MONITOR_LIMITS.CONSECUTIVE_FAILURES_FOR_INCIDENT,
    });

    const isThresholdReached =
      recentChecks.length === MONITOR_LIMITS.CONSECUTIVE_FAILURES_FOR_INCIDENT &&
      recentChecks.every((c: { isSuccess: boolean }) => !c.isSuccess);

    if (isThresholdReached) {
      // Outage began at the first failure of this consecutive streak
      const startedAt = recentChecks[recentChecks.length - 1].checkedAt;
      const sanitizedCause = this.sanitizeCause(
        checkResult.errorMessage,
        checkResult.statusCode,
        expectedStatus,
      );

      try {
        const created = await tx.incident.create({
          data: {
            monitorId,
            startedAt,
            isResolved: false,
            resolvedAt: null,
            cause: sanitizedCause,
            isSeeded: checkResult.isSeeded ?? false,
          },
        });

        // Fetch monitor to attach tenant details to webhook event
        const monitor = tx.monitor?.findUnique
          ? await tx.monitor.findUnique({
              where: { id: monitorId },
              select: { id: true, name: true, userId: true },
            })
          : null;

        if (monitor) {
          await this.recordWebhookEventAndOutbox(
            tx,
            monitor.userId,
            'incident.created',
            created.id,
            `incident.created:${created.id}`,
            {
              id: `evt_inc_crt_${created.id}`,
              type: 'incident.created',
              createdAt: new Date().toISOString(),
              data: {
                incident: {
                  id: created.id,
                  monitorId: monitor.id,
                  monitorName: monitor.name,
                  startedAt: created.startedAt.toISOString(),
                  resolvedAt: null,
                  cause: created.cause,
                },
              },
            },
          );
        }

        this.logger.warn(
          `Opened incident ${created.id} for monitor ${monitorId} after ${MONITOR_LIMITS.CONSECUTIVE_FAILURES_FOR_INCIDENT} consecutive failures: ${sanitizedCause}`,
        );

        return this.formatIncident(
          created as unknown as PrismaIncidentRecord,
        );
      } catch (err: unknown) {
        // Handle partial unique index constraint collision safely
        const prismaErr = err as { code?: string };
        if (prismaErr?.code === 'P2002') {
          this.logger.warn(
            `Duplicate open incident for monitor ${monitorId} prevented by partial unique index (P2002).`,
          );
          const existing = await tx.incident.findFirst({
            where: { monitorId, isResolved: false },
          });
          return existing
            ? this.formatIncident(existing as unknown as PrismaIncidentRecord)
            : null;
        }
        throw err;
      }
    }

    // Under threshold (1 or 2 failures): no incident
    return null;
  }

  /**
   * Sanitizes incident failure causes to guarantee no credentials, tokens,
   * full request headers, or sensitive response bodies are stored.
   */
  sanitizeCause(
    errorMessage: string | null | undefined,
    statusCode: number | null | undefined,
    expectedStatus = 200,
  ): string {
    if (statusCode && statusCode !== expectedStatus) {
      return `HTTP ${statusCode} response received (Expected ${expectedStatus})`;
    }

    if (errorMessage) {
      let cleaned = errorMessage
        .replace(/https?:\/\/[^@]+@/gi, 'http://[REDACTED]@')
        .replace(/bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
        .replace(/devpulse_[a-zA-Z0-9_]+/gi, '[REDACTED_COOKIE]')
        .replace(/eyJ[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*/g, '[REDACTED_JWT]')
        .replace(/token[=:][\s]*[^\s,;&]+/gi, 'token=[REDACTED]');

      if (cleaned.length > 250) {
        cleaned = cleaned.slice(0, 250) + '...';
      }
      return cleaned;
    }

    return `Health check failed to return expected HTTP ${expectedStatus}`;
  }

  /**
   * Lists all incidents belonging to monitors owned by the authenticated user.
   */
  async findAllForUser(
    userId: string,
    options?: IncidentFilterOptions,
  ): Promise<IncidentDto[]> {
    const userMonitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    if (userMonitors.length === 0) {
      return [];
    }

    const monitorIds = userMonitors.map((m: { id: string }) => m.id);
    const monitorMap = new Map<string, string>(
      userMonitors.map((m: { id: string; name: string }) => [m.id, m.name]),
    );

    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const offset = Math.max(0, options?.offset ?? 0);

    const whereClause: any = {
      monitorId: { in: monitorIds },
      ...(options?.status === 'active'
        ? { isResolved: false }
        : options?.status === 'resolved'
          ? { isResolved: true }
          : {}),
    };

    const incidents = await this.prisma.incident.findMany({
      where: whereClause,
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return incidents.map((inc: any) =>
      this.formatIncident(
        inc as unknown as PrismaIncidentRecord,
        monitorMap.get(inc.monitorId),
      ),
    );
  }

  /**
   * Lists all incidents for a specific monitor, enforcing user ownership.
   */
  async findAllForMonitor(
    monitorId: string,
    userId: string,
    options?: IncidentFilterOptions,
  ): Promise<IncidentDto[]> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true, name: true },
    });

    if (!monitor) {
      throw new NotFoundException(`Monitor with ID '${monitorId}' not found`);
    }

    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const offset = Math.max(0, options?.offset ?? 0);

    const whereClause: any = {
      monitorId,
      ...(options?.status === 'active'
        ? { isResolved: false }
        : options?.status === 'resolved'
          ? { isResolved: true }
          : {}),
    };

    const incidents = await this.prisma.incident.findMany({
      where: whereClause,
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return incidents.map((inc: any) =>
      this.formatIncident(
        inc as unknown as PrismaIncidentRecord,
        monitor.name,
      ),
    );
  }

  /**
   * Retrieves a single incident by ID, enforcing user ownership of the parent monitor.
   */
  async findOne(id: string, userId: string): Promise<IncidentDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        monitor: {
          select: { id: true, name: true, userId: true },
        },
      },
    });

    if (!incident || incident.monitor.userId !== userId) {
      throw new NotFoundException(`Incident with ID '${id}' not found`);
    }

    return this.formatIncident(
      incident as unknown as PrismaIncidentRecord,
      incident.monitor.name,
    );
  }

  formatIncident(
    record: PrismaIncidentRecord,
    monitorName?: string,
  ): IncidentDto {
    const isResolved = record.isResolved;
    const startedAt = new Date(record.startedAt);
    const resolvedAt = record.resolvedAt ? new Date(record.resolvedAt) : null;

    let durationMs = 0;
    if (isResolved && resolvedAt) {
      durationMs = Math.max(0, resolvedAt.getTime() - startedAt.getTime());
    } else {
      durationMs = Math.max(0, Date.now() - startedAt.getTime());
    }

    return {
      id: record.id,
      monitorId: record.monitorId,
      monitorName,
      state: isResolved ? 'resolved' : 'ongoing',
      startedAt: startedAt.toISOString(),
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
      durationMs,
      durationSeconds: Math.round(durationMs / 1000),
      cause: record.cause,
      isResolved,
      isSeeded: record.isSeeded,
    };
  }

  /**
   * Records a durable WebhookEvent and transactional WebhookOutbox row
   * atomically within the caller's active database transaction.
   *
   * Idempotency & Tenant Safety:
   * 1. dedupeKey uniqueness (e.g. incident.created:<incidentId>) guarantees
   *    concurrent or retried incident checks cannot create duplicate events.
   * 2. userId is strictly derived from the monitor's owner to prevent cross-tenant leaks.
   * 3. Completely executed inside PostgreSQL with zero Redis or HTTP calls.
   */
  private async recordWebhookEventAndOutbox(
    tx: PrismaTxClient,
    userId: string,
    type: 'incident.created' | 'incident.resolved',
    sourceId: string,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!tx.webhookEvent || !tx.webhookOutbox) {
      return;
    }

    try {
      const event = await tx.webhookEvent.create({
        data: {
          userId,
          type,
          sourceType: 'incident',
          sourceId,
          dedupeKey,
          payload,
        },
      });

      await tx.webhookOutbox.create({
        data: {
          eventId: event.id,
          status: 'PENDING',
          availableAt: new Date(),
        },
      });

      this.logger.log(
        `Recorded WebhookEvent ${event.id} (${type}) and Outbox record for user ${userId}`,
      );
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === 'P2002') {
        this.logger.warn(
          `Duplicate WebhookEvent prevented by dedupeKey '${dedupeKey}' (P2002).`,
        );
        return;
      }
      this.logger.error(
        `Failed to record WebhookEvent for incident transition: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
