-- CreateTable
CREATE TABLE "DownloadJob" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "storageId" TEXT NOT NULL DEFAULT 'local',
    "dir" TEXT NOT NULL DEFAULT '/',
    "name" TEXT NOT NULL DEFAULT '',
    "params" TEXT NOT NULL DEFAULT '{}',
    "total" DOUBLE PRECISION,
    "received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DownloadJob_status_createdAt_idx" ON "DownloadJob"("status", "createdAt");
