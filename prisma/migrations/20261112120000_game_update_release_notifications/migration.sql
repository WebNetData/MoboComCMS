CREATE TABLE "GameUpdateReleaseNotification" (
    "updateId" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastUserId" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GameUpdateReleaseNotification_pkey" PRIMARY KEY ("updateId")
);

CREATE INDEX "GameUpdateReleaseNotification_completedAt_dueAt_idx" ON "GameUpdateReleaseNotification"("completedAt", "dueAt");

ALTER TABLE "GameUpdateReleaseNotification" ADD CONSTRAINT "GameUpdateReleaseNotification_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "GameUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing future releases were planned before this cursor existed. Past
-- releases are intentionally not backfilled to avoid surprise bulk notices.
INSERT INTO "GameUpdateReleaseNotification" ("updateId", "dueAt")
SELECT "id", "releasedAt" FROM "GameUpdate" WHERE "releasedAt" > CURRENT_TIMESTAMP;
