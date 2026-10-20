-- The template a role's new pages or articles start from in the block editor; one per role and section.
CREATE TABLE "EditorRoleTemplate" (
  "id" SERIAL NOT NULL,
  "entity" TEXT NOT NULL CHECK ("entity" IN ('pages', 'posts')),
  "roleId" INTEGER NOT NULL,
  "patternId" INTEGER NOT NULL,
  "updatedById" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EditorRoleTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EditorRoleTemplate_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EditorRoleTemplate_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "EditorPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EditorRoleTemplate_entity_roleId_key" ON "EditorRoleTemplate"("entity", "roleId");
CREATE INDEX "EditorRoleTemplate_patternId_idx" ON "EditorRoleTemplate"("patternId");
