-- CreateTable
CREATE TABLE "ContentDemand" (
    "id" SERIAL NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "decidedById" INTEGER,
    "productId" INTEGER,
    "cinemaTitleId" INTEGER,
    "gameId" INTEGER,
    "softwareId" INTEGER,
    "trackId" INTEGER,
    "albumId" INTEGER,
    "postId" INTEGER,
    "threadId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDemandSupporter" (
    "demandId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDemandSupporter_pkey" PRIMARY KEY ("demandId","userId")
);

-- CreateTable
CREATE TABLE "SharedCart" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sourceCartId" INTEGER,
    "title" TEXT NOT NULL,
    "lines" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedCartImport" (
    "id" SERIAL NOT NULL,
    "shareId" INTEGER NOT NULL,
    "cartId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCartImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadLinkHealth" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "linkId" INTEGER,
    "trackId" INTEGER,
    "quality" TEXT NOT NULL DEFAULT '',
    "sourceHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT NOT NULL DEFAULT '',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadLinkHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentDemand_section_status_updatedAt_idx" ON "ContentDemand"("section", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDemand_section_normalizedTitle_key" ON "ContentDemand"("section", "normalizedTitle");

-- CreateIndex
CREATE INDEX "ContentDemandSupporter_userId_createdAt_idx" ON "ContentDemandSupporter"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedCart_tokenHash_key" ON "SharedCart"("tokenHash");

-- CreateIndex
CREATE INDEX "SharedCart_sourceCartId_createdAt_idx" ON "SharedCart"("sourceCartId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedCartImport_cartId_requestId_key" ON "SharedCartImport"("cartId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadLinkHealth_sourceKey_key" ON "DownloadLinkHealth"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadLinkHealth_linkId_key" ON "DownloadLinkHealth"("linkId");

-- CreateIndex
CREATE INDEX "DownloadLinkHealth_nextCheckAt_leaseUntil_idx" ON "DownloadLinkHealth"("nextCheckAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadLinkHealth_trackId_quality_key" ON "DownloadLinkHealth"("trackId", "quality");

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_cinemaTitleId_fkey" FOREIGN KEY ("cinemaTitleId") REFERENCES "CinemaTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "SoftwareTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "MusicAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemandSupporter" ADD CONSTRAINT "ContentDemandSupporter_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "ContentDemand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDemandSupporter" ADD CONSTRAINT "ContentDemandSupporter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCart" ADD CONSTRAINT "SharedCart_sourceCartId_fkey" FOREIGN KEY ("sourceCartId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCartImport" ADD CONSTRAINT "SharedCartImport_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "SharedCart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCartImport" ADD CONSTRAINT "SharedCartImport_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadLinkHealth" ADD CONSTRAINT "DownloadLinkHealth_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MediaLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadLinkHealth" ADD CONSTRAINT "DownloadLinkHealth_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_state" CHECK ("status" IN ('OPEN','REVIEWING','FULFILLED','DECLINED') AND "version">0);
ALTER TABLE "ContentDemand" ADD CONSTRAINT "ContentDemand_target" CHECK (("status"<>'FULFILLED' AND num_nonnulls("productId","cinemaTitleId","gameId","softwareId","trackId","albumId","postId","threadId")=0) OR ("status"='FULFILLED' AND "decidedById" IS NOT NULL AND num_nonnulls("productId","cinemaTitleId","gameId","softwareId","trackId","albumId","postId","threadId")=1 AND (("section"='store' AND "productId" IS NOT NULL) OR ("section"='cinema' AND "cinemaTitleId" IS NOT NULL) OR ("section"='games' AND "gameId" IS NOT NULL) OR ("section"='software' AND "softwareId" IS NOT NULL) OR ("section"='music' AND ("trackId" IS NOT NULL OR "albumId" IS NOT NULL)) OR ("section"='magazine' AND "postId" IS NOT NULL) OR ("section"='forum' AND "threadId" IS NOT NULL))));
ALTER TABLE "SharedCart" ADD CONSTRAINT "SharedCart_shape" CHECK ("version">0 AND "expiresAt">"createdAt" AND "tokenHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("lines"::jsonb)='array' AND jsonb_array_length("lines"::jsonb) BETWEEN 1 AND 50);
ALTER TABLE "DownloadLinkHealth" ADD CONSTRAINT "DownloadLinkHealth_source" CHECK (("linkId" IS NOT NULL AND "trackId" IS NULL AND "quality"='') OR ("linkId" IS NULL AND "trackId" IS NOT NULL AND "quality" IN ('normal','hq')));
ALTER TABLE "DownloadLinkHealth" ADD CONSTRAINT "DownloadLinkHealth_state" CHECK ("status" IN ('PENDING','OK','FAILED','SKIPPED') AND "failureCount">=0 AND "httpStatus" BETWEEN 0 AND 599);
