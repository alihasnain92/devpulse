-- AlterTable: Add deletedAt and index to webhook_endpoints
ALTER TABLE "webhook_endpoints" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "webhook_endpoints_userId_deletedAt_idx" ON "webhook_endpoints"("userId", "deletedAt");

-- AlterTable: Add snapshot, origin, replay lineage, and idempotency columns to webhook_deliveries
ALTER TABLE "webhook_deliveries" ADD COLUMN "endpointName" TEXT;
ALTER TABLE "webhook_deliveries" ADD COLUMN "destinationUrl" TEXT;
ALTER TABLE "webhook_deliveries" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "webhook_deliveries" ADD COLUMN "replayOfId" TEXT;
ALTER TABLE "webhook_deliveries" ADD COLUMN "replayIdempotencyKey" TEXT;

-- Data Migration / Backfill: Populate snapshot fields from existing webhook_endpoints
UPDATE "webhook_deliveries" d
SET "endpointName" = COALESCE(e."name", 'Unknown Endpoint'),
    "destinationUrl" = COALESCE(e."url", 'https://unknown.invalid')
FROM "webhook_endpoints" e
WHERE d."endpointId" = e."id";

-- Fallback for any orphaned records if any
UPDATE "webhook_deliveries"
SET "endpointName" = 'Unknown Endpoint'
WHERE "endpointName" IS NULL;

UPDATE "webhook_deliveries"
SET "destinationUrl" = 'https://unknown.invalid'
WHERE "destinationUrl" IS NULL;

-- Make snapshot columns NOT NULL
ALTER TABLE "webhook_deliveries" ALTER COLUMN "endpointName" SET NOT NULL;
ALTER TABLE "webhook_deliveries" ALTER COLUMN "destinationUrl" SET NOT NULL;

-- Update foreign key constraint on webhook_deliveries to RESTRICT
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT IF EXISTS "webhook_deliveries_endpointId_fkey";
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add self-relation foreign key for replay lineage
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_replayOfId_fkey" FOREIGN KEY ("replayOfId") REFERENCES "webhook_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old unique constraint on (eventId, endpointId)
DROP INDEX IF EXISTS "webhook_deliveries_eventId_endpointId_key";
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT IF EXISTS "webhook_deliveries_eventId_endpointId_key";

-- Create partial unique index: enforce unique (eventId, endpointId) ONLY for AUTOMATIC deliveries
CREATE UNIQUE INDEX "webhook_deliveries_automatic_unique" ON "webhook_deliveries"("eventId", "endpointId") WHERE ("origin" = 'AUTOMATIC');

-- Create partial unique index: enforce unique replay idempotency key when provided
CREATE UNIQUE INDEX "webhook_deliveries_replay_idempotency_unique" ON "webhook_deliveries"("replayIdempotencyKey") WHERE ("replayIdempotencyKey" IS NOT NULL);

-- Create new indexes on webhook_deliveries
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt");
CREATE INDEX "webhook_deliveries_status_createdAt_idx" ON "webhook_deliveries"("status", "createdAt");
CREATE INDEX "webhook_deliveries_origin_createdAt_idx" ON "webhook_deliveries"("origin", "createdAt");
CREATE INDEX "webhook_deliveries_replayOfId_idx" ON "webhook_deliveries"("replayOfId");
CREATE INDEX "webhook_deliveries_replayIdempotencyKey_idx" ON "webhook_deliveries"("replayIdempotencyKey");
CREATE INDEX "webhook_deliveries_createdAt_idx" ON "webhook_deliveries"("createdAt");
