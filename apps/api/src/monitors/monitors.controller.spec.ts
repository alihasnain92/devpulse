import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod, MonitorDto, IncidentDto } from '@devpulse/shared';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { IncidentsService } from '../incidents/incidents.service';
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
  let monitoringService: {
    enqueueManualCheck: jest.Mock;
    getRecentChecks: jest.Mock;
    getLatestCheck: jest.Mock;
  };
  let incidentsService: {
    findAllForMonitor: jest.Mock;
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

    monitoringService = {
      enqueueManualCheck: jest.fn(),
      getRecentChecks: jest.fn(),
      getLatestCheck: jest.fn(),
    };

    incidentsService = {
      findAllForMonitor: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitorsController],
      providers: [
        {
          provide: MonitorsService,
          useValue: service,
        },
        {
          provide: MonitoringService,
          useValue: monitoringService,
        },
        {
          provide: IncidentsService,
          useValue: incidentsService,
        },
      ],
    }).compile();

    controller = module.get<MonitorsController>(MonitorsController);
  });

  it('create should call service.create with user ID and DTO', async () => {
    service.create.mockResolvedValue(mockMonitor);

    const dto = {
      name: 'Main Website',
      url: 'https://example.com',
    };

    const result = await controller.create(mockUser, dto);

    expect(service.create).toHaveBeenCalledWith('user-abc', dto);
    expect(result).toBe(mockMonitor);
  });

  it('findAll should call service.findAll with user ID', async () => {
    service.findAll.mockResolvedValue([mockMonitor]);

    const result = await controller.findAll(mockUser);

    expect(service.findAll).toHaveBeenCalledWith('user-abc');
    expect(result).toEqual([mockMonitor]);
  });

  it('findOne should call service.findOne with monitor ID and user ID', async () => {
    service.findOne.mockResolvedValue(mockMonitor);

    const result = await controller.findOne(mockUser, 'mon-1');

    expect(service.findOne).toHaveBeenCalledWith('mon-1', 'user-abc');
    expect(result).toBe(mockMonitor);
  });

  it('update should call service.update with monitor ID, user ID, and update DTO', async () => {
    const updated = { ...mockMonitor, name: 'Renamed' };
    service.update.mockResolvedValue(updated);

    const result = await controller.update(mockUser, 'mon-1', {
      name: 'Renamed',
    });

    expect(service.update).toHaveBeenCalledWith('mon-1', 'user-abc', {
      name: 'Renamed',
    });
    expect(result.name).toBe('Renamed');
  });

  it('remove should call service.remove with monitor ID and user ID', async () => {
    service.remove.mockResolvedValue({
      message: 'Monitor deleted successfully',
    });

    const result = await controller.remove(mockUser, 'mon-1');

    expect(service.remove).toHaveBeenCalledWith('mon-1', 'user-abc');
    expect(result).toEqual({ message: 'Monitor deleted successfully' });
  });

  it('triggerManualCheck should call monitoringService.enqueueManualCheck', async () => {
    const mockResponse = {
      message: 'Check queued successfully',
      checkJobId: 'job-123',
      statusUrl: '/monitors/mon-1/checks/latest',
    };
    monitoringService.enqueueManualCheck.mockResolvedValue(mockResponse);

    const result = await controller.triggerManualCheck(mockUser, 'mon-1');

    expect(monitoringService.enqueueManualCheck).toHaveBeenCalledWith(
      'mon-1',
      'user-abc',
    );
    expect(result).toBe(mockResponse);
  });

  it('getRecentChecks should call monitoringService.getRecentChecks with parsed limit', async () => {
    const mockChecks = [
      {
        id: 'chk-1',
        monitorId: 'mon-1',
        statusCode: 200,
        latencyMs: 145,
        isSuccess: true,
        errorMessage: null,
        isSeeded: false,
        checkedAt: '2026-10-26T12:00:00.000Z',
      },
    ];
    monitoringService.getRecentChecks.mockResolvedValue(mockChecks);

    const result = await controller.getRecentChecks(mockUser, 'mon-1', '25');

    expect(monitoringService.getRecentChecks).toHaveBeenCalledWith(
      'mon-1',
      'user-abc',
      25,
    );
    expect(result).toBe(mockChecks);
  });

  it('getLatestCheck should call monitoringService.getLatestCheck', async () => {
    const mockCheck = {
      id: 'chk-1',
      monitorId: 'mon-1',
      statusCode: 200,
      latencyMs: 145,
      isSuccess: true,
      errorMessage: null,
      isSeeded: false,
      checkedAt: '2026-10-26T12:00:00.000Z',
    };
    monitoringService.getLatestCheck.mockResolvedValue(mockCheck);

    const result = await controller.getLatestCheck(mockUser, 'mon-1');

    expect(monitoringService.getLatestCheck).toHaveBeenCalledWith(
      'mon-1',
      'user-abc',
    );
    expect(result).toBe(mockCheck);
  });

  it('getMonitorIncidents should call incidentsService.findAllForMonitor with parsed parameters', async () => {
    const mockIncidents: IncidentDto[] = [
      {
        id: 'inc-1',
        monitorId: 'mon-1',
        monitorName: 'Main Website',
        state: 'ongoing',
        startedAt: '2026-10-26T12:00:00.000Z',
        resolvedAt: null,
        durationMs: 45000,
        durationSeconds: 45,
        cause: 'HTTP 500',
        isResolved: false,
        isSeeded: false,
      },
    ];
    incidentsService.findAllForMonitor.mockResolvedValue(mockIncidents);

    const result = await controller.getMonitorIncidents(
      mockUser,
      'mon-1',
      'active',
      '10',
      '0',
    );

    expect(incidentsService.findAllForMonitor).toHaveBeenCalledWith(
      'mon-1',
      'user-abc',
      {
        status: 'active',
        limit: 10,
        offset: 0,
      },
    );
    expect(result).toEqual(mockIncidents);
  });
});
