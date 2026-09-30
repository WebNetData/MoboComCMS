-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "image" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" SERIAL NOT NULL,
    "adapter" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fileName" TEXT NOT NULL DEFAULT '',
    "fileKey" TEXT NOT NULL DEFAULT '',
    "fileHash" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT '',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "templateId" INTEGER,
    "total" INTEGER NOT NULL DEFAULT 0,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "dryRun" TEXT NOT NULL DEFAULT '',
    "createdById" INTEGER NOT NULL,
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "lockedUntil" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OK',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" INTEGER,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "changes" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportExternalRef" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'default',
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "jobId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportExternalRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMedia" (
    "id" SERIAL NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "localUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_status_updatedAt_idx" ON "ImportJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ImportJob_adapter_createdAt_idx" ON "ImportJob"("adapter", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTemplate_adapter_name_key" ON "ImportTemplate"("adapter", "name");

-- CreateIndex
CREATE INDEX "ImportRecord_jobId_status_idx" ON "ImportRecord"("jobId", "status");

-- CreateIndex
CREATE INDEX "ImportRecord_entityType_entityId_idx" ON "ImportRecord"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_jobId_index_key" ON "ImportRecord"("jobId", "index");

-- CreateIndex
CREATE INDEX "ImportExternalRef_entityType_entityId_idx" ON "ImportExternalRef"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportExternalRef_source_entityType_externalId_key" ON "ImportExternalRef"("source", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMedia_sourceHash_key" ON "ImportMedia"("sourceHash");

-- CreateIndex
CREATE INDEX "ImportMedia_contentHash_idx" ON "ImportMedia"("contentHash");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

