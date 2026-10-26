import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorkerModule } from '../src/worker.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SchedulerService } from '../src/monitoring/queue/scheduler.service';
import { MonitoringService } from '../src/monitoring/monitoring.service';
import { MonitorsService } from '../src/monitors/monitors.service';
import { AuthService } from '../src/auth/auth.service';
import { HttpMethod } from '@devpulse/shared';

describe('Phase 3 End-to-End Live Smoke Test (devpulse_test & Redis DB 1)', () => {
  let app: any;
  let workerApp: any;
  let prisma: PrismaService;
  let scheduler: SchedulerService;
  let monitoringService: MonitoringService;
  let monitorsService: MonitorsService;
  let authService: AuthService;

  let testUserId: string;
  let monitorId: string;
  let loopbackMonId: string;
  let metadataMonId: string;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule);
    workerApp = await NestFactory.createApplicationContext(WorkerModule);

    prisma = app.get(PrismaService);
    scheduler = app.get(SchedulerService);
    monitoringService = app.get(MonitoringService);
    monitorsService = app.get(MonitorsService);
    authService = app.get(AuthService);

    // Register User
    const authResult = await authService.register({
      email: `smoke-e2e-${Date.now()}@devpulse.dev`,
      name: 'Smoke User',
      password: 'SecurePass123!',
    });
    testUserId = authResult.user.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (monitorId) await monitorsService.remove(monitorId, testUserId).catch(() => {});
      if (loopbackMonId) await monitorsService.remove(loopbackMonId, testUserId).catch(() => {});
      if (metadataMonId) await monitorsService.remove(metadataMonId, testUserId).catch(() => {});
      if (testUserId) await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    } finally {
      await app.close();
      await workerApp.close();
    }
  }, 30000);

  it('Step 1: Should create a monitor and register BullMQ recurring scheduler', async () => {
    const monitor = await monitorsService.create(testUserId, {
      name: 'Smoke Target Example',
      url: 'https://example.com',
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 8000,
      expectedStatus: 200,
    });
    monitorId = monitor.id;
    expect(monitorId).toBeDefined();

    const schedulers = await scheduler.getQueue().getJobSchedulers();
    const monitorScheduler = schedulers.find((s: { key: string }) => s.key === `monitor:${monitor.id}`);
    expect(monitorScheduler).toBeDefined();
    expect(monitorScheduler?.every).toBe(60000);
  });

  it('Step 2: Should execute check via MonitoringService and persist CheckResult with latency and status', async () => {
    const checkJobId = `smoke-job-${Date.now()}`;
    const checkResult = await monitoringService.runMonitorCheck(monitorId, checkJobId);

    expect(checkResult).not.toBeNull();
    expect(checkResult?.statusCode).toBe(200);
    expect(checkResult?.isSuccess).toBe(true);
    expect(checkResult?.latencyMs).toBeGreaterThan(0);
    expect(checkResult?.jobId).toBe(checkJobId);

    // Discovery verification
    const latest = await monitoringService.getLatestCheck(monitorId, testUserId);
    expect(latest?.id).toBe(checkResult?.id);

    const recent = await monitoringService.getRecentChecks(monitorId, testUserId, 5);
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[0].id).toBe(checkResult?.id);
  });

  it('Step 3: Should remove scheduler when monitor is paused and restore when resumed', async () => {
    // Pause
    await monitorsService.update(monitorId, testUserId, { isPaused: true });
    let schedulers = await scheduler.getQueue().getJobSchedulers();
    let sched = schedulers.find((s: { key: string }) => s.key === `monitor:${monitorId}`);
    expect(sched).toBeUndefined();

    // Verify pre-check blocks paused monitor without outbound request
    const pausedResult = await monitoringService.runMonitorCheck(monitorId, `paused-${Date.now()}`);
    expect(pausedResult).toBeNull();

    // Resume
    await monitorsService.update(monitorId, testUserId, { isPaused: false });
    schedulers = await scheduler.getQueue().getJobSchedulers();
    sched = schedulers.find((s: { key: string }) => s.key === `monitor:${monitorId}`);
    expect(sched).toBeDefined();
    expect(sched?.every).toBe(60000);
  });

  it('Step 4: Should enforce multi-layer SSRF defense blocking Loopback and Cloud Metadata', async () => {
    // Loopback target
    const loopback = await monitorsService.create(testUserId, {
      name: 'Loopback Mon',
      url: 'http://127.0.0.1:8080/admin',
    });
    loopbackMonId = loopback.id;

    const lbResult = await monitoringService.runMonitorCheck(loopback.id, `ssrf-lb-${Date.now()}`);
    expect(lbResult?.isSuccess).toBe(false);
    expect(lbResult?.statusCode).toBeNull();
    expect(lbResult?.errorMessage).toContain('SSRF_BLOCKED');
    expect(lbResult?.errorMessage).toMatch(/loopback/i);

    // Cloud Metadata target
    const metadata = await monitorsService.create(testUserId, {
      name: 'Metadata Mon',
      url: 'http://169.254.169.254/latest/meta-data',
    });
    metadataMonId = metadata.id;

    const metaResult = await monitoringService.runMonitorCheck(metadata.id, `ssrf-meta-${Date.now()}`);
    expect(metaResult?.isSuccess).toBe(false);
    expect(metaResult?.statusCode).toBeNull();
    expect(metaResult?.errorMessage).toContain('SSRF_BLOCKED');
    expect(metaResult?.errorMessage).toMatch(/link-local|cloud.*metadata/i);
  });

  it('Step 5: Should enforce idempotency when retrying with existing jobId', async () => {
    const fixedJobId = `fixed-job-${Date.now()}`;
    const firstRun = await monitoringService.runMonitorCheck(monitorId, fixedJobId);
    expect(firstRun).not.toBeNull();

    const secondRun = await monitoringService.runMonitorCheck(monitorId, fixedJobId);
    expect(secondRun?.id).toBe(firstRun?.id);
    expect(secondRun?.jobId).toBe(fixedJobId);
  });
});
