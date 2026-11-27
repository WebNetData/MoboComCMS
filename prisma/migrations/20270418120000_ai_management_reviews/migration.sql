CREATE TABLE "AiManagementSchedule" (
    "ownerId" INTEGER NOT NULL,
    "cadence" TEXT NOT NULL,
    "authAt" DOUBLE PRECISION,
    "authMethod" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiManagementSchedule_pkey" PRIMARY KEY ("ownerId"),
    CONSTRAINT "AiManagementSchedule_cadence_check" CHECK (
        ("cadence" = 'OFF' AND "nextRunAt" IS NULL) OR
        ("cadence" IN ('DAILY', 'WEEKLY') AND "nextRunAt" IS NOT NULL)
    ),
    CONSTRAINT "AiManagementSchedule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiManagementReview" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AiManagementReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiManagementReview_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiManagementSchedule_nextRunAt_idx" ON "AiManagementSchedule"("nextRunAt");
CREATE UNIQUE INDEX "AiManagementReview_ownerId_slot_key" ON "AiManagementReview"("ownerId", "slot");
CREATE INDEX "AiManagementReview_ownerId_checkedAt_id_idx" ON "AiManagementReview"("ownerId", "checkedAt", "id");
