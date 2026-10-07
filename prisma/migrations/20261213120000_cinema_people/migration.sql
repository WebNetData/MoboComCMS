-- Additive: people of films and series, and their credits. Filled from the titles' own director line and
-- cast list by the cinema-people worker step (the cast is JSON, read by the application), then kept on save.
CREATE TABLE "CinemaPerson" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CinemaPerson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaPerson_normalizedName_key" ON "CinemaPerson"("normalizedName");
CREATE TABLE "CinemaCredit" (
    "id" SERIAL NOT NULL,
    "titleId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "character" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CinemaCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaCredit_titleId_personId_role_key" ON "CinemaCredit"("titleId", "personId", "role");
CREATE INDEX "CinemaCredit_personId_role_idx" ON "CinemaCredit"("personId", "role");
ALTER TABLE "CinemaCredit" ADD CONSTRAINT "CinemaCredit_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "CinemaTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CinemaCredit" ADD CONSTRAINT "CinemaCredit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CinemaPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
