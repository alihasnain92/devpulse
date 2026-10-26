import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AUTH_COOKIES, SECURITY_CONFIG } from '@devpulse/shared';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentsService } from './incidents.service';
import { SchedulerService } from '../monitoring/queue/scheduler.service';

describe('Incidents Detection & Recovery (Integration - Isolated devpulse_test)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let incidentsService: IncidentsService;

  const userA = {
    email: `incident-user-a-${Date.now()}@devpulse.dev`,
    name: 'Incident User A',
    password: 'Password123!Secure',
  };

  const userB = {
    email: `incident-user-b-${Date.now()}@devpulse.dev`,
    name: 'Incident User B',
    password: 'Password123!Secure',
  };

  const CSRF_HEADERS = {
    [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    Origin: 'http://localhost:3000',
  };

  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;
  let monitorAId: string;
  let monitorBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    incidentsService = app.get<IncidentsService>(IncidentsService);

    // Register User A
    const resA = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userA);
    expect(resA.status).toBe(201);
    userAId = resA.body.user.id;
    const cookiesA = resA.headers['set-cookie'];
    const accessCookieA = cookiesA.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userACookie = accessCookieA.split(';')[0];

    // Register User B
    const resB = await request(app.getHttpServer())
      .post('/auth/register')
      .set(CSRF_HEADERS)
      .send(userB);
    expect(resB.status).toBe(201);
    userBId = resB.body.user.id;
    const cookiesB = resB.headers['set-cookie'];
    const accessCookieB = cookiesB.find((c: string) =>
      c.startsWith(`${AUTH_COOKIES.ACCESS_TOKEN}=`),
    );
    userBCookie = accessCookieB.split(';')[0];

    // Create Monitor for User A
    const monResA = await request(app.getHttpServer())
      .post('/monitors')
      .set('Cookie', [userACookie])
      .set(CSRF_HEADERS)
      .send({
        name: 'Alpha Service',
        url: 'https://alpha.example.com/api',
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatus: 200,
      });
    expect(monResA.status).toBe(201);
    monitorAId = monResA.body.id;

    // Create Monitor for User B
    const monResB = await request(app.getHttpServer())
      .post('/monitors')
      .set('Cookie', [userBCookie])
      .set(CSRF_HEADERS)
      .send({
        name: 'Beta Service',
        url: 'https://beta.example.com/health',
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatus: 200,
      });
    expect(monResB.status).toBe(201);
    monitorBId = monResB.body.id;

    // Pause both monitors and remove recurring schedulers so background workers do not interfere with tests
    const schedulerService = app.get<SchedulerService>(SchedulerService);
    await schedulerService.removeMonitorSchedule(monitorAId);
    await schedulerService.removeMonitorSchedule(monitorBId);
    await prisma.monitor.updateMany({
      where: { id: { in: [monitorAId, monitorBId] } },
      data: { isPaused: true },
    });
    await prisma.checkResult.deleteMany({
      where: { monitorId: { in: [monitorAId, monitorBId] } },
    });
    await prisma.incident.deleteMany({
      where: { monitorId: { in: [monitorAId, monitorBId] } },
    });
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          id: { in: [userAId, userBId].filter(Boolean) },
        },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  // Helper to record a check result directly via transaction with incident evaluation
  async function recordCheck(
    monitorId: string,
    isSuccess: boolean,
    statusCode: number | null,
    errorMessage: string | null,
    timestamp: Date = new Date(),
  ) {
    return prisma.$transaction(async (tx) => {
      const lockedMon = await tx.$queryRaw<Array<{ id: string; expectedStatus: number }>>`
        SELECT id, "expectedStatus" FROM "monitors" WHERE id = ${monitorId} FOR UPDATE
      `;
      if (!lockedMon || lockedMon.length === 0) {
        throw new Error('Monitor not found');
      }

      const check = await tx.checkResult.create({
        data: {
          monitorId,
          isSuccess,
          statusCode,
          latencyMs: isSuccess ? 120 : 0,
          errorMessage,
          checkedAt: timestamp,
        },
      });

      const incident = await incidentsService.evaluateIncidentTransition(
        tx,
        monitorId,
        check,
        lockedMon[0].expectedStatus,
      );

      return { check, incident };
    });
  }

  describe('3-Consecutive-Failure Incident Lifecycle', () => {
    let incidentId: string;
    let baseTime: number;

    beforeAll(async () => {
      baseTime = Date.now();
      await prisma.checkResult.deleteMany({
        where: { monitorId: monitorAId },
      });
      await prisma.incident.deleteMany({
        where: { monitorId: monitorAId },
      });
    });

    it('1st failure: does not create an incident', async () => {
      const { incident } = await recordCheck(
        monitorAId,
        false,
        500,
        'Internal Server Error with sensitive Authorization: Bearer secret-tok',
        new Date(baseTime + 1000),
      );

      expect(incident).toBeNull();
      const openIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId, isResolved: false },
      });
      expect(openIncidents).toHaveLength(0);
    });

    it('2nd failure: does not create an incident', async () => {
      const { incident } = await recordCheck(
        monitorAId,
        false,
        null,
        'Connection timed out after 5000ms',
        new Date(baseTime + 2000),
      );

      expect(incident).toBeNull();
      const openIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId, isResolved: false },
      });
      expect(openIncidents).toHaveLength(0);
    });

    it('3rd consecutive failure: creates an active incident with sanitized cause', async () => {
      const t3 = new Date(baseTime + 3000);
      const { incident } = await recordCheck(
        monitorAId,
        false,
        null,
        'Connection failure - Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        t3,
      );

      expect(incident).not.toBeNull();
      incidentId = incident!.id;
      expect(incident?.isResolved).toBe(false);
      expect(incident?.resolvedAt).toBeNull();
      // StartedAt corresponds to the first failure in the consecutive failure streak
      expect(new Date(incident!.startedAt).toISOString()).toBe(
        new Date(baseTime + 1000).toISOString(),
      );
      expect(incident?.cause).toContain('Connection failure');
      // Crucial: ensure sensitive token was sanitized
      expect(incident?.cause).not.toContain('eyJhbGciOi');
      expect(incident?.cause).toContain('[REDACTED]');

      // Verify in database
      const dbIncident = await prisma.incident.findUnique({
        where: { id: incidentId },
      });
      expect(dbIncident).not.toBeNull();
      expect(dbIncident?.isResolved).toBe(false);
      expect(dbIncident?.resolvedAt).toBeNull();
    });

    it('4th consecutive failure: retains the single open incident without creating duplicate', async () => {
      const { incident } = await recordCheck(
        monitorAId,
        false,
        503,
        'Service Unavailable',
        new Date(baseTime + 4000),
      );

      // Transition should report the existing incident without creating a new one
      expect(incident).not.toBeNull();
      expect(incident?.id).toBe(incidentId);

      const allIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId },
      });
      expect(allIncidents).toHaveLength(1);
      expect(allIncidents[0].id).toBe(incidentId);
      expect(allIncidents[0].isResolved).toBe(false);
    });

    it('Recovery: 1 successful check resolves the active incident', async () => {
      const recoveryTime = new Date(baseTime + 5000);
      const { incident } = await recordCheck(
        monitorAId,
        true,
        200,
        null,
        recoveryTime,
      );

      expect(incident).not.toBeNull();
      expect(incident?.id).toBe(incidentId);
      expect(incident?.isResolved).toBe(true);
      expect(new Date(incident!.resolvedAt!).toISOString()).toBe(recoveryTime.toISOString());

      // Verify in database
      const dbIncident = await prisma.incident.findUnique({
        where: { id: incidentId },
      });
      expect(dbIncident?.isResolved).toBe(true);
      expect(dbIncident?.resolvedAt?.toISOString()).toBe(recoveryTime.toISOString());

      const openIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId, isResolved: false },
      });
      expect(openIncidents).toHaveLength(0);
    });

    it('Subsequent successful check does nothing to resolved incident', async () => {
      const { incident } = await recordCheck(
        monitorAId,
        true,
        200,
        null,
        new Date(baseTime + 6000),
      );

      expect(incident).toBeNull();
      const allIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId },
      });
      expect(allIncidents).toHaveLength(1);
      expect(allIncidents[0].isResolved).toBe(true);
    });

    it('Streak boundary: previous resolved failures do not leak into next streak', async () => {
      // 1st failure after recovery
      const res1 = await recordCheck(
        monitorAId,
        false,
        500,
        'Fail after recovery 1',
        new Date(baseTime + 7000),
      );
      expect(res1.incident).toBeNull();

      // 2nd failure after recovery
      const res2 = await recordCheck(
        monitorAId,
        false,
        500,
        'Fail after recovery 2',
        new Date(baseTime + 8000),
      );
      expect(res2.incident).toBeNull();

      // Verify still no new open incident
      const openIncidents = await prisma.incident.findMany({
        where: { monitorId: monitorAId, isResolved: false },
      });
      expect(openIncidents).toHaveLength(0);

      // 3rd failure after recovery -> opens second incident!
      const res3 = await recordCheck(
        monitorAId,
        false,
        500,
        'Fail after recovery 3',
        new Date(baseTime + 9000),
      );
      expect(res3.incident).not.toBeNull();
      expect(res3.incident?.isResolved).toBe(false);
      expect(res3.incident?.id).not.toBe(incidentId);

      // Clean up second incident by resolving it
      await recordCheck(
        monitorAId,
        true,
        200,
        null,
        new Date(baseTime + 10000),
      );
    });
  });

  describe('Ordering Policy: Stale checks cannot resolve or corrupt', () => {
    it('Stale check older than incident start cannot resolve active incident', async () => {
      await prisma.checkResult.deleteMany({ where: { monitorId: monitorBId } });
      await prisma.incident.deleteMany({ where: { monitorId: monitorBId } });

      const now = Date.now();
      const t1 = new Date(now + 10000);
      const t2 = new Date(now + 20000);
      const t3 = new Date(now + 30000);
      const tStale = new Date(now + 5000); // 5s prior to first failure (t1)
      const tFresh = new Date(now + 40000); // 10s after t3

      // Create an open incident on monitor B with 3 failures
      await recordCheck(monitorBId, false, 500, 'B Fail 1', t1);
      await recordCheck(monitorBId, false, 500, 'B Fail 2', t2);
      const { incident: activeInc } = await recordCheck(
        monitorBId,
        false,
        500,
        'B Fail 3',
        t3,
      );
      expect(activeInc).not.toBeNull();
      expect(activeInc?.isResolved).toBe(false);

      // An out-of-order delayed SUCCESS check timestamped before the incident started (tStale < t1)
      const staleSuccessResult = await recordCheck(
        monitorBId,
        true,
        200,
        null,
        tStale,
      );

      // Must NOT resolve the incident
      expect(staleSuccessResult.incident).toBeNull();

      const stillOpen = await prisma.incident.findUnique({
        where: { id: activeInc!.id },
      });
      expect(stillOpen?.isResolved).toBe(false);
      expect(stillOpen?.resolvedAt).toBeNull();

      // Now a fresh success check timestamped after incident start resolves it cleanly
      const freshSuccessResult = await recordCheck(
        monitorBId,
        true,
        200,
        null,
        tFresh,
      );
      expect(freshSuccessResult.incident?.isResolved).toBe(true);
    });

    it('Out-of-order check persistence maintains exact execution-time streak ordering in PostgreSQL', async () => {
      // Clean monitor B state
      await prisma.checkResult.deleteMany({ where: { monitorId: monitorBId } });
      await prisma.incident.deleteMany({ where: { monitorId: monitorBId } });

      const now = Date.now() + 100000;
      const t0 = new Date(now + 1000); // 1st failure by execution time
      const t1 = new Date(now + 2000); // 2nd failure by execution time
      const t2 = new Date(now + 3000); // 3rd failure by execution time

      // Insert out-of-order: first t2, then t0, then t1
      // Check 1: executed at t2 (inserted first)
      const resAtT2 = await recordCheck(monitorBId, false, 500, 'Fail at T2', t2);
      expect(resAtT2.incident).toBeNull(); // Only 1 failure in DB so far

      // Check 2: executed at t0 (inserted second, but oldest by timestamp)
      const resAtT0 = await recordCheck(monitorBId, false, 500, 'Fail at T0', t0);
      expect(resAtT0.incident).toBeNull(); // Only 2 failures in DB so far

      // Check 3: executed at t1 (inserted third, intermediate timestamp)
      const resAtT1 = await recordCheck(monitorBId, false, 500, 'Fail at T1', t1);
      // Now all 3 failures are in the DB: t0, t1, t2.
      // Order by checkedAt desc returns [t2, t1, t0], completing the 3-failure streak!
      expect(resAtT1.incident).not.toBeNull();
      expect(resAtT1.incident?.isResolved).toBe(false);
      // The startedAt of the incident should be t0 (the oldest failure in the streak)!
      expect(new Date(resAtT1.incident!.startedAt).getTime()).toBe(t0.getTime());

      // Clean up by resolving
      await recordCheck(monitorBId, true, 200, null, new Date(now + 4000));
    });
  });

  describe('Database CHECK Constraint Verification', () => {
    it('enforces isResolved=false requires resolvedAt=NULL', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "incidents" ("id", "monitorId", "cause", "isResolved", "startedAt", "resolvedAt", "createdAt", "updatedAt")
          VALUES (
            'test-invalid-constraint-1',
            ${monitorAId},
            'Invalid cause',
            false,
            NOW(),
            NOW(),
            NOW(),
            NOW()
          )
        `,
      ).rejects.toThrow();
    });

    it('enforces isResolved=true requires resolvedAt IS NOT NULL and resolvedAt >= startedAt', async () => {
      // resolvedAt is NULL when isResolved is true
      await expect(
        prisma.$executeRaw`
          INSERT INTO "incidents" ("id", "monitorId", "cause", "isResolved", "startedAt", "resolvedAt", "createdAt", "updatedAt")
          VALUES (
            'test-invalid-constraint-2',
            ${monitorAId},
            'Invalid cause',
            true,
            NOW(),
            NULL,
            NOW(),
            NOW()
          )
        `,
      ).rejects.toThrow();

      // resolvedAt < startedAt
      await expect(
        prisma.$executeRaw`
          INSERT INTO "incidents" ("id", "monitorId", "cause", "isResolved", "startedAt", "resolvedAt", "createdAt", "updatedAt")
          VALUES (
            'test-invalid-constraint-3',
            ${monitorAId},
            'Invalid cause',
            true,
            NOW(),
            NOW() - INTERVAL '1 hour',
            NOW(),
            NOW()
          )
        `,
      ).rejects.toThrow();
    });
  });

  describe('Tenant Isolation & REST API Endpoints', () => {
    let incidentAId: string;

    beforeAll(async () => {
      // Ensure monitor A has at least 1 incident for query testing
      const now = Date.now() + 100000;
      await recordCheck(monitorAId, false, 500, 'Fail 1', new Date(now + 100));
      await recordCheck(monitorAId, false, 500, 'Fail 2', new Date(now + 200));
      const { incident } = await recordCheck(
        monitorAId,
        false,
        500,
        'Fail 3',
        new Date(now + 300),
      );
      incidentAId = incident!.id;
    });

    it('GET /incidents: User A receives their own incidents with computed fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const found = res.body.find((inc: any) => inc.id === incidentAId);
      expect(found).toBeDefined();
      expect(found.monitorName).toBe('Alpha Service');
      expect(found.state).toBe('ongoing');
      expect(found.isResolved).toBe(false);
      expect(found.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof found.durationSeconds).toBe('number');
    });

    it('GET /incidents: User B does NOT see User A incidents (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents')
        .set('Cookie', [userBCookie]);

      expect(res.status).toBe(200);
      const userAIncidentsInB = res.body.filter((inc: any) => inc.id === incidentAId);
      expect(userAIncidentsInB).toHaveLength(0);
    });

    it('GET /incidents/:id: User A can fetch their incident details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/incidents/${incidentAId}`)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(incidentAId);
      expect(res.body.monitorId).toBe(monitorAId);
      expect(res.body.monitorName).toBe('Alpha Service');
    });

    it('GET /incidents/:id: User B receives 404 for User A incident (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/incidents/${incidentAId}`)
        .set('Cookie', [userBCookie]);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('GET /monitors/:id/incidents: User A can fetch incidents for monitor A', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/incidents`)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const inc = res.body.find((i: any) => i.id === incidentAId);
      expect(inc).toBeDefined();
    });

    it('GET /monitors/:id/incidents: User B receives 404 on User A monitor (Tenant Isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitors/${monitorAId}/incidents`)
        .set('Cookie', [userBCookie]);

      expect(res.status).toBe(404);
    });

    it('GET /incidents?status=active vs status=resolved filters properly', async () => {
      const activeRes = await request(app.getHttpServer())
        .get('/incidents?status=active')
        .set('Cookie', [userACookie]);

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.every((i: any) => !i.isResolved)).toBe(true);

      const resolvedRes = await request(app.getHttpServer())
        .get('/incidents?status=resolved')
        .set('Cookie', [userACookie]);

      expect(resolvedRes.status).toBe(200);
      expect(resolvedRes.body.every((i: any) => i.isResolved)).toBe(true);
    });
  });
});
