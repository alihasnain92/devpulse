import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: Partial<Record<keyof NotificationsService, jest.Mock>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    authType: 'session',
  };

  beforeEach(async () => {
    service = {
      getPreferences: jest.fn().mockResolvedValue({
        userId: 'user-1',
        inAppIncidentCreated: true,
        inAppIncidentResolved: true,
        emailIncidentCreated: false,
        emailIncidentResolved: false,
      }),
      updatePreferences: jest.fn().mockResolvedValue({
        userId: 'user-1',
        inAppIncidentCreated: true,
        inAppIncidentResolved: true,
        emailIncidentCreated: true,
        emailIncidentResolved: false,
      }),
      getNotifications: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        limit: 25,
        hasMore: false,
      }),
      getUnreadCount: jest.fn().mockResolvedValue({ count: 2 }),
      markRead: jest.fn().mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        readAt: new Date().toISOString(),
      }),
      markAllRead: jest.fn().mockResolvedValue({ count: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should get preferences for current user', async () => {
    const result = await controller.getPreferences(mockUser);
    expect(result.userId).toBe('user-1');
    expect(service.getPreferences).toHaveBeenCalledWith('user-1');
  });

  it('should update preferences for current user', async () => {
    const dto = { emailIncidentCreated: true };
    const result = await controller.updatePreferences(mockUser, dto);
    expect(result.emailIncidentCreated).toBe(true);
    expect(service.updatePreferences).toHaveBeenCalledWith('user-1', dto);
  });

  it('should get notifications for current user', async () => {
    const query = { page: 1, limit: 10, status: 'all' as const };
    const result = await controller.getNotifications(mockUser, query);
    expect(result.items).toEqual([]);
    expect(service.getNotifications).toHaveBeenCalledWith('user-1', query);
  });

  it('should get unread count for current user', async () => {
    const result = await controller.getUnreadCount(mockUser);
    expect(result.count).toBe(2);
    expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
  });

  it('should mark notification read', async () => {
    const result = await controller.markRead(mockUser, 'notif-1');
    expect(result.id).toBe('notif-1');
    expect(service.markRead).toHaveBeenCalledWith('user-1', 'notif-1');
  });

  it('should mark all read', async () => {
    const result = await controller.markAllRead(mockUser);
    expect(result.count).toBe(3);
    expect(service.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
