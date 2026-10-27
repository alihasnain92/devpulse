import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { RateLimiterService } from '../rate-limiting/rate-limiter.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockRateLimiterService: { ping: jest.Mock };

  beforeEach(async () => {
    mockRateLimiterService = {
      ping: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return { status: "ok" }', () => {
    const result = controller.check();
    expect(result).toEqual({ status: 'ok' });
  });

  it('should return worker health diagnostics', async () => {
    const result = await controller.checkWorker();
    expect(result).toEqual({
      status: 'ok',
      monitorWorker: true,
      webhookWorker: true,
      notificationEmailWorker: true,
      redis: true,
    });
    expect(mockRateLimiterService.ping).toHaveBeenCalled();
  });
});
