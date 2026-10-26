import { Test, TestingModule } from '@nestjs/testing';
import { WebhookDeliveriesController } from './webhook-deliveries.controller';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('WebhookDeliveriesController', () => {
  let controller: WebhookDeliveriesController;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getAttempts: jest.fn(),
    replay: jest.fn(),
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookDeliveriesController],
      providers: [
        {
          provide: WebhookDeliveriesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<WebhookDeliveriesController>(
      WebhookDeliveriesController,
    );
  });

  it('delegates findAll to service with query parameters', async () => {
    const query = { limit: 10, status: 'DELIVERED' as any };
    mockService.findAll.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

    const result = await controller.findAll(mockUser, query);

    expect(result).toBeDefined();
    expect(mockService.findAll).toHaveBeenCalledWith(mockUser.id, query);
  });

  it('delegates findOne to service with user id and delivery id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'del-1' });

    const result = await controller.findOne(mockUser, 'del-1');

    expect(result).toEqual({ id: 'del-1' });
    expect(mockService.findOne).toHaveBeenCalledWith(mockUser.id, 'del-1');
  });

  it('delegates getAttempts to service with user id and delivery id', async () => {
    mockService.getAttempts.mockResolvedValue([]);

    const result = await controller.getAttempts(mockUser, 'del-1');

    expect(result).toEqual([]);
    expect(mockService.getAttempts).toHaveBeenCalledWith(mockUser.id, 'del-1');
  });

  it('delegates replay to service, setting 202 Accepted for newly accepted replay', async () => {
    mockService.replay.mockResolvedValue({
      message: 'Webhook replay accepted and queued for delivery',
      originalDeliveryId: 'del-1',
      replayDelivery: { id: 'del-replay-1' },
      isIdempotent: false,
    });

    const mockRes = {
      status: jest.fn().mockReturnThis(),
    } as any;

    const result = await controller.replay(
      mockUser,
      'del-1',
      mockRes,
      'idem-uuid-key',
      undefined,
    );

    expect(result.message).toContain('accepted');
    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockService.replay).toHaveBeenCalledWith(
      mockUser.id,
      'del-1',
      'idem-uuid-key',
    );
  });

  it('sets 200 OK when service reports an idempotent match', async () => {
    mockService.replay.mockResolvedValue({
      message: 'Webhook replay already accepted (idempotent)',
      originalDeliveryId: 'del-1',
      replayDelivery: { id: 'del-replay-1' },
      isIdempotent: true,
    });

    const mockRes = {
      status: jest.fn().mockReturnThis(),
    } as any;

    const result = await controller.replay(
      mockUser,
      'del-1',
      mockRes,
      'idem-uuid-key',
      undefined,
    );

    expect(result.message).toContain('idempotent');
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  it('falls back to x-idempotency-key if idempotency-key header is omitted', async () => {
    mockService.replay.mockResolvedValue({
      message: 'Webhook replay accepted and queued for delivery',
      originalDeliveryId: 'del-1',
      replayDelivery: { id: 'del-replay-1' },
      isIdempotent: false,
    });

    const mockRes = {
      status: jest.fn().mockReturnThis(),
    } as any;

    const result = await controller.replay(
      mockUser,
      'del-1',
      mockRes,
      undefined,
      'x-idem-uuid-key',
    );

    expect(result.message).toContain('accepted');
    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockService.replay).toHaveBeenCalledWith(
      mockUser.id,
      'del-1',
      'x-idem-uuid-key',
    );
  });
});
