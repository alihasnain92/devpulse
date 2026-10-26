import { NotificationEmailWorkerService } from './notification-email-worker.service';
import {
  DEMO_CONFIG,
  NOTIFICATION_EMAIL_RETRY_CONFIG,
  NOTIFICATION_EMAIL_STATUS,
} from '@devpulse/shared';

describe('NotificationEmailWorkerService', () => {
  let service: NotificationEmailWorkerService;
  let mockPrisma: any;
  let mockEmailProvider: any;
  let mockQueue: any;

  beforeEach(() => {
    mockPrisma = {
      notificationEmailDelivery: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    mockEmailProvider = {
      send: jest.fn(),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'retry-job-1' }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    service = new NotificationEmailWorkerService(
      mockPrisma,
      mockEmailProvider,
    );
    service.setQueue(mockQueue as any);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should skip duplicate processing if delivery is already DELIVERED', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-1',
      status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
      attemptCount: 1,
    });

    const result = await service.processDelivery('del-1');
    expect(result?.success).toBe(true);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.DELIVERED);
    expect(mockEmailProvider.send).not.toHaveBeenCalled();
    expect(mockPrisma.notificationEmailDelivery.update).not.toHaveBeenCalled();
  });

  it('should bypass external SMTP for demo user and mark DELIVERED', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-demo',
      toEmail: DEMO_CONFIG.DEMO_USER_EMAIL,
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
      attemptCount: 0,
    });

    mockPrisma.notificationEmailDelivery.update.mockResolvedValue({
      id: 'del-demo',
      status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
    });

    const result = await service.processDelivery('del-demo');

    expect(result?.success).toBe(true);
    expect(result?.bypassed).toBe(true);
    expect(mockEmailProvider.send).not.toHaveBeenCalled();
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-demo' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
          lastErrorCode: 'DEMO_SIMULATION',
          lastErrorMessage: expect.stringContaining('SMTP bypassed'),
        }),
      }),
    );
  });

  it('should send email and mark DELIVERED on provider success', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-normal',
      toEmail: 'alice@example.com',
      subject: 'Alert',
      bodyText: 'Text',
      bodyHtml: '<p>Html</p>',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
      attemptCount: 0,
    });

    mockEmailProvider.send.mockResolvedValue({
      success: true,
      messageId: 'msg-999',
    });

    const result = await service.processDelivery('del-normal');

    expect(result?.success).toBe(true);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.DELIVERED);
    expect(mockEmailProvider.send).toHaveBeenCalledWith({
      to: 'alice@example.com',
      subject: 'Alert',
      text: 'Text',
      html: '<p>Html</p>',
    });
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-normal' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
        }),
      }),
    );
  });

  it('should mark FAILED immediately if provider is not configured', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-unconf',
      toEmail: 'bob@example.com',
      subject: 'Alert',
      bodyText: 'Text',
      bodyHtml: '<p>Html</p>',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
      attemptCount: 0,
    });

    mockEmailProvider.send.mockResolvedValue({
      success: false,
      error: {
        code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        message: 'Email provider disabled',
      },
    });

    const result = await service.processDelivery('del-unconf');

    expect(result?.success).toBe(false);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.FAILED);
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-unconf' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.FAILED,
          lastErrorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        }),
      }),
    );
  });

  it('should schedule retry with backoff on transient send failure', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-transient',
      toEmail: 'charlie@example.com',
      subject: 'Alert',
      bodyText: 'Text',
      bodyHtml: '<p>Html</p>',
      status: NOTIFICATION_EMAIL_STATUS.PENDING,
      attemptCount: 0,
    });

    mockEmailProvider.send.mockResolvedValue({
      success: false,
      error: {
        code: 'ETIMEDOUT',
        message: 'Connection timed out',
      },
    });

    const result = await service.processDelivery('del-transient');

    expect(result?.success).toBe(false);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.RETRYING);
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-transient' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.RETRYING,
          lastErrorCode: 'ETIMEDOUT',
        }),
      }),
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-email',
      { deliveryId: 'del-transient' },
      expect.objectContaining({
        jobId: 'notification-email-del-transient-retry-1',
      }),
    );
  });

  it('should mark delivery FAILED when MAX_ATTEMPTS is reached', async () => {
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-max-reached',
      toEmail: 'dave@example.com',
      subject: 'Alert',
      bodyText: 'Text',
      bodyHtml: '<p>Html</p>',
      status: NOTIFICATION_EMAIL_STATUS.RETRYING,
      attemptCount: NOTIFICATION_EMAIL_RETRY_CONFIG.MAX_ATTEMPTS - 1,
    });

    mockEmailProvider.send.mockResolvedValue({
      success: false,
      error: {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      },
    });

    const result = await service.processDelivery('del-max-reached');

    expect(result?.success).toBe(false);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.FAILED);
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-max-reached' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.FAILED,
          lastErrorCode: 'ECONNREFUSED',
        }),
      }),
    );
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('executes at-least-once retry when crash occurred before DB success update committed (ambiguous-success scenario)', async () => {
    // Scenario:
    // Attempt 1 was sent to SMTP, but the process crashed before the database success update committed.
    // The delivery remained in status PROCESSING/RETRYING in the database.
    mockPrisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      id: 'del-ambiguous-crash',
      toEmail: 'alice@example.com',
      subject: 'Outage Alert',
      bodyText: 'Text',
      bodyHtml: '<p>Html</p>',
      status: NOTIFICATION_EMAIL_STATUS.RETRYING,
      attemptCount: 1,
    });

    mockEmailProvider.send.mockResolvedValue({
      success: true,
      messageId: 'msg-recovered-2',
    });

    const result = await service.processDelivery('del-ambiguous-crash');

    // Because DELIVERED was not persisted before the crash, worker re-sends under at-least-once semantics
    expect(result?.success).toBe(true);
    expect(result?.status).toBe(NOTIFICATION_EMAIL_STATUS.DELIVERED);
    expect(mockEmailProvider.send).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notificationEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-ambiguous-crash' },
        data: expect.objectContaining({
          status: NOTIFICATION_EMAIL_STATUS.DELIVERED,
        }),
      }),
    );
  });
});
