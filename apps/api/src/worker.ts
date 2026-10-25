import './env';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrapWorker() {
  const logger = new Logger('WorkerBootstrap');

  // Standalone application context (no HTTP server listener)
  const app = await NestFactory.createApplicationContext(WorkerModule);

  logger.log('DevPulse Standalone Background Worker process initialized');

  // Keep the worker process active awaiting background jobs
  const keepAlive = setInterval(() => {}, 60000);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    clearInterval(keepAlive);
    logger.log(`Received ${signal}, shutting down background worker gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrapWorker();
