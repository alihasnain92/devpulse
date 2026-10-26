import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../prisma/prisma.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitorsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<MonitorsService>(MonitorsService);
  });

  describe('create', () => {
    it('should create a monitor with defaults for optional fields', async () => {
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

      expect(result.id).toBe('mon-1');
      expect(result.name).toBe('Production API');
      expect(result.createdAt).toBe(mockDate.toISOString());
    });

    it('should create a monitor with custom configuration values', async () => {
      const customRecord = {
        ...mockMonitorRecord,
        method: 'HEAD',
        intervalSeconds: 120,
        timeoutMs: 5000,
        expectedStatus: 204,
      };
      prisma.monitor.create.mockResolvedValue(customRecord);

      const result = await service.create(mockUserId, {
        name: 'Head Check',
        url: 'https://api.example.com/ping',
        method: HttpMethod.HEAD,
        intervalSeconds: 120,
        timeoutMs: 5000,
        expectedStatus: 204,
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          name: 'Head Check',
          url: 'https://api.example.com/ping',
          method: HttpMethod.HEAD,
          intervalSeconds: 120,
          timeoutMs: 5000,
          expectedStatus: 204,
        },
      });
      expect(result.method).toBe(HttpMethod.HEAD);
      expect(result.intervalSeconds).toBe(120);
    });
  });

  describe('findAll', () => {
    it('should return all monitors belonging to the authenticated user', async () => {
      prisma.monitor.findMany.mockResolvedValue([mockMonitorRecord]);

      const results = await service.findAll(mockUserId);

      expect(prisma.monitor.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mon-1');
    });
  });

  describe('findOne', () => {
    it('should return monitor if it exists and belongs to the user', async () => {
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
    it('should update monitor fields when found and owned by user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);
      const updatedRecord = {
        ...mockMonitorRecord,
        name: 'Updated Name',
        isPaused: true,
      };
      prisma.monitor.update.mockResolvedValue(updatedRecord);

      const result = await service.update('mon-1', mockUserId, {
        name: 'Updated Name',
        isPaused: true,
      });

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(prisma.monitor.update).toHaveBeenCalledWith({
        where: { id: 'mon-1' },
        data: {
          name: 'Updated Name',
          isPaused: true,
        },
      });
      expect(result.name).toBe('Updated Name');
      expect(result.isPaused).toBe(true);
    });

    it('should throw NotFoundException if trying to update unowned or non-existent monitor', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.update('mon-other', mockUserId, { name: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.monitor.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete monitor when found and owned by user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(mockMonitorRecord);
      prisma.monitor.delete.mockResolvedValue(mockMonitorRecord);

      const result = await service.remove('mon-1', mockUserId);

      expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
        where: { id: 'mon-1', userId: mockUserId },
      });
      expect(prisma.monitor.delete).toHaveBeenCalledWith({
        where: { id: 'mon-1' },
      });
      expect(result).toEqual({ message: 'Monitor deleted successfully' });
    });

    it('should throw NotFoundException if trying to delete unowned or non-existent monitor', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(service.remove('mon-other', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.monitor.delete).not.toHaveBeenCalled();
    });
  });
});
