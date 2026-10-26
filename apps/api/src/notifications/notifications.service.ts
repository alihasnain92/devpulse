import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  NOTIFICATION_EMAIL_OUTBOX_STATUS,
  NOTIFICATION_EMAIL_STATUS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_TYPE,
  NotificationDto,
  NotificationPreferenceDto,
  PaginatedNotificationsDto,
  UnreadNotificationCountDto,
  UpdateNotificationPreferenceDto,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateService } from './email/email-template.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export type PrismaTxClient = any;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  /**
   * Generates in-app notifications and email deliveries/outbox records atomically
   * within an existing database transaction for incident lifecycle events.
   *
   * Guarantees:
   * 1. Preference awareness: Respects user's in-app and email opt-in settings.
   * 2. Idempotency: Unique constraints on (userId, eventId) prevent duplicates.
   * 3. Tenant safety: All records derived from monitor ownership.
   * 4. Zero external I/O: Pure database operations within tx.
   */
  async generateNotificationsForEvent(
    tx: PrismaTxClient,
    event: {
      id: string;
      userId: string;
      type: string;
      payload: any;
    },
    monitor: {
      id: string;
      name: string;
      url?: string;
    },
  ): Promise<void> {
    if (!tx.notification || !tx.notificationEmailDelivery) {
      return;
    }

    try {
      // 1. Fetch user preferences (or fall back to defaults)
      const prefRecord = await tx.notificationPreference.findUnique({
        where: { userId: event.userId },
      });

      const preferences = prefRecord || {
        inAppIncidentCreated: NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentCreated,
        inAppIncidentResolved: NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentResolved,
        emailIncidentCreated: NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentCreated,
        emailIncidentResolved: NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentResolved,
      };

      const incidentData = event.payload?.data?.incident || {};
      const incidentId = incidentData.id || null;

      // 2. Process based on event type
      if (event.type === 'incident.created') {
        // In-app notification
        if (preferences.inAppIncidentCreated) {
          const notifId = randomUUID();
          const title = `Incident opened: ${monitor.name}`;
          const message = `Monitor "${monitor.name}" is failing: ${incidentData.cause || 'Health check failed'}`;

          await tx.$executeRaw`
            INSERT INTO "notifications" ("id", "userId", "eventId", "type", "title", "message", "incidentId", "monitorId", "createdAt")
            VALUES (${notifId}, ${event.userId}, ${event.id}, ${NOTIFICATION_TYPE.INCIDENT_CREATED}, ${title}, ${message}, ${incidentId}, ${monitor.id}, NOW())
            ON CONFLICT ("userId", "eventId") DO NOTHING
          `;
          this.logger.debug(
            `Recorded in-app notification for user ${event.userId} (event ${event.id})`,
          );
        }

        // Email notification
        if (preferences.emailIncidentCreated) {
          const user = await tx.user.findUnique({
            where: { id: event.userId },
            select: { email: true },
          });

          if (user?.email) {
            const rendered = this.emailTemplateService.renderIncidentCreatedEmail({
              monitorName: monitor.name,
              monitorId: monitor.id,
              monitorUrl: monitor.url,
              incidentId: incidentId || '',
              cause: incidentData.cause || 'Health check failed',
              startedAt: incidentData.startedAt || new Date(),
            });

            const deliveryId = randomUUID();
            await tx.$executeRaw`
              INSERT INTO "notification_email_deliveries" ("id", "userId", "eventId", "toEmail", "subject", "bodyText", "bodyHtml", "status", "attemptCount", "createdAt", "updatedAt")
              VALUES (${deliveryId}, ${event.userId}, ${event.id}, ${user.email}, ${rendered.subject}, ${rendered.text}, ${rendered.html}, ${NOTIFICATION_EMAIL_STATUS.PENDING}, 0, NOW(), NOW())
              ON CONFLICT ("userId", "eventId") DO NOTHING
            `;

            const delivery = await tx.notificationEmailDelivery.findUnique({
              where: {
                userId_eventId: {
                  userId: event.userId,
                  eventId: event.id,
                },
              },
            });

            if (delivery) {
              const outboxId = randomUUID();
              await tx.$executeRaw`
                INSERT INTO "notification_email_outbox" ("id", "deliveryId", "status", "attemptCount", "availableAt", "createdAt", "updatedAt")
                VALUES (${outboxId}, ${delivery.id}, ${NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING}, 0, NOW(), NOW(), NOW())
                ON CONFLICT ("deliveryId") DO NOTHING
              `;
            }

            this.logger.debug(
              `Recorded email delivery and outbox for user ${event.userId}`,
            );
          }
        }
      } else if (event.type === 'incident.resolved') {
        // In-app notification
        if (preferences.inAppIncidentResolved) {
          const notifId = randomUUID();
          const title = `Incident resolved: ${monitor.name}`;
          const message = `Monitor "${monitor.name}" has recovered.`;

          await tx.$executeRaw`
            INSERT INTO "notifications" ("id", "userId", "eventId", "type", "title", "message", "incidentId", "monitorId", "createdAt")
            VALUES (${notifId}, ${event.userId}, ${event.id}, ${NOTIFICATION_TYPE.INCIDENT_RESOLVED}, ${title}, ${message}, ${incidentId}, ${monitor.id}, NOW())
            ON CONFLICT ("userId", "eventId") DO NOTHING
          `;
          this.logger.debug(
            `Recorded in-app notification for resolved incident for user ${event.userId}`,
          );
        }

        // Email notification
        if (preferences.emailIncidentResolved) {
          const user = await tx.user.findUnique({
            where: { id: event.userId },
            select: { email: true },
          });

          if (user?.email) {
            const rendered = this.emailTemplateService.renderIncidentResolvedEmail({
              monitorName: monitor.name,
              monitorId: monitor.id,
              monitorUrl: monitor.url,
              incidentId: incidentId || '',
              cause: incidentData.cause,
              startedAt: incidentData.startedAt || new Date(),
              resolvedAt: incidentData.resolvedAt || new Date(),
            });

            const deliveryId = randomUUID();
            await tx.$executeRaw`
              INSERT INTO "notification_email_deliveries" ("id", "userId", "eventId", "toEmail", "subject", "bodyText", "bodyHtml", "status", "attemptCount", "createdAt", "updatedAt")
              VALUES (${deliveryId}, ${event.userId}, ${event.id}, ${user.email}, ${rendered.subject}, ${rendered.text}, ${rendered.html}, ${NOTIFICATION_EMAIL_STATUS.PENDING}, 0, NOW(), NOW())
              ON CONFLICT ("userId", "eventId") DO NOTHING
            `;

            const delivery = await tx.notificationEmailDelivery.findUnique({
              where: {
                userId_eventId: {
                  userId: event.userId,
                  eventId: event.id,
                },
              },
            });

            if (delivery) {
              const outboxId = randomUUID();
              await tx.$executeRaw`
                INSERT INTO "notification_email_outbox" ("id", "deliveryId", "status", "attemptCount", "availableAt", "createdAt", "updatedAt")
                VALUES (${outboxId}, ${delivery.id}, ${NOTIFICATION_EMAIL_OUTBOX_STATUS.PENDING}, 0, NOW(), NOW(), NOW())
                ON CONFLICT ("deliveryId") DO NOTHING
              `;
            }

            this.logger.debug(
              `Recorded resolved email delivery and outbox for user ${event.userId}`,
            );
          }
        }
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to generate notifications for event ${event.id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Retrieves notification preferences for a user, initializing defaults if none exist.
   */
  async getPreferences(userId: string): Promise<NotificationPreferenceDto> {
    let pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await this.prisma.notificationPreference.create({
        data: {
          userId,
          inAppIncidentCreated: NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentCreated,
          inAppIncidentResolved: NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentResolved,
          emailIncidentCreated: NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentCreated,
          emailIncidentResolved: NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentResolved,
        },
      });
    }

    return {
      userId: pref.userId,
      inAppIncidentCreated: pref.inAppIncidentCreated,
      inAppIncidentResolved: pref.inAppIncidentResolved,
      emailIncidentCreated: pref.emailIncidentCreated,
      emailIncidentResolved: pref.emailIncidentResolved,
      createdAt: pref.createdAt.toISOString(),
      updatedAt: pref.updatedAt.toISOString(),
    };
  }

  /**
   * Updates notification preferences for a user.
   */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    const updated = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        inAppIncidentCreated:
          dto.inAppIncidentCreated ?? NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentCreated,
        inAppIncidentResolved:
          dto.inAppIncidentResolved ?? NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentResolved,
        emailIncidentCreated:
          dto.emailIncidentCreated ?? NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentCreated,
        emailIncidentResolved:
          dto.emailIncidentResolved ?? NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentResolved,
      },
      update: {
        ...(dto.inAppIncidentCreated !== undefined
          ? { inAppIncidentCreated: dto.inAppIncidentCreated }
          : {}),
        ...(dto.inAppIncidentResolved !== undefined
          ? { inAppIncidentResolved: dto.inAppIncidentResolved }
          : {}),
        ...(dto.emailIncidentCreated !== undefined
          ? { emailIncidentCreated: dto.emailIncidentCreated }
          : {}),
        ...(dto.emailIncidentResolved !== undefined
          ? { emailIncidentResolved: dto.emailIncidentResolved }
          : {}),
      },
    });

    return {
      userId: updated.userId,
      inAppIncidentCreated: updated.inAppIncidentCreated,
      inAppIncidentResolved: updated.inAppIncidentResolved,
      emailIncidentCreated: updated.emailIncidentCreated,
      emailIncidentResolved: updated.emailIncidentResolved,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Returns a paginated list of notifications for a user with unread count.
   */
  async getNotifications(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<PaginatedNotificationsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 25), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
      ...(query.status === 'read'
        ? { readAt: { not: null } }
        : query.status === 'unread'
          ? { readAt: null }
          : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        eventId: item.eventId,
        type: item.type,
        title: item.title,
        message: item.message,
        incidentId: item.incidentId,
        monitorId: item.monitorId,
        readAt: item.readAt ? item.readAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      unreadCount,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Retrieves current unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<UnreadNotificationCountDto> {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
    return { count };
  }

  /**
   * Marks a specific notification as read, enforcing user ownership.
   */
  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(
        `Notification with ID '${notificationId}' not found`,
      );
    }

    if (!notification.readAt) {
      const updated = await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
      return {
        id: updated.id,
        userId: updated.userId,
        eventId: updated.eventId,
        type: updated.type,
        title: updated.title,
        message: updated.message,
        incidentId: updated.incidentId,
        monitorId: updated.monitorId,
        readAt: updated.readAt ? updated.readAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      };
    }

    return {
      id: notification.id,
      userId: notification.userId,
      eventId: notification.eventId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      incidentId: notification.incidentId,
      monitorId: notification.monitorId,
      readAt: notification.readAt.toISOString(),
      createdAt: notification.createdAt.toISOString(),
    };
  }

  /**
   * Marks all unread notifications as read for a user.
   */
  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }
}
