import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MONITOR_JOB_NAMES } from './queue.constants';

const mockQueueInstance = {
  upsertJobScheduler: jest.fn().mockResolvedValue({}),
  removeJobScheduler: jest.fn().mockResolvedValue(true),
  getJobSchedulers: jest.fn().mockResolvedValue([]),
  add: jest.fn().mockResolvedValue({ id: 'job-999' }),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueueInstance),
}));

describe('SchedulerService (Unit)', () => {
  let service: SchedulerService;
  let prisma: {
    monitor: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      monitor: {
        findMany: jest.fn(),
      },
    };

    mockQueueInstance.upsertJobScheduler.mockResolvedValue({});
    mockQueueInstance.removeJobScheduler.mockResolvedValue(true);
    mockQueueInstance.getJobSchedulers.mockResolvedValue([]);
    mockQueueInstance.add.mockResolvedValue({ id: 'job-999' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('scheduleMonitor', () => {
    it('should register job scheduler in BullMQ with every in ms and monitorId data', async () => {
      await service.scheduleMonitor({ id: 'mon-101', intervalSeconds: 90 });

      expect(mockQueueInstance.upsertJobScheduler).toHaveBeenCalledWith(
        'monitor:mon-101',
        { every: 90000 },
        {
          name: MONITOR_JOB_NAMES.SCHEDULED_CHECK,
          data: { monitorId: 'mon-101' },
        },
      );
    });
  });

  describe('removeMonitorSchedule', () => {
    it('should call removeJobScheduler with the monitor key', async () => {
      mockQueueInstance.removeJobScheduler.mockResolvedValue(true);

      const result = await service.removeMonitorSchedule('mon-101');

      expect(mockQueueInstance.removeJobScheduler).toHaveBeenCalledWith(
        'monitor:mon-101',
      );
      expect(result).toBe(true);
    });

    it('should catch errors and return false if removal fails', async () => {
      mockQueueInstance.removeJobScheduler.mockRejectedValue(
        new Error('Redis timeout'),
      );

      const result = await service.removeMonitorSchedule('mon-101');

      expect(result).toBe(false);
    });
  });

  describe('enqueueManualCheck', () => {
    it('should enqueue job with priority 1 and return job ID', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'manual-job-42' });

      const result = await service.enqueueManualCheck('mon-101');

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        MONITOR_JOB_NAMES.MANUAL_CHECK,
        { monitorId: 'mon-101', isManual: true },
        expect.objectContaining({ priority: 1 }),
      );
      expect(result).toEqual({ id: 'manual-job-42' });
    });
  });

  describe('reconcileSchedulers', () => {
    it('should remove orphan schedulers, add missing ones, and update mismatched intervals', async () => {
      // Database has 2 active monitors: m1 (60s) and m2 (120s)
      prisma.monitor.findMany.mockResolvedValue([
        { id: 'm1', intervalSeconds: 60 },
        { id: 'm2', intervalSeconds: 120 },
      ]);

      // BullMQ currently has:
      // - m1 with 60000ms (correct)
      // - m2 with 30000ms (stale interval -> needs update)
      // - m3 with 60000ms (orphan/paused -> needs removal)
      mockQueueInstance.getJobSchedulers.mockResolvedValue([
        { key: 'monitor:m1', every: 60000 },
        { key: 'monitor:m2', every: 30000 },
        { key: 'monitor:m3', every: 60000 },
      ]);

      const stats = await service.reconcileSchedulers();

      expect(stats).toEqual({
        added: 0,
        removed: 1,
        updated: 1,
        totalActive: 2,
      });

      // m3 was removed
      expect(mockQueueInstance.removeJobScheduler).toHaveBeenCalledWith(
        'monitor:m3',
      );

      // m2 was updated with new interval (120000ms)
      expect(mockQueueInstance.upsertJobScheduler).toHaveBeenCalledWith(
        'monitor:m2',
        { every: 120000 },
        expect.anything(),
      );

      // m1 was untouched
      expect(mockQueueInstance.upsertJobScheduler).not.toHaveBeenCalledWith(
        'monitor:m1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should add missing schedulers if none exist yet', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        { id: 'm1', intervalSeconds: 60 },
      ]);
      mockQueueInstance.getJobSchedulers.mockResolvedValue([]);

      const stats = await service.reconcileSchedulers();

      expect(stats).toEqual({
        added: 1,
        removed: 0,
        updated: 0,
        totalActive: 1,
      });

      expect(mockQueueInstance.upsertJobScheduler).toHaveBeenCalledWith(
        'monitor:m1',
        { every: 60000 },
        expect.anything(),
      );
    });
  });
});
