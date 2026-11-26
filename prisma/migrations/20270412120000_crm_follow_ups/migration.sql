CREATE TABLE "CrmFollowUp" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "assigneeId" INTEGER,
  "createdById" INTEGER,
  "title" TEXT NOT NULL,
  "dueDay" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmFollowUp_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmFollowUp_status_check" CHECK ("status" IN ('OPEN', 'DONE', 'CANCELLED')),
  CONSTRAINT "CrmFollowUp_version_check" CHECK ("version" >= 1)
);
CREATE INDEX "CrmFollowUp_userId_status_dueDay_id_idx" ON "CrmFollowUp"("userId", "status", "dueDay", "id");
