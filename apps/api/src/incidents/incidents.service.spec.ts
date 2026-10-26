import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { PrismaService } from '../prisma/prisma.service';

describe('IncidentsService (Unit)', () => {
  let service: IncidentsService;
  let prisma: {
    incident: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    monitor: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    checkResult: {
      findMany: jest.Mock;
    };
  };

  const mockDate = new Date('2026-10-26T12:00:00.000Z');
  const mockUserId = 'user-test-123';
  const mockMonitorId = 'mon-101';

  beforeEach(async () => {
    prisma = {
      incident: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      monitor: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      checkResult: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  describe('evaluateIncidentTransition', () => {
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        incident: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        checkResult: {
          findMany: jest.fn(),
        },
      };
    });

    it('Scenario 1: First failure should not create an incident', async () => {
      // No active incident
      mockTx.incident.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      // Only 1 check in streak
      mockTx.checkResult.findMany.mockResolvedValue([
        { id: 'chk-1', isSuccess: false, checkedAt: new Date() },
      ]);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-1',
          isSuccess: false,
          statusCode: 503,
          errorMessage: 'HTTP 503 response received (Expected 200)',
          checkedAt: new Date(),
        },
        200,
      );

      expect(result).toBeNull();
      expect(mockTx.incident.create).not.toHaveBeenCalled();
    });

    it('Scenario 2: Second consecutive failure should not create an incident', async () => {
      mockTx.incident.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      // 2 checks in streak (< 3)
      mockTx.checkResult.findMany.mockResolvedValue([
        { id: 'chk-2', isSuccess: false, checkedAt: new Date() },
        { id: 'chk-1', isSuccess: false, checkedAt: new Date(Date.now() - 60000) },
      ]);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-2',
          isSuccess: false,
          statusCode: 503,
          errorMessage: 'HTTP 503',
          checkedAt: new Date(),
        },
        200,
      );

      expect(result).toBeNull();
      expect(mockTx.incident.create).not.toHaveBeenCalled();
    });

    it('Scenario 3: Third consecutive failure should create exactly one incident', async () => {
      mockTx.incident.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const t0 = new Date('2026-10-26T12:00:00.000Z');
      const t1 = new Date('2026-10-26T12:01:00.000Z');
      const t2 = new Date('2026-10-26T12:02:00.000Z');

      // 3 consecutive failed checks
      mockTx.checkResult.findMany.mockResolvedValue([
        { id: 'chk-3', isSuccess: false, checkedAt: t2 },
        { id: 'chk-2', isSuccess: false, checkedAt: t1 },
        { id: 'chk-1', isSuccess: false, checkedAt: t0 },
      ]);

      const createdIncident = {
        id: 'inc-1',
        monitorId: mockMonitorId,
        startedAt: t0,
        resolvedAt: null,
        cause: 'HTTP 503 response received (Expected 200)',
        isResolved: false,
        isSeeded: false,
      };
      mockTx.incident.create.mockResolvedValue(createdIncident);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-3',
          isSuccess: false,
          statusCode: 503,
          errorMessage: null,
          checkedAt: t2,
        },
        200,
      );

      expect(mockTx.incident.create).toHaveBeenCalledWith({
        data: {
          monitorId: mockMonitorId,
          startedAt: t0, // Starts at earliest check of the 3-failure streak
          isResolved: false,
          resolvedAt: null,
          cause: 'HTTP 503 response received (Expected 200)',
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe('inc-1');
      expect(result?.state).toBe('ongoing');
      expect(result?.isResolved).toBe(false);
      expect(result?.cause).toContain('HTTP 503');
    });

    it('Scenario 4: Further failures while an incident is active should not create duplicates', async () => {
      const activeIncident = {
        id: 'inc-existing',
        monitorId: mockMonitorId,
        startedAt: mockDate,
        resolvedAt: null,
        cause: 'HTTP 500',
        isResolved: false,
        isSeeded: false,
      };

      // Open incident already exists
      mockTx.incident.findFirst.mockResolvedValue(activeIncident);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-4',
          isSuccess: false,
          statusCode: 500,
          errorMessage: null,
          checkedAt: new Date(),
        },
        200,
      );

      expect(mockTx.incident.create).not.toHaveBeenCalled();
      expect(result?.id).toBe('inc-existing');
      expect(result?.state).toBe('ongoing');
    });

    it('Scenario 5: Success check without an open incident should not create or modify incidents', async () => {
      mockTx.incident.findFirst.mockResolvedValue(null);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-pass',
          isSuccess: true,
          statusCode: 200,
          errorMessage: null,
          checkedAt: new Date(),
        },
        200,
      );

      expect(result).toBeNull();
      expect(mockTx.incident.create).not.toHaveBeenCalled();
      expect(mockTx.incident.update).not.toHaveBeenCalled();
    });

    it('Scenario 6: Success check with an open incident should resolve the incident', async () => {
      const startedAt = new Date('2026-10-26T12:00:00.000Z');
      const resolvedAt = new Date('2026-10-26T12:05:00.000Z');

      const activeIncident = {
        id: 'inc-to-resolve',
        monitorId: mockMonitorId,
        startedAt,
        resolvedAt: null,
        cause: 'Connection Refused',
        isResolved: false,
        isSeeded: false,
      };

      mockTx.incident.findFirst.mockResolvedValue(activeIncident);

      const resolvedIncident = {
        ...activeIncident,
        isResolved: true,
        resolvedAt,
      };
      mockTx.incident.update.mockResolvedValue(resolvedIncident);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-recovery',
          isSuccess: true,
          statusCode: 200,
          errorMessage: null,
          checkedAt: resolvedAt,
        },
        200,
      );

      expect(mockTx.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-to-resolve' },
        data: {
          isResolved: true,
          resolvedAt,
        },
      });

      expect(result).toBeDefined();
      expect(result?.state).toBe('resolved');
      expect(result?.isResolved).toBe(true);
      expect(result?.resolvedAt).toBe(resolvedAt.toISOString());
      expect(result?.durationSeconds).toBe(300); // 5 minutes = 300s
    });

    it('Scenario 7: Stale recovery check timestamped prior to incident start should NOT resolve the incident', async () => {
      const incidentStartedAt = new Date('2026-10-26T12:05:00.000Z');
      const staleCheckTime = new Date('2026-10-26T12:01:00.000Z'); // older than incident start!

      const activeIncident = {
        id: 'inc-active',
        monitorId: mockMonitorId,
        startedAt: incidentStartedAt,
        resolvedAt: null,
        cause: 'DNS Resolution Failed',
        isResolved: false,
        isSeeded: false,
      };

      mockTx.incident.findFirst.mockResolvedValue(activeIncident);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-stale',
          isSuccess: true,
          statusCode: 200,
          errorMessage: null,
          checkedAt: staleCheckTime,
        },
        200,
      );

      expect(result).toBeNull();
      expect(mockTx.incident.update).not.toHaveBeenCalled();
    });

    it('Scenario 8: P2002 unique constraint collision on open incident is caught safely', async () => {
      mockTx.incident.findFirst
        .mockResolvedValueOnce(null) // first check: no incident seen
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'inc-race',
          monitorId: mockMonitorId,
          startedAt: mockDate,
          resolvedAt: null,
          cause: 'Timeout',
          isResolved: false,
          isSeeded: false,
        });

      mockTx.checkResult.findMany.mockResolvedValue([
        { id: 'c3', isSuccess: false, checkedAt: new Date() },
        { id: 'c2', isSuccess: false, checkedAt: new Date() },
        { id: 'c1', isSuccess: false, checkedAt: new Date() },
      ]);

      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      mockTx.incident.create.mockRejectedValue(p2002);

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-race',
          isSuccess: false,
          statusCode: 504,
          errorMessage: 'Gateway Timeout',
          checkedAt: new Date(),
        },
        200,
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('inc-race');
    });

    it('Scenario 9: Recovery check timestamped after incident start resolves it when current rules permit', async () => {
      const incidentStartedAt = new Date('2026-10-26T12:00:00.000Z');
      const freshCheckTime = new Date('2026-10-26T12:03:00.000Z'); // 3 minutes after incident start

      const activeIncident = {
        id: 'inc-resolvable',
        monitorId: mockMonitorId,
        startedAt: incidentStartedAt,
        resolvedAt: null,
        cause: 'Timeout',
        isResolved: false,
        isSeeded: false,
      };

      mockTx.incident.findFirst.mockResolvedValue(activeIncident);
      mockTx.incident.update.mockResolvedValue({
        ...activeIncident,
        isResolved: true,
        resolvedAt: freshCheckTime,
      });

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-fresh-recovery',
          isSuccess: true,
          statusCode: 200,
          errorMessage: null,
          checkedAt: freshCheckTime,
        },
        200,
      );

      expect(mockTx.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-resolvable' },
        data: {
          isResolved: true,
          resolvedAt: freshCheckTime,
        },
      });
      expect(result?.isResolved).toBe(true);
      expect(result?.state).toBe('resolved');
      expect(result?.resolvedAt).toBe(freshCheckTime.toISOString());
    });

    it('Scenario 10: Out-of-order check results sorted by checkedAt do not incorrectly alter the consecutive failure streak', async () => {
      mockTx.incident.findFirst.mockResolvedValue(null);

      const t0 = new Date('2026-10-26T12:00:00.000Z');
      const t1 = new Date('2026-10-26T12:01:00.000Z');
      const t2 = new Date('2026-10-26T12:02:00.000Z');

      // Regardless of insertion order, the query must order by checkedAt DESC
      mockTx.checkResult.findMany.mockImplementation(async (args) => {
        expect(args.orderBy).toEqual([{ checkedAt: 'desc' }, { id: 'desc' }]);
        // Return results properly sorted by checkedAt desc: t2 (fail), t1 (pass), t0 (fail)
        return [
          { id: 'chk-t2', isSuccess: false, checkedAt: t2 },
          { id: 'chk-t1', isSuccess: true, checkedAt: t1 }, // streak broken!
          { id: 'chk-t0', isSuccess: false, checkedAt: t0 },
        ];
      });

      const result = await service.evaluateIncidentTransition(
        mockTx,
        mockMonitorId,
        {
          id: 'chk-t2',
          isSuccess: false,
          statusCode: 500,
          errorMessage: null,
          checkedAt: t2,
        },
        200,
      );

      // Since streak has a success at t1, 3 consecutive failures is NOT reached
      expect(result).toBeNull();
      expect(mockTx.incident.create).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeCause', () => {
    it('should format HTTP status mismatch cleanly', () => {
      const cause = service.sanitizeCause(null, 502, 200);
      expect(cause).toBe('HTTP 502 response received (Expected 200)');
    });

    it('should redact embedded credentials from error messages', () => {
      const raw =
        'Failed to connect to http://admin:secret123@api.internal/health: ECONNREFUSED';
      const cause = service.sanitizeCause(raw, null, 200);
      expect(cause).not.toContain('secret123');
      expect(cause).toContain('http://[REDACTED]@');
    });

    it('should redact auth tokens and cookies', () => {
      const raw =
        'Error with bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and devpulse_access_token=xyz';
      const cause = service.sanitizeCause(raw, null, 200);
      expect(cause).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(cause).not.toContain('devpulse_access_token=xyz');
    });
  });

  describe('findAllForUser', () => {
    it('should return empty list if user has no monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);

      const result = await service.findAllForUser(mockUserId);

      expect(result).toEqual([]);
      expect(prisma.incident.findMany).not.toHaveBeenCalled();
    });

    it('should return incidents scoped strictly to user monitors with monitorName and durations', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-1', name: 'Auth API' },
      ]);

      const startedAt = new Date('2026-10-26T12:00:00.000Z');
      const resolvedAt = new Date('2026-10-26T12:10:00.000Z');

      prisma.incident.findMany.mockResolvedValue([
        {
          id: 'inc-1',
          monitorId: 'mon-1',
          startedAt,
          resolvedAt,
          cause: 'HTTP 500',
          isResolved: true,
          isSeeded: false,
        },
      ]);

      const result = await service.findAllForUser(mockUserId);

      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            monitorId: { in: ['mon-1'] },
          }),
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0].monitorName).toBe('Auth API');
      expect(result[0].state).toBe('resolved');
      expect(result[0].durationSeconds).toBe(600); // 10 minutes = 600s
    });
  });

  describe('findAllForMonitor', () => {
    it('should throw NotFoundException if monitor does not belong to user', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.findAllForMonitor('other-mon', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if incident belongs to another user', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc-foreign',
        monitor: { userId: 'other-user', name: 'Foreign Mon' },
      });

      await expect(
        service.findOne('inc-foreign', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return incident if owned by user', async () => {
      const startedAt = new Date();
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc-owned',
        monitorId: 'mon-1',
        startedAt,
        resolvedAt: null,
        cause: 'Timeout',
        isResolved: false,
        isSeeded: false,
        monitor: { userId: mockUserId, name: 'My Monitor' },
      });

      const result = await service.findOne('inc-owned', mockUserId);

      expect(result.id).toBe('inc-owned');
      expect(result.monitorName).toBe('My Monitor');
      expect(result.state).toBe('ongoing');
    });
  });
});
