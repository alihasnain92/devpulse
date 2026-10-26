import { NotFoundException } from '@nestjs/common';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@devpulse/shared';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: any;
  let mockEmailTemplateService: any;

  beforeEach(() => {
    mockPrisma = {
      notificationPreference: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      notificationEmailDelivery: {
        create: jest.fn(),
      },
      notificationEmailOutbox: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    mockEmailTemplateService = {
      renderIncidentCreatedEmail: jest.fn().mockReturnValue({
        subject: '[Incident Opened] API is down',
        text: 'Text',
        html: '<p>Html</p>',
      }),
      renderIncidentResolvedEmail: jest.fn().mockReturnValue({
        subject: '[Incident Resolved] API has recovered',
        text: 'Text',
        html: '<p>Html</p>',
      }),
    };

    service = new NotificationsService(mockPrisma, mockEmailTemplateService);
  });

  describe('generateNotificationsForEvent', () => {
    it('should generate in-app notification when inAppIncidentCreated is true', async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        notification: {},
        notificationEmailDelivery: {
          findUnique: jest.fn(),
        },
        notificationPreference: {
          findUnique: jest.fn().mockResolvedValue({
            inAppIncidentCreated: true,
            emailIncidentCreated: false,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
      };

      const event = {
        id: 'evt-1',
        userId: 'user-1',
        type: 'incident.created',
        payload: {
          data: {
            incident: {
              id: 'inc-1',
              cause: 'HTTP 500 error',
            },
          },
        },
      };

      const monitor = {
        id: 'mon-1',
        name: 'Production API',
      };

      await service.generateNotificationsForEvent(mockTx, event, monitor);

      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('should generate email delivery and outbox when emailIncidentCreated is true', async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        notification: {},
        notificationEmailDelivery: {
          findUnique: jest.fn().mockResolvedValue({ id: 'del-1' }),
        },
        notificationPreference: {
          findUnique: jest.fn().mockResolvedValue({
            inAppIncidentCreated: false,
            emailIncidentCreated: true,
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }),
        },
      };

      const event = {
        id: 'evt-2',
        userId: 'user-2',
        type: 'incident.created',
        payload: {
          data: {
            incident: {
              id: 'inc-2',
              cause: 'Connection timeout',
            },
          },
        },
      };

      const monitor = {
        id: 'mon-2',
        name: 'Auth Service',
      };

      await service.generateNotificationsForEvent(mockTx, event, monitor);

      expect(mockEmailTemplateService.renderIncidentCreatedEmail).toHaveBeenCalled();
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('should execute ON CONFLICT DO NOTHING for idempotent event handling', async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        notification: {},
        notificationEmailDelivery: {},
        notificationPreference: {
          findUnique: jest.fn().mockResolvedValue({
            inAppIncidentCreated: true,
            emailIncidentCreated: false,
          }),
        },
      };

      const event = {
        id: 'evt-3',
        userId: 'user-3',
        type: 'incident.created',
        payload: {},
      };

      await service.generateNotificationsForEvent(mockTx, event, {
        id: 'm-3',
        name: 'DB',
      });

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPreferences & updatePreferences', () => {
    it('should create default preferences if none exist', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notificationPreference.create.mockResolvedValue({
        userId: 'user-1',
        ...NOTIFICATION_PREFERENCE_DEFAULTS,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getPreferences('user-1');
      expect(result.inAppIncidentCreated).toBe(true);
      expect(result.emailIncidentCreated).toBe(false);
      expect(mockPrisma.notificationPreference.create).toHaveBeenCalled();
    });

    it('should update preferences via upsert', async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue({
        userId: 'user-1',
        inAppIncidentCreated: true,
        inAppIncidentResolved: true,
        emailIncidentCreated: true,
        emailIncidentResolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updatePreferences('user-1', {
        emailIncidentCreated: true,
      });

      expect(result.emailIncidentCreated).toBe(true);
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalled();
    });
  });

  describe('getNotifications & unread count', () => {
    it('should return paginated notifications and total unread count', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'n-1',
          userId: 'user-1',
          eventId: 'e-1',
          type: 'INCIDENT_CREATED',
          title: 'Title',
          message: 'Msg',
          incidentId: 'inc-1',
          monitorId: 'mon-1',
          readAt: null,
          createdAt: new Date(),
        },
      ]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // unreadCount

      const result = await service.getNotifications('user-1', { page: 1, limit: 10 });
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
    });

    it('should return unread count for user', async () => {
      mockPrisma.notification.count.mockResolvedValue(3);
      const result = await service.getUnreadCount('user-1');
      expect(result.count).toBe(3);
    });
  });

  describe('markRead & markAllRead', () => {
    it('should throw NotFoundException if notification does not exist or user mismatch', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);
      await expect(service.markRead('user-1', 'n-missing')).rejects.toThrow(
        NotFoundException,
      );

      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 'n-other',
        userId: 'other-user',
      });
      await expect(service.markRead('user-1', 'n-other')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update readAt for unread notification', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 'n-1',
        userId: 'user-1',
        eventId: 'e-1',
        type: 'INCIDENT_CREATED',
        title: 'Title',
        message: 'Msg',
        incidentId: null,
        monitorId: null,
        readAt: null,
        createdAt: new Date(),
      });
      mockPrisma.notification.update.mockResolvedValue({
        id: 'n-1',
        userId: 'user-1',
        eventId: 'e-1',
        type: 'INCIDENT_CREATED',
        title: 'Title',
        message: 'Msg',
        incidentId: null,
        monitorId: null,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.markRead('user-1', 'n-1');
      expect(result.readAt).not.toBeNull();
      expect(mockPrisma.notification.update).toHaveBeenCalled();
    });

    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });
      const result = await service.markAllRead('user-1');
      expect(result.count).toBe(5);
    });
  });
});
