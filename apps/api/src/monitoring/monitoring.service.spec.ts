import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HttpMethod } from '@devpulse/shared';
import { MonitoringService } from './monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringHttpClientService } from './http/monitoring-http-client.service';
import { SchedulerService } from './queue/scheduler.service';
import { IncidentsService } from '../incidents/incidents.service';

describe('MonitoringService (Unit)', () => {
  let service: MonitoringService;
  let prisma: {
    monitor: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    checkResult: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let txMock: {
    $queryRaw: jest.Mock;
    checkResult: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let httpClient: {
    executeCheck: jest.Mock;
  };
  let schedulerService: {
    enqueueManualCheck: jest.Mock;
  };
  let incidentsService: {
    evaluateIncidentTransition: jest.Mock;
  };

  const mockDate = new Date('2026-10-26T12:00:00.000Z');
  const mockUserId = 'user-123';
  const mockMonitor = {
    id: 'mon-1',
    userId: mockUserId,
    name: 'Production API',
    url: 'https://api.example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 10000,
    expectedStatus: 200,
    isPaused: false,
    isSeeded: false,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const mockCheckRecord = {
    id: 'chk-1',
    monitorId: 'mon-1',
    statusCode: 200,
    latencyMs: 120,
    isSuccess: true,
    errorMessage: null,
    isSeeded: false,
    jobId: 'job-123',
    checkedAt: mockDate,
  };

  beforeEach(async () => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'mon-1', isPaused: false, expectedStatus: 200 },
      ]),
      checkResult: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    prisma = {
      monitor: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      checkResult: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(txMock)),
    };

    httpClient = {
      executeCheck: jest.fn(),
    };

    schedulerService = {
      enqueueManualCheck: jest.fn(),
    };

    incidentsService = {
      evaluateIncidentTransition: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: MonitoringHttpClientService,
          useValue: httpClient,
        },
        {
          provide: SchedulerService,
          useValue: schedulerService,
        },
        {
          provide: IncidentsService,
          useValue: incidentsService,
        },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  describe('runMonitorCheck', () => {
    it('should abort cleanly without HTTP request if monitor does not exist', async () => {
      prisma.monitor.findUnique.mockResolvedValue(null);

      const result = await service.runMonitorCheck('non-existent-id');

      expect(result).toBeNull();
      expect(httpClient.executeCheck).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should abort cleanly without HTTP request if monitor is paused (pre-check protection)', async () => {
      prisma.monitor.findUnique.mockResolvedValue({
        ...mockMonitor,
        isPaused: true,
      });

      const result = await service.runMonitorCheck('mon-1');

      expect(result).toBeNull();
      expect(httpClient.executeCheck).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute outbound check, determine success, persist in transaction, and evaluate incidents', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      httpClient.executeCheck.mockResolvedValue({
        statusCode: 200,
        latencyMs: 145.2,
        isSuccess: true,
        errorMessage: null,
        finalUrl: 'https://api.example.com/health',
        redirectHops: 0,
        resolvedIp: '93.184.216.34',
        executedAt: mockDate,
      });
      txMock.checkResult.create.mockResolvedValue({
        id: 'chk-created',
        monitorId: 'mon-1',
        statusCode: 200,
        latencyMs: 145,
        isSuccess: true,
        errorMessage: null,
        isSeeded: false,
        jobId: null,
        checkedAt: mockDate,
      });

      const result = await service.runMonitorCheck('mon-1');

      expect(httpClient.executeCheck).toHaveBeenCalledWith(
        mockMonitor.url,
        HttpMethod.GET,
        mockMonitor.timeoutMs,
        mockMonitor.expectedStatus,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(txMock.$queryRaw).toHaveBeenCalled();
      expect(txMock.checkResult.create).toHaveBeenCalledWith({
        data: {
          monitorId: 'mon-1',
          statusCode: 200,
          latencyMs: 145,
          isSuccess: true,
          errorMessage: null,
          jobId: null,
          checkedAt: mockDate,
        },
      });
      expect(incidentsService.evaluateIncidentTransition).toHaveBeenCalledWith(
        txMock,
        'mon-1',
        expect.objectContaining({ id: 'chk-created' }),
        200,
      );
      expect(result?.isSuccess).toBe(true);
      expect(result?.statusCode).toBe(200);
      expect(result?.latencyMs).toBe(145);
    });

    it('should record failure when status code does not match expected status and evaluate incidents', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      httpClient.executeCheck.mockResolvedValue({
        statusCode: 503,
        latencyMs: 250,
        isSuccess: false,
        errorMessage: null,
        finalUrl: 'https://api.example.com/health',
        redirectHops: 0,
        resolvedIp: '93.184.216.34',
        executedAt: mockDate,
      });
      txMock.checkResult.create.mockResolvedValue({
        id: 'chk-503',
        monitorId: 'mon-1',
        statusCode: 503,
        latencyMs: 250,
        isSuccess: false,
        errorMessage: null,
        isSeeded: false,
        jobId: null,
        checkedAt: mockDate,
      });

      const result = await service.runMonitorCheck('mon-1');

      expect(txMock.checkResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          statusCode: 503,
          isSuccess: false,
        }),
      });
      expect(incidentsService.evaluateIncidentTransition).toHaveBeenCalled();
      expect(result?.isSuccess).toBe(false);
      expect(result?.statusCode).toBe(503);
    });

    it('should record sanitized error message on SSRF block or network timeout', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      httpClient.executeCheck.mockResolvedValue({
        statusCode: null,
        latencyMs: 12,
        isSuccess: false,
        errorMessage: 'SSRF_BLOCKED: Private IPv4 addresses are prohibited',
        finalUrl: 'http://127.0.0.1:8080',
        redirectHops: 0,
        resolvedIp: '127.0.0.1',
        executedAt: mockDate,
      });
      txMock.checkResult.create.mockResolvedValue({
        id: 'chk-err',
        monitorId: 'mon-1',
        statusCode: null,
        latencyMs: 12,
        isSuccess: false,
        errorMessage: 'SSRF_BLOCKED: Private IPv4 addresses are prohibited',
        isSeeded: false,
        jobId: null,
        checkedAt: mockDate,
      });

      const result = await service.runMonitorCheck('mon-1');

      expect(result?.isSuccess).toBe(false);
      expect(result?.errorMessage).toContain('SSRF_BLOCKED');
      expect(result?.statusCode).toBeNull();
    });

    it('should enforce idempotency: return existing result if jobId already recorded prior to check', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      prisma.checkResult.findUnique.mockResolvedValue(mockCheckRecord);

      const result = await service.runMonitorCheck('mon-1', 'job-123');

      expect(result?.id).toBe('chk-1');
      expect(result?.jobId).toBe('job-123');
      expect(httpClient.executeCheck).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should abort and return null if monitor is paused during check execution', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      httpClient.executeCheck.mockResolvedValue({
        statusCode: 200,
        latencyMs: 100,
        isSuccess: true,
        errorMessage: null,
        finalUrl: 'https://example.com',
        redirectHops: 0,
        resolvedIp: '93.184.216.34',
      });

      // Locked monitor returns isPaused = true (paused while check was in-flight)
      txMock.$queryRaw.mockResolvedValue([
        { id: 'mon-1', isPaused: true, expectedStatus: 200 },
      ]);

      const result = await service.runMonitorCheck('mon-1');

      expect(result).toBeNull();
      expect(txMock.checkResult.create).not.toHaveBeenCalled();
    });

    it('should explicitly pass probe start timestamp (executedAt) into CheckResult.create as checkedAt', async () => {
      const explicitProbeStart = new Date('2026-10-26T12:00:00.000Z');
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      httpClient.executeCheck.mockResolvedValue({
        statusCode: 200,
        latencyMs: 300,
        isSuccess: true,
        errorMessage: null,
        finalUrl: 'https://example.com/api',
        redirectHops: 0,
        resolvedIp: '93.184.216.34',
        executedAt: explicitProbeStart,
      });

      txMock.checkResult.create.mockResolvedValue({
        id: 'chk-with-timestamp',
        monitorId: 'mon-1',
        statusCode: 200,
        latencyMs: 300,
        isSuccess: true,
        errorMessage: null,
        isSeeded: false,
        jobId: null,
        checkedAt: explicitProbeStart,
      });

      await service.runMonitorCheck('mon-1');

      expect(txMock.checkResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          checkedAt: explicitProbeStart,
        }),
      });
    });

    it('should guarantee network operations execute strictly outside database transactions (order verification)', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      const callSequence: string[] = [];

      httpClient.executeCheck.mockImplementation(async () => {
        callSequence.push('network:start');
        // Simulate network latency
        callSequence.push('network:end');
        return {
          statusCode: 200,
          latencyMs: 150,
          isSuccess: true,
          errorMessage: null,
          finalUrl: 'https://example.com',
          redirectHops: 0,
          resolvedIp: '93.184.216.34',
          executedAt: new Date(),
        };
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        callSequence.push('tx:begin');
        const res = await callback(txMock);
        callSequence.push('tx:commit');
        return res;
      });

      txMock.checkResult.create.mockResolvedValue(mockCheckRecord);

      await service.runMonitorCheck('mon-1');

      expect(callSequence).toEqual([
        'network:start',
        'network:end',
        'tx:begin',
        'tx:commit',
      ]);
    });

    it('should prevent duplicate check results when duplicate job execution occurs', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor);
      // Simulate race where jobId was already inserted while check was in-flight
      txMock.checkResult.findUnique.mockResolvedValue(mockCheckRecord);

      httpClient.executeCheck.mockResolvedValue({
        statusCode: 200,
        latencyMs: 100,
        isSuccess: true,
        errorMessage: null,
        finalUrl: 'https://example.com',
        redirectHops: 0,
        resolvedIp: '93.184.216.34',
        executedAt: new Date(),
      });

      const result = await service.runMonitorCheck('mon-1', 'job-concurrent-race');

      expect(result?.id).toBe(mockCheckRecord.id);
      expect(txMock.checkResult.create).not.toHaveBeenCalled();
    });
  });

  describe('enqueueManualCheck', () => {
    it('should verify ownership and enqueue manual check', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitor);
      schedulerService.enqueueManualCheck.mockResolvedValue({
        id: 'job-manual-1',
      });

      const result = await service.enqueueManualCheck('mon-1', mockUserId);

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(schedulerService.enqueueManualCheck).toHaveBeenCalledWith('mon-1');
      expect(result).toEqual({
        message: 'Check queued successfully',
        checkJobId: 'job-manual-1',
        statusUrl: '/monitors/mon-1/checks/latest',
      });
    });

    it('should throw NotFoundException if monitor not found or belongs to another user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.enqueueManualCheck('mon-999', mockUserId),
      ).rejects.toThrow(NotFoundException);
      expect(schedulerService.enqueueManualCheck).not.toHaveBeenCalled();
    });
  });

  describe('getRecentChecks', () => {
    it('should verify ownership and return checks ordered by checkedAt descending', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitor);
      prisma.checkResult.findMany.mockResolvedValue([mockCheckRecord]);

      const result = await service.getRecentChecks('mon-1', mockUserId, 10);

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(prisma.checkResult.findMany).toHaveBeenCalledWith({
        where: { monitorId: 'mon-1' },
        orderBy: { checkedAt: 'desc' },
        take: 10,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('chk-1');
    });

    it('should throw NotFoundException if monitor not found or belongs to another user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.getRecentChecks('mon-999', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLatestCheck', () => {
    it('should return latest check result if it exists', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitor);
      prisma.checkResult.findFirst.mockResolvedValue(mockCheckRecord);

      const result = await service.getLatestCheck('mon-1', mockUserId);

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(prisma.checkResult.findFirst).toHaveBeenCalledWith({
        where: { monitorId: 'mon-1' },
        orderBy: { checkedAt: 'desc' },
      });
      expect(result?.id).toBe('chk-1');
    });

    it('should return null if monitor has never been checked', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitor);
      prisma.checkResult.findFirst.mockResolvedValue(null);

      const result = await service.getLatestCheck('mon-1', mockUserId);

      expect(result).toBeNull();
    });

    it('should throw NotFoundException if monitor does not belong to user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.getLatestCheck('mon-999', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
