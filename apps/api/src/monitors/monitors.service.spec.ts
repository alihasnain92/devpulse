import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../monitoring/queue/scheduler.service';

describe('MonitorsService (Unit)', () => {
  let service: MonitorsService;
  let prisma: {
    monitor: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let scheduler: {
    scheduleMonitor: jest.Mock;
    removeMonitorSchedule: jest.Mock;
  };

  const mockDate = new Date('2026-10-26T12:00:00.000Z');
  const mockUserId = 'user-123';
  const mockMonitorRecord = {
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

  beforeEach(async () => {
    prisma = {
      monitor: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    scheduler = {
      scheduleMonitor: jest.fn().mockResolvedValue(undefined),
      removeMonitorSchedule: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitorsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SchedulerService,
          useValue: scheduler,
        },
      ],
    }).compile();

    service = module.get<MonitorsService>(MonitorsService);
  });

  describe('create', () => {
    it('should create a monitor with defaults for optional fields and schedule it', async () => {
      prisma.monitor.create.mockResolvedValue(mockMonitorRecord);

      const result = await service.create(mockUserId, {
        name: 'Production API',
        url: 'https://api.example.com/health',
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          name: 'Production API',
          url: 'https://api.example.com/health',
          method: HttpMethod.GET,
          intervalSeconds: MONITOR_LIMITS.DEFAULT_INTERVAL_SECONDS,
          timeoutMs: MONITOR_LIMITS.DEFAULT_TIMEOUT_MS,
          expectedStatus: MONITOR_LIMITS.DEFAULT_EXPECTED_STATUS,
        },
      });

      expect(scheduler.scheduleMonitor).toHaveBeenCalledWith({
        id: mockMonitorRecord.id,
        intervalSeconds: mockMonitorRecord.intervalSeconds,
      });

      expect(result).toEqual({
        id: 'mon-1',
        userId: mockUserId,
        name: 'Production API',
        url: 'https://api.example.com/health',
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 10000,
        expectedStatus: 200,
        isPaused: false,
        isSeeded: false,
        createdAt: mockDate.toISOString(),
        updatedAt: mockDate.toISOString(),
      });
    });

    it('should create a monitor with custom configuration', async () => {
      const customRecord = {
        ...mockMonitorRecord,
        method: 'HEAD',
        intervalSeconds: 300,
        timeoutMs: 5000,
        expectedStatus: 204,
      };
      prisma.monitor.create.mockResolvedValue(customRecord);

      const result = await service.create(mockUserId, {
        name: 'Production API',
        url: 'https://api.example.com/health',
        method: HttpMethod.HEAD,
        intervalSeconds: 300,
        timeoutMs: 5000,
        expectedStatus: 204,
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          name: 'Production API',
          url: 'https://api.example.com/health',
          method: HttpMethod.HEAD,
          intervalSeconds: 300,
          timeoutMs: 5000,
          expectedStatus: 204,
        },
      });

      expect(result.method).toBe(HttpMethod.HEAD);
      expect(result.intervalSeconds).toBe(300);
      expect(result.timeoutMs).toBe(5000);
      expect(result.expectedStatus).toBe(204);
    });
  });

  describe('findAll', () => {
    it('should return all monitors owned by user', async () => {
      prisma.monitor.findMany.mockResolvedValue([mockMonitorRecord]);

      const result = await service.findAll(mockUserId);

      expect(prisma.monitor.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mon-1');
    });
  });

  describe('findOne', () => {
    it('should return a monitor if owned by user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);

      const result = await service.findOne('mon-1', mockUserId);

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(result.id).toBe('mon-1');
    });

    it('should throw NotFoundException if monitor not found or belongs to another user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(service.findOne('mon-999', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-999', userId: mockUserId },
      });
    });
  });

  describe('update', () => {
    it('should update monitor and reschedule if interval changed', async () => {
      const updatedRecord = {
        ...mockMonitorRecord,
        intervalSeconds: 120,
      };
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);
      prisma.monitor.update.mockResolvedValue(updatedRecord);

      const result = await service.update('mon-1', mockUserId, {
        intervalSeconds: 120,
      });

      expect(prisma.monitor.update).toHaveBeenCalledWith({
        where: { id: 'mon-1' },
        data: { intervalSeconds: 120 },
      });
      expect(scheduler.scheduleMonitor).toHaveBeenCalledWith({
        id: 'mon-1',
        intervalSeconds: 120,
      });
      expect(result.intervalSeconds).toBe(120);
    });

    it('should remove schedule when monitor is paused', async () => {
      const pausedRecord = {
        ...mockMonitorRecord,
        isPaused: true,
      };
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);
      prisma.monitor.update.mockResolvedValue(pausedRecord);

      const result = await service.update('mon-1', mockUserId, {
        isPaused: true,
      });

      expect(scheduler.removeMonitorSchedule).toHaveBeenCalledWith('mon-1');
      expect(result.isPaused).toBe(true);
    });

    it('should throw NotFoundException if trying to update unowned or non-existent monitor', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.update('mon-999', mockUserId, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove schedule and delete monitor if owned by user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);
      prisma.monitor.delete.mockResolvedValue(mockMonitorRecord);

      const result = await service.remove('mon-1', mockUserId);

      expect(scheduler.removeMonitorSchedule).toHaveBeenCalledWith('mon-1');
      expect(prisma.monitor.delete).toHaveBeenCalledWith({
        where: { id: 'mon-1' },
      });
      expect(result).toEqual({ message: 'Monitor deleted successfully' });
    });

    it('should throw NotFoundException if trying to delete unowned or non-existent monitor', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(service.remove('mon-999', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.monitor.delete).not.toHaveBeenCalled();
    });
  });
});
