import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CsrfGuard } from '../auth/guards/csrf.guard';

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const user = { id: 'usr-123', email: 'test@devpulse.dev' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: mockService }],
    })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should delegate create to WebhooksService with authenticated userId', async () => {
    const dto = {
      name: 'Slack Hook',
      url: 'https://example.com/hook',
      events: ['incident.created' as const],
    };

    mockService.create.mockResolvedValue({
      endpoint: { id: 'wh-1', ...dto },
      signingSecret: 'whsec_secret_123',
    });

    const result = await controller.create(user, dto);
    expect(mockService.create).toHaveBeenCalledWith(user.id, dto);
    expect(result.signingSecret).toBe('whsec_secret_123');
  });

  it('should delegate findAll to WebhooksService with userId', async () => {
    mockService.findAll.mockResolvedValue([]);
    const result = await controller.findAll(user);
    expect(mockService.findAll).toHaveBeenCalledWith(user.id);
    expect(result).toEqual([]);
  });

  it('should delegate findOne to WebhooksService', async () => {
    mockService.findOne.mockResolvedValue({ id: 'wh-1' });
    const result = await controller.findOne(user, 'wh-1');
    expect(mockService.findOne).toHaveBeenCalledWith('wh-1', user.id);
    expect(result.id).toBe('wh-1');
  });

  it('should delegate update to WebhooksService', async () => {
    const dto = { name: 'New Name' };
    mockService.update.mockResolvedValue({ id: 'wh-1', name: 'New Name' });
    const result = await controller.update(user, 'wh-1', dto);
    expect(mockService.update).toHaveBeenCalledWith('wh-1', user.id, dto);
    expect(result.name).toBe('New Name');
  });

  it('should delegate remove to WebhooksService', async () => {
    mockService.remove.mockResolvedValue({ success: true, message: 'Deleted' });
    const result = await controller.remove(user, 'wh-1');
    expect(mockService.remove).toHaveBeenCalledWith('wh-1', user.id);
    expect(result.success).toBe(true);
  });
});
