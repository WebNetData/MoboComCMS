-- Game authors: the same ownership and trash columns the other content sections got in 20261224120000_section_authors.
-- Additive only: no existing row changes; existing games have no recorded creator.
ALTER TABLE "GameTitle" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "GameTitle" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GameTitle" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "GameTitle" ADD COLUMN "trashedById" INTEGER;
CREATE INDEX "GameTitle_createdById_idx" ON "GameTitle"("createdById");
ALTER TABLE "GameTitle" ADD CONSTRAINT "GameTitle_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
