-- AlterTable
ALTER TABLE "check_results" ADD COLUMN "jobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "check_results_jobId_key" ON "check_results"("jobId");
