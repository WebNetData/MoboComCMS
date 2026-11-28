ALTER TABLE "PayTerminal" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "PayTerminal" ADD CONSTRAINT "PayTerminal_archived_inactive"
  CHECK ("archivedAt" IS NULL OR NOT "active");
