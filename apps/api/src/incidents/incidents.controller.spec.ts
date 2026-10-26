import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { IncidentDto } from '@devpulse/shared';

describe('IncidentsController (Unit)', () => {
  let controller: IncidentsController;
  let service: {
    findAllForUser: jest.Mock;
    findOne: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-xyz',
    email: 'user@devpulse.dev',
  };

  const mockIncident: IncidentDto = {
    id: 'inc-1',
    monitorId: 'mon-1',
    monitorName: 'API Gateway',
    state: 'ongoing',
    startedAt: '2026-10-26T12:00:00.000Z',
    resolvedAt: null,
    durationMs: 30000,
    durationSeconds: 30,
    cause: 'HTTP 503 response received (Expected 200)',
    isResolved: false,
    isSeeded: false,
  };

  beforeEach(async () => {
    service = {
      findAllForUser: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentsController],
      providers: [
        {
          provide: IncidentsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<IncidentsController>(IncidentsController);
  });

  it('findAllForUser should call service.findAllForUser with parsed parameters', async () => {
    service.findAllForUser.mockResolvedValue([mockIncident]);

    const result = await controller.findAllForUser(mockUser, 'active', '10', '0');

    expect(service.findAllForUser).toHaveBeenCalledWith('user-xyz', {
      status: 'active',
      limit: 10,
      offset: 0,
    });
    expect(result).toEqual([mockIncident]);
  });

  it('findOne should call service.findOne with ID and user ID', async () => {
    service.findOne.mockResolvedValue(mockIncident);

    const result = await controller.findOne(mockUser, 'inc-1');

    expect(service.findOne).toHaveBeenCalledWith('inc-1', 'user-xyz');
    expect(result).toEqual(mockIncident);
  });
});
