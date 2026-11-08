-- Additive personal browser production. Existing content/media/identity rows are untouched.
CREATE TABLE "AiProductionBatch" (
 "id" TEXT NOT NULL, "actorId" INTEGER NOT NULL, "kind" TEXT NOT NULL, "config" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PLANNED', "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AiProductionBatch_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AiProductionBatch_kind_check" CHECK ("kind" IN ('post','product','page')),
 CONSTRAINT "AiProductionBatch_status_check" CHECK ("status" IN ('PLANNED','RUNNING','PAUSED','CANCELLED','DONE')),
 CONSTRAINT "AiProductionBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AiProductionItem" (
 "id" TEXT NOT NULL, "batchId" TEXT NOT NULL, "position" INTEGER NOT NULL, "seed" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'READY', "output" TEXT NOT NULL DEFAULT '', "images" TEXT NOT NULL DEFAULT '[]',
 "lease" TEXT, "expiresAt" TIMESTAMP(3), "error" TEXT NOT NULL DEFAULT '', "saved" TEXT NOT NULL DEFAULT '',
 "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AiProductionItem_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AiProductionItem_state_check" CHECK ("state" IN ('READY','RUNNING','REVIEW','SAVED','FAILED')),
 CONSTRAINT "AiProductionItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AiProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AiProductionBatch_actorId_createdAt_idx" ON "AiProductionBatch"("actorId", "createdAt");
CREATE UNIQUE INDEX "AiProductionItem_batchId_position_key" ON "AiProductionItem"("batchId", "position");
