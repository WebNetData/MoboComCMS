-- Additive: existing artist addresses and profile data are kept.
CREATE TABLE "CelebritySlugAlias" (
    "slug" TEXT NOT NULL,
    "celebrityId" INTEGER NOT NULL,
    CONSTRAINT "CelebritySlugAlias_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "CelebritySlugAlias_celebrityId_fkey" FOREIGN KEY ("celebrityId") REFERENCES "Celebrity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CelebritySlugAlias_celebrityId_idx" ON "CelebritySlugAlias"("celebrityId");
