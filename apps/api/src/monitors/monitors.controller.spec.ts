import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod, MonitorDto } from '@devpulse/shared';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

describe('MonitorsController (Unit)', () => {
  let controller: MonitorsController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-abc',
    email: 'user@devpulse.dev',
  };

  const mockMonitor: MonitorDto = {
    id: 'mon-1',
    userId: 'user-abc',
    name: 'Main Website',
    url: 'https://example.com',
    method: HttpMethod.GET,
    intervalSeconds: 60,
    timeoutMs: 10000,
    expectedStatus: 200,
    isPaused: false,
    isSeeded: false,
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitorsController],
      providers: [
        {
          provide: MonitorsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<MonitorsController>(MonitorsController);
  });

  it('create should call service.create with user ID and DTO', async () => {
    service.create.mockResolvedValue(mockMonitor);

    const dto = { name: 'Main Website', url: 'https://example.com' };
    const result = await controller.create(mockUser, dto);

    expect(service.create).toHaveBeenCalledWith(mockUser.id, dto);
    expect(result).toBe(mockMonitor);
  });

  it('findAll should call service.findAll with user ID', async () => {
    service.findAll.mockResolvedValue([mockMonitor]);

    const result = await controller.findAll(mockUser);

    expect(service.findAll).toHaveBeenCalledWith(mockUser.id);
    expect(result).toEqual([mockMonitor]);
  });

  it('findOne should call service.findOne with id and user ID', async () => {
    service.findOne.mockResolvedValue(mockMonitor);

    const result = await controller.findOne(mockUser, 'mon-1');

    expect(service.findOne).toHaveBeenCalledWith('mon-1', mockUser.id);
    expect(result).toBe(mockMonitor);
  });

  it('update should call service.update with id, user ID, and DTO', async () => {
    const updated = { ...mockMonitor, isPaused: true };
    service.update.mockResolvedValue(updated);

    const result = await controller.update(mockUser, 'mon-1', { isPaused: true });

    expect(service.update).toHaveBeenCalledWith('mon-1', mockUser.id, {
      isPaused: true,
    });
    expect(result).toBe(updated);
  });

  it('remove should call service.remove with id and user ID', async () => {
    service.remove.mockResolvedValue({ message: 'Monitor deleted successfully' });

    const result = await controller.remove(mockUser, 'mon-1');

    expect(service.remove).toHaveBeenCalledWith('mon-1', mockUser.id);
    expect(result).toEqual({ message: 'Monitor deleted successfully' });
  });
});
