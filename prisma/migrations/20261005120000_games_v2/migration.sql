-- AlterTable
ALTER TABLE "GameTitle" ADD COLUMN     "editorsChoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "engine" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "franchiseId" INTEGER,
ADD COLUMN     "gameSize" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "localization" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "modes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "playComplete" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playExtra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playMain" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "releases" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "seoDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "seoTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "storeLinks" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "verdict" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "GameFranchise" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameFranchise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUpdate" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'UPDATE',
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLibrary" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameFranchise_slug_key" ON "GameFranchise"("slug");

-- CreateIndex
CREATE INDEX "GameUpdate_gameId_releasedAt_idx" ON "GameUpdate"("gameId", "releasedAt");

-- CreateIndex
CREATE INDEX "GameLibrary_gameId_status_idx" ON "GameLibrary"("gameId", "status");

-- CreateIndex
CREATE INDEX "GameLibrary_userId_status_updatedAt_idx" ON "GameLibrary"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameLibrary_userId_gameId_key" ON "GameLibrary"("userId", "gameId");

-- CreateIndex
CREATE INDEX "GameTitle_releaseDate_idx" ON "GameTitle"("releaseDate");

-- CreateIndex
CREATE INDEX "GameTitle_franchiseId_idx" ON "GameTitle"("franchiseId");

-- AddForeignKey
ALTER TABLE "GameTitle" ADD CONSTRAINT "GameTitle_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "GameFranchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameUpdate" ADD CONSTRAINT "GameUpdate_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLibrary" ADD CONSTRAINT "GameLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLibrary" ADD CONSTRAINT "GameLibrary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

