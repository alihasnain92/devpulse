import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from './generated/client/client';

// Simple deterministic PRNG (Linear Congruential Generator)
function createPrng(seed = 424242) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for seeding.');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Starting DevPulse demonstration data seed...');

  const demoEmail = process.env.DEMO_EMAIL || 'demo@devpulse.dev';
  const demoPassword = process.env.DEMO_PASSWORD || 'Password123!';
  const demoName = 'DevPulse Demo User';

  const hashedPassword = await bcrypt.hash(demoPassword, 12);

  // 1. Upsert Demo User
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: demoName,
      hashedPassword,
    },
    create: {
      email: demoEmail,
      name: demoName,
      hashedPassword,
    },
  });

  console.log(`👤 Demo User: ${demoUser.email} (ID: ${demoUser.id})`);

  // 2. Idempotent cleanup of prior demo monitors, checks, and incidents
  const existingDemoMonitors = await prisma.monitor.findMany({
    where: {
      userId: demoUser.id,
      isSeeded: true,
    },
    select: { id: true },
  });

  const existingIds = existingDemoMonitors.map((m) => m.id);
  if (existingIds.length > 0) {
    const deletedChecks = await prisma.checkResult.deleteMany({
      where: {
        monitorId: { in: existingIds },
        isSeeded: true,
      },
    });
    const deletedIncidents = await prisma.incident.deleteMany({
      where: {
        monitorId: { in: existingIds },
        isSeeded: true,
      },
    });
    const deletedMonitors = await prisma.monitor.deleteMany({
      where: {
        id: { in: existingIds },
        isSeeded: true,
      },
    });
    console.log(
      `🧹 Cleaned prior demo state: ${deletedMonitors.count} monitors, ${deletedChecks.count} checks, ${deletedIncidents.count} incidents.`,
    );
  }

  // 3. Create Demo Monitors
  const monitorDefinitions = [
    {
      name: 'Primary API Gateway',
      url: 'https://example.com/api/v1/health',
      method: 'GET' as const,
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatus: 200,
      isPaused: false,
      isSeeded: true,
      baseLatency: 65,
      jitter: 18,
      spikeChance: 0.05,
      spikeMultiplier: 2.2,
      errorRate: 0.005,
    },
    {
      name: 'Auth & Identity Service',
      url: 'https://example.com/auth/health',
      method: 'GET' as const,
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatus: 200,
      isPaused: false,
      isSeeded: true,
      baseLatency: 35,
      jitter: 10,
      spikeChance: 0.03,
      spikeMultiplier: 2.0,
      errorRate: 0.002,
    },
    {
      name: 'Payment Webhook Processor',
      url: 'https://example.com/webhooks/payment',
      method: 'HEAD' as const,
      intervalSeconds: 120,
      timeoutMs: 10000,
      expectedStatus: 200,
      isPaused: false,
      isSeeded: true,
      baseLatency: 145,
      jitter: 35,
      spikeChance: 0.08,
      spikeMultiplier: 2.5,
      errorRate: 0.01,
    },
    {
      name: 'Docs & Developer Portal',
      url: 'https://example.com/docs',
      method: 'GET' as const,
      intervalSeconds: 300,
      timeoutMs: 5000,
      expectedStatus: 200,
      isPaused: true,
      isSeeded: true,
      baseLatency: 22,
      jitter: 5,
      spikeChance: 0.01,
      spikeMultiplier: 1.5,
      errorRate: 0.0,
    },
  ];

  const createdMonitors = [];
  for (const def of monitorDefinitions) {
    const mon = await prisma.monitor.create({
      data: {
        userId: demoUser.id,
        name: def.name,
        url: def.url,
        method: def.method,
        intervalSeconds: def.intervalSeconds,
        timeoutMs: def.timeoutMs,
        expectedStatus: def.expectedStatus,
        isPaused: def.isPaused,
        isSeeded: def.isSeeded,
      },
    });
    createdMonitors.push({ ...mon, def });
  }

  console.log(`📡 Created ${createdMonitors.length} demo monitors.`);

  // 4. Generate 30 Days of Deterministic Check Results
  const now = new Date();
  const prng = createPrng(987654321);

  // Time boundaries for incidents on Payment Webhook Processor (Monitor index 2)
  const paymentMon = createdMonitors[2];

  // Incident 1: 5 days ago, duration 18 minutes
  const inc1Start = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const inc1End = new Date(inc1Start.getTime() + 18 * 60 * 1000);

  // Incident 2: 18 days ago, duration 14 minutes
  const inc2Start = new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000);
  const inc2End = new Date(inc2Start.getTime() + 14 * 60 * 1000);

  const allChecks: Array<{
    monitorId: string;
    statusCode: number | null;
    latencyMs: number;
    isSuccess: boolean;
    errorMessage: string | null;
    isSeeded: boolean;
    checkedAt: Date;
  }> = [];

  // Generate check timestamps:
  // Last 24 hours: every 15 minutes
  // Days 2 to 30: every 2 hours
  const checkTimestamps: Date[] = [];

  // 1. Last 24 hours: 96 steps
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    checkTimestamps.push(new Date(now.getTime() - mins * 60 * 1000));
  }

  // 2. Days 2 to 30: every 2 hours
  for (let hours = 25; hours <= 30 * 24; hours += 2) {
    checkTimestamps.push(new Date(now.getTime() - hours * 60 * 60 * 1000));
  }

  // Sort timestamps ascending
  checkTimestamps.sort((a, b) => a.getTime() - b.getTime());

  for (const item of createdMonitors) {
    const { id: monitorId, def } = item;

    for (const timestamp of checkTimestamps) {
      const rand = prng();
      let isSuccess = true;
      let statusCode: number | null = def.expectedStatus;
      let errorMessage: string | null = null;
      let latencyMs = Math.round(
        def.baseLatency + (prng() * 2 - 1) * def.jitter,
      );

      // Check if inside simulated incident window for Payment Webhook
      if (monitorId === paymentMon.id) {
        if (timestamp >= inc1Start && timestamp <= inc1End) {
          isSuccess = false;
          statusCode = 503;
          latencyMs = Math.round(def.baseLatency * 3 + prng() * 50);
          errorMessage =
            'Target host returned HTTP 503 Service Unavailable (connection pool exhausted)';
        } else if (timestamp >= inc2Start && timestamp <= inc2End) {
          isSuccess = false;
          statusCode = null;
          latencyMs = def.timeoutMs;
          errorMessage = `Check timed out after ${def.timeoutMs}ms while connecting`;
        }
      }

      // Normal random errors / latency spikes outside incident windows
      if (isSuccess && def.errorRate > 0 && rand < def.errorRate) {
        isSuccess = false;
        statusCode = 502;
        errorMessage = 'Target host returned HTTP 502 Bad Gateway';
        latencyMs = Math.round(def.baseLatency * 2.2);
      } else if (isSuccess && prng() < def.spikeChance) {
        // High-percentile latency spike (p95/p99)
        latencyMs = Math.round(latencyMs * def.spikeMultiplier);
      }

      // Ensure latency is at least 5ms
      latencyMs = Math.max(5, latencyMs);

      allChecks.push({
        monitorId,
        statusCode,
        latencyMs,
        isSuccess,
        errorMessage,
        isSeeded: true,
        checkedAt: timestamp,
      });
    }
  }

  // Insert checks in chunks
  const chunkSize = 500;
  for (let i = 0; i < allChecks.length; i += chunkSize) {
    const chunk = allChecks.slice(i, i + chunkSize);
    await prisma.checkResult.createMany({
      data: chunk,
    });
  }

  console.log(`📊 Persisted ${allChecks.length} historical check results across 30 days.`);

  // 5. Create Historical Resolved Incidents for Payment Webhook Monitor
  const inc1 = await prisma.incident.create({
    data: {
      monitorId: paymentMon.id,
      startedAt: inc1Start,
      resolvedAt: inc1End,
      cause:
        'Target host returned HTTP 503 Service Unavailable (connection pool exhausted)',
      isResolved: true,
      isSeeded: true,
    },
  });

  const inc2 = await prisma.incident.create({
    data: {
      monitorId: paymentMon.id,
      startedAt: inc2Start,
      resolvedAt: inc2End,
      cause: 'Check timed out after 10000ms while connecting',
      isResolved: true,
      isSeeded: true,
    },
  });

  console.log(`🚨 Persisted 2 resolved historical incidents:`);
  console.log(`   - [${inc1.id}] Started: ${inc1Start.toISOString()}, Duration: 18m`);
  console.log(`   - [${inc2.id}] Started: ${inc2Start.toISOString()}, Duration: 14m`);

  console.log('✅ Demo data seeding completed successfully!');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
