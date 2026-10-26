import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  API_KEY_CONFIG,
  AUTH_COOKIES,
  DEMO_CONFIG,
  NOTIFICATION_EMAIL_STATUS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  SECURITY_CONFIG,
} from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationEmailPublisherService } from './outbox/notification-email-publisher.service';
import { NotificationEmailWorkerService } from './queue/notification-email-worker.service';

describe('Notifications Management & Delivery API (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let _publisherService: NotificationEmailPublisherService;
  let workerService: NotificationEmailWorkerService;

  const testSuffix = Date.now();
  const userA = {
    email: `notif-user-a-${testSuffix}@devpulse.dev`,
    name: 'Notification User A',
    password: 'Password123!',
  };

  const userB = {
    email: `notif-user-b-${testSuffix}@devpulse.dev`,
    name: 'Notification User B',
    password: 'Password123!',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let _userBId: string;
  let readApiKey: string;
  let writeApiKey: string;
  let testMonitorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    notificationsService = app.get<NotificationsService>(NotificationsService);
    _publisherService = app.get<NotificationEmailPublisherService>(
      NotificationEmailPublisherService,
    );
    workerService = app.get<NotificationEmailWorkerService>(
      NotificationEmailWorkerService,
    );

    // Register User A
    const resA = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userA);
    expect(resA.status).toBe(201);
    userAId = resA.body.user.id;
    const cookiesA = resA.headers['set-cookie'];
    const accessCookieA = cookiesA.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userACookie = accessCookieA.split(';')[0];

    // Register User B
    const resB = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userB);
    expect(resB.status).toBe(201);
    _userBId = resB.body.user.id;
    const cookiesB = resB.headers['set-cookie'];
    const accessCookieB = cookiesB.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userBCookie = accessCookieB.split(';')[0];

    // Create a monitor for User A
    const monitor = await prisma.monitor.create({
      data: {
        userId: userAId,
        name: 'Notifications Test Monitor',
        url: 'https://example.com/health',
        method: 'GET',
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatus: 200,
      },
    });
    testMonitorId = monitor.id;

    // Create API Keys for User A
    const keyReadRes = await request(app.getHttpServer())
      .post('/api-keys')
      .set(CSRF_HEADERS)
      .set('Cookie', userACookie)
      .send({
        name: 'Read Only Key',
        scopes: ['notifications:read'],
      });
    expect(keyReadRes.status).toBe(201);
    readApiKey = keyReadRes.body.rawKey;

    const keyWriteRes = await request(app.getHttpServer())
      .post('/api-keys')
      .set(CSRF_HEADERS)
      .set('Cookie', userACookie)
      .send({
        name: 'Write Only Key',
        scopes: ['notifications:write'],
      });
    expect(keyWriteRes.status).toBe(201);
    writeApiKey = keyWriteRes.body.rawKey;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: 'notif-user-',
          },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('1. Notification Preferences API', () => {
    it('GET /notifications/preferences returns safe default preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userAId);
      expect(res.body.inAppIncidentCreated).toBe(NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentCreated);
      expect(res.body.inAppIncidentResolved).toBe(NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentResolved);
      expect(res.body.emailIncidentCreated).toBe(NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentCreated);
      expect(res.body.emailIncidentResolved).toBe(NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentResolved);
    });

    it('PATCH /notifications/preferences updates preferences', async () => {
      const res = await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({
          emailIncidentCreated: true,
          emailIncidentResolved: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.emailIncidentCreated).toBe(true);
      expect(res.body.emailIncidentResolved).toBe(true);
      expect(res.body.inAppIncidentCreated).toBe(true);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get('/notifications/preferences');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Event-driven Notification Generation & Deduplication', () => {
    let createdNotificationId: string;

    it('generates in-app and email notifications atomically within transaction', async () => {
      // Create a WebhookEvent in DB
      const event = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: 'inc-test-1',
          dedupeKey: `incident.created:inc-test-1`,
          payload: {
            id: 'evt_test_1',
            type: 'incident.created',
            createdAt: new Date().toISOString(),
            data: {
              incident: {
                id: 'inc-test-1',
                monitorId: testMonitorId,
                monitorName: 'Notifications Test Monitor',
                startedAt: new Date().toISOString(),
                resolvedAt: null,
                cause: 'HTTP 503 Service Unavailable',
              },
            },
          },
        },
      });

      // Invoke generateNotificationsForEvent within a transaction
      await prisma.$transaction(async (tx) => {
        await notificationsService.generateNotificationsForEvent(
          tx,
          event,
          {
            id: testMonitorId,
            name: 'Notifications Test Monitor',
            url: 'https://example.com/health',
          },
        );
      });

      // Verify in-app notification in DB
      const notification = await prisma.notification.findFirst({
        where: { userId: userAId, eventId: event.id },
      });
      expect(notification).not.toBeNull();
      expect(notification?.title).toContain('Incident opened');
      expect(notification?.readAt).toBeNull();
      createdNotificationId = notification!.id;

      // Verify email delivery and outbox in DB (since emailIncidentCreated was enabled)
      const delivery = await prisma.notificationEmailDelivery.findFirst({
        where: { userId: userAId, eventId: event.id },
      });
      expect(delivery).not.toBeNull();
      expect(delivery?.toEmail).toBe(userA.email);
      expect(delivery?.status).toBe(NOTIFICATION_EMAIL_STATUS.PENDING);

      const outbox = await prisma.notificationEmailOutbox.findFirst({
        where: { deliveryId: delivery!.id },
      });
      expect(outbox).not.toBeNull();
    });

    it('deduplicates duplicate event processing idempotently', async () => {
      const event = await prisma.webhookEvent.findFirst({
        where: { dedupeKey: 'incident.created:inc-test-1' },
      });
      expect(event).not.toBeNull();

      // Attempt to re-run generation for the same event
      await prisma.$transaction(async (tx) => {
        await notificationsService.generateNotificationsForEvent(
          tx,
          event!,
          {
            id: testMonitorId,
            name: 'Notifications Test Monitor',
          },
        );
      });

      // Count notifications for this event — must remain exactly 1
      const count = await prisma.notification.count({
        where: { userId: userAId, eventId: event!.id },
      });
      expect(count).toBe(1);

      // Email deliveries must also remain exactly 1
      const emailCount = await prisma.notificationEmailDelivery.count({
        where: { userId: userAId, eventId: event!.id },
      });
      expect(emailCount).toBe(1);
    });

    it('GET /notifications lists user notifications with pagination and unreadCount', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications?status=all')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].id).toBe(createdNotificationId);
    });

    it('GET /notifications/unread-count returns accurate count', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Notification Read State & Tenant Isolation', () => {
    let notifId: string;

    beforeAll(async () => {
      const notif = await prisma.notification.findFirst({
        where: { userId: userAId },
      });
      notifId = notif!.id;
    });

    it('User B cannot see User A notifications (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.unreadCount).toBe(0);
    });

    it('User B cannot mark User A notification as read (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/notifications/${notifId}/read`)
        .set(CSRF_HEADERS)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(404);
    });

    it('User A can mark their notification as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/notifications/${notifId}/read`)
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.readAt).not.toBeNull();

      // Check unread count is updated
      const countRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Cookie', userACookie);

      expect(countRes.status).toBe(200);
      expect(countRes.body.count).toBe(0);
    });

    it('POST /notifications/read-all marks all unread notifications read', async () => {
      // Create another notification for User A
      const event2 = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.resolved',
          sourceType: 'incident',
          sourceId: 'inc-test-2',
          dedupeKey: `incident.resolved:inc-test-2`,
          payload: {},
        },
      });

      await prisma.notification.create({
        data: {
          userId: userAId,
          eventId: event2.id,
          type: 'INCIDENT_RESOLVED',
          title: 'Incident resolved: Test Monitor',
          message: 'Monitor is back up',
        },
      });

      const beforeCount = await prisma.notification.count({
        where: { userId: userAId, readAt: null },
      });
      expect(beforeCount).toBe(1);

      const res = await request(app.getHttpServer())
        .post('/notifications/read-all')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);

      const afterCount = await prisma.notification.count({
        where: { userId: userAId, readAt: null },
      });
      expect(afterCount).toBe(0);
    });
  });

  describe('4. Scoped API Key Authorization', () => {
    it('read-scoped API key can access GET /notifications and GET /notifications/unread-count', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set(API_KEY_CONFIG.HEADER_NAME, readApiKey);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();

      const unreadRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set(API_KEY_CONFIG.HEADER_NAME, readApiKey);

      expect(unreadRes.status).toBe(200);
    });

    it('read-scoped API key is rejected (403) on PATCH /notifications/preferences', async () => {
      const res = await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set(CSRF_HEADERS)
        .set(API_KEY_CONFIG.HEADER_NAME, readApiKey)
        .send({ emailIncidentCreated: false });

      expect(res.status).toBe(403);
    });

    it('write-scoped API key can access PATCH /notifications/preferences', async () => {
      const res = await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set(CSRF_HEADERS)
        .set(API_KEY_CONFIG.HEADER_NAME, writeApiKey)
        .send({ emailIncidentCreated: false });

      expect(res.status).toBe(200);
      expect(res.body.emailIncidentCreated).toBe(false);
    });

    it('write-scoped API key is rejected (403) on GET /notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set(API_KEY_CONFIG.HEADER_NAME, writeApiKey);

      expect(res.status).toBe(403);
    });
  });

  describe('5. Email Delivery & Demo Account Bypass', () => {
    it('bypasses external SMTP for demo account and marks DELIVERED', async () => {
      const mockProvider = {
        send: jest.fn().mockResolvedValue({ success: true }),
      };
      workerService.setEmailProvider(mockProvider);

      const eventDemo = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: `demo-${Date.now()}`,
          dedupeKey: `demo:${Date.now()}`,
          payload: {},
        },
      });

      const demoDelivery = await prisma.notificationEmailDelivery.create({
        data: {
          userId: userAId,
          eventId: eventDemo.id,
          toEmail: DEMO_CONFIG.DEMO_USER_EMAIL,
          subject: 'Demo Alert',
          bodyText: 'Text',
          bodyHtml: '<p>Html</p>',
          status: NOTIFICATION_EMAIL_STATUS.PENDING,
        },
      });

      const summary = await workerService.processDelivery(demoDelivery.id);
      expect(summary?.success).toBe(true);
      expect(summary?.bypassed).toBe(true);
      expect(mockProvider.send).not.toHaveBeenCalled();

      const updated = await prisma.notificationEmailDelivery.findUnique({
        where: { id: demoDelivery.id },
      });
      expect(updated?.status).toBe(NOTIFICATION_EMAIL_STATUS.DELIVERED);
      expect(updated?.lastErrorMessage).toContain('SMTP bypassed');
    });

    it('delivers email via provider for normal user account', async () => {
      const mockProvider = {
        send: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'msg-int-100',
        }),
      };
      workerService.setEmailProvider(mockProvider);

      const eventNorm = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: `norm-${Date.now()}`,
          dedupeKey: `norm:${Date.now()}`,
          payload: {},
        },
      });

      const normalDelivery = await prisma.notificationEmailDelivery.create({
        data: {
          userId: userAId,
          eventId: eventNorm.id,
          toEmail: 'customer@example.com',
          subject: 'Customer Alert',
          bodyText: 'Text',
          bodyHtml: '<p>Html</p>',
          status: NOTIFICATION_EMAIL_STATUS.PENDING,
        },
      });

      const summary = await workerService.processDelivery(normalDelivery.id);
      expect(summary?.success).toBe(true);
      expect(mockProvider.send).toHaveBeenCalled();

      const updated = await prisma.notificationEmailDelivery.findUnique({
        where: { id: normalDelivery.id },
      });
      expect(updated?.status).toBe(NOTIFICATION_EMAIL_STATUS.DELIVERED);
    });
  });

  describe('6. Concurrency & Preference Snapshot Semantics', () => {
    it('handles concurrent identical event processing atomically without duplicate records', async () => {
      // Ensure email notifications are enabled for this test
      await prisma.notificationPreference.upsert({
        where: { userId: userAId },
        update: { emailIncidentCreated: true, emailIncidentResolved: true },
        create: {
          userId: userAId,
          inAppIncidentCreated: true,
          inAppIncidentResolved: true,
          emailIncidentCreated: true,
          emailIncidentResolved: true,
        },
      });

      const concurrentEvent = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: `inc-concurrent-${Date.now()}`,
          dedupeKey: `concurrent:${Date.now()}`,
          payload: {
            data: {
              incident: {
                id: `inc-concurrent-${Date.now()}`,
                cause: 'Concurrent test error',
              },
            },
          },
        },
      });

      // Execute two transactions concurrently for the same event
      await Promise.all([
        prisma.$transaction(async (tx) => {
          await notificationsService.generateNotificationsForEvent(
            tx,
            concurrentEvent,
            {
              id: testMonitorId,
              name: 'Notifications Test Monitor',
            },
          );
        }),
        prisma.$transaction(async (tx) => {
          await notificationsService.generateNotificationsForEvent(
            tx,
            concurrentEvent,
            {
              id: testMonitorId,
              name: 'Notifications Test Monitor',
            },
          );
        }),
      ]);

      // Exactly 1 in-app notification
      const notifs = await prisma.notification.findMany({
        where: { userId: userAId, eventId: concurrentEvent.id },
      });
      expect(notifs).toHaveLength(1);

      // Exactly 1 email delivery
      const deliveries = await prisma.notificationEmailDelivery.findMany({
        where: { userId: userAId, eventId: concurrentEvent.id },
      });
      expect(deliveries).toHaveLength(1);

      // Exactly 1 outbox record
      const outbox = await prisma.notificationEmailOutbox.findMany({
        where: { deliveryId: deliveries[0].id },
      });
      expect(outbox).toHaveLength(1);
    });

    it('preserves preference snapshot: turning off email does not delete existing deliveries and stops future ones', async () => {
      // 1. Ensure email notification preference is ON
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({
          emailIncidentCreated: true,
          emailIncidentResolved: true,
        });

      // Create an event while email is enabled -> delivery exists.
      const snapshotEvent1 = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: `inc-snap-1-${Date.now()}`,
          dedupeKey: `snap-1:${Date.now()}`,
          payload: {},
        },
      });

      await prisma.$transaction(async (tx) => {
        await notificationsService.generateNotificationsForEvent(
          tx,
          snapshotEvent1,
          { id: testMonitorId, name: 'Snapshot Monitor' },
        );
      });

      const existingDel = await prisma.notificationEmailDelivery.findFirst({
        where: { userId: userAId, eventId: snapshotEvent1.id },
      });
      expect(existingDel).not.toBeNull();

      // 2. User turns email preference OFF
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set(CSRF_HEADERS)
        .set('Cookie', userACookie)
        .send({
          emailIncidentCreated: false,
          emailIncidentResolved: false,
        });

      // 3. New event occurs while preference is OFF
      const snapshotEvent2 = await prisma.webhookEvent.create({
        data: {
          userId: userAId,
          type: 'incident.created',
          sourceType: 'incident',
          sourceId: `inc-snap-2-${Date.now()}`,
          dedupeKey: `snap-2:${Date.now()}`,
          payload: {},
        },
      });

      await prisma.$transaction(async (tx) => {
        await notificationsService.generateNotificationsForEvent(
          tx,
          snapshotEvent2,
          { id: testMonitorId, name: 'Snapshot Monitor' },
        );
      });

      // Verify no email delivery was created for the new event
      const noDel = await prisma.notificationEmailDelivery.findFirst({
        where: { userId: userAId, eventId: snapshotEvent2.id },
      });
      expect(noDel).toBeNull();

      // Verify earlier delivery still safely exists (not destroyed retroactively)
      const preservedDel = await prisma.notificationEmailDelivery.findUnique({
        where: { id: existingDel!.id },
      });
      expect(preservedDel).not.toBeNull();
    });
  });
});
