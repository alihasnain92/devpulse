-- AlterTable
ALTER TABLE "webhook_outbox" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhook_attempts" ALTER COLUMN "finishedAt" DROP NOT NULL;
ALTER TABLE "webhook_attempts" ALTER COLUMN "durationMs" DROP NOT NULL;
ALTER TABLE "webhook_attempts" ALTER COLUMN "outcome" SET DEFAULT 'STARTED';
ALTER TABLE "webhook_attempts" ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "webhook_outbox_status_claimedAt_idx" ON "webhook_outbox"("status", "claimedAt");
CREATE INDEX "webhook_deliveries_status_claimedAt_idx" ON "webhook_deliveries"("status", "claimedAt");
