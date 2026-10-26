-- AlterTable
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'webhook_endpoints' AND column_name = 'name'
    ) THEN
        ALTER TABLE "webhook_endpoints" ADD COLUMN "name" TEXT;
    END IF;
END $$;

-- Backfill any existing webhook endpoint rows with default placeholder name
UPDATE "webhook_endpoints"
SET "name" = 'Webhook Endpoint'
WHERE "name" IS NULL OR TRIM("name") = '';

-- Enforce NOT NULL on name
ALTER TABLE "webhook_endpoints" ALTER COLUMN "name" SET NOT NULL;

-- Add description column if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'webhook_endpoints' AND column_name = 'description'
    ) THEN
        ALTER TABLE "webhook_endpoints" ADD COLUMN "description" TEXT;
    END IF;
END $$;
