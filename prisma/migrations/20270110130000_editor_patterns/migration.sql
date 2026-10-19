CREATE TABLE "EditorPattern" (
  "id" SERIAL NOT NULL,
  "entity" TEXT NOT NULL CHECK ("entity" IN ('pages', 'posts')),
  "kind" TEXT NOT NULL DEFAULT 'pattern' CHECK ("kind" IN ('pattern', 'template')),
  "title" TEXT NOT NULL,
  "contentDocument" TEXT NOT NULL,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EditorPattern_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EditorPattern_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "EditorPattern_entity_updatedAt_idx" ON "EditorPattern"("entity", "updatedAt");
