import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { MonitoringService } from '../monitoring.service';
import {
  MONITOR_CHECKS_QUEUE_NAME,
  getRedisConnectionOptions,
} from './queue.constants';

interface CheckJobData {
  monitorId: string;
  isManual?: boolean;
}

@Injectable()
export class MonitoringWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringWorkerService.name);
  private worker: Worker<CheckJobData> | null = null;

  constructor(private readonly monitoringService: MonitoringService) {}

  onModuleInit(): void {
    const connection = getRedisConnectionOptions();
    this.logger.log(
      `Initializing Monitoring BullMQ Worker on queue '${MONITOR_CHECKS_QUEUE_NAME}' (concurrency: 5)...`,
    );

    this.worker = new Worker<CheckJobData>(
      MONITOR_CHECKS_QUEUE_NAME,
      async (job: Job<CheckJobData>) => {
        const { monitorId, isManual } = job.data;
        this.logger.debug(
          `Processing job ${job.id} (${job.name}) for monitor ${monitorId} (manual: ${Boolean(isManual)})`,
        );

        if (!monitorId) {
          this.logger.warn(`Job ${job.id} has no monitorId. Discarding.`);
          return;
        }

        await this.monitoringService.runMonitorCheck(monitorId, job.id);
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(
        `Job ${job.id} (${job.name}) completed successfully for monitor ${job.data?.monitorId}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Job ${job?.id} (${job?.name}) failed for monitor ${job?.data?.monitorId}: ${err.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`BullMQ Worker encountered an error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      this.logger.log('Closing BullMQ Worker gracefully...');
      try {
        await this.worker.close();
        this.logger.log('BullMQ Worker closed successfully');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Error closing BullMQ Worker: ${message}`);
      }
    }
  }

  getWorker(): Worker<CheckJobData> | null {
    return this.worker;
  }
}
