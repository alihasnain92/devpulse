import { Test, TestingModule } from '@nestjs/testing';
import { WebhookDeliveryWorkerService } from './webhook-delivery-worker.service';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';

jest.mock('bullmq', () => {
  return {
    Worker: jest.fn().mockImplementation((queueName, processor, opts) => {
      return {
        queueName,
        processor,
        opts,
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        isPaused: jest.fn().mockReturnValue(false),
      };
    }),
  };
});

describe('WebhookDeliveryWorkerService (Unit)', () => {
  let service: WebhookDeliveryWorkerService;

  const mockDeliveryService = {
    processDelivery: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryWorkerService,
        { provide: WebhookDeliveryService, useValue: mockDeliveryService },
      ],
    }).compile();

    service = module.get<WebhookDeliveryWorkerService>(
      WebhookDeliveryWorkerService,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('initializes worker and processes delivery jobs', async () => {
    service.onModuleInit();

    expect(service.isHealthy()).toBe(true);

    const workerInstance = (service as any).worker;
    expect(workerInstance).toBeDefined();

    // Trigger job processing
    const mockJob = {
      id: 'job-1',
      data: { deliveryId: 'del-123' },
    };

    await workerInstance.processor(mockJob);

    expect(mockDeliveryService.processDelivery).toHaveBeenCalledWith('del-123');
  });

  it('skips jobs with missing deliveryId', async () => {
    service.onModuleInit();

    const workerInstance = (service as any).worker;
    const mockJob = {
      id: 'job-empty',
      data: {},
    };

    await workerInstance.processor(mockJob);

    expect(mockDeliveryService.processDelivery).not.toHaveBeenCalled();
  });

  it('closes worker gracefully on module destroy', async () => {
    service.onModuleInit();
    const workerInstance = (service as any).worker;

    await service.onModuleDestroy();

    expect(workerInstance.close).toHaveBeenCalled();
    expect(service.isHealthy()).toBe(false);
  });
});
