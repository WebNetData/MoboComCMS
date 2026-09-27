-- AlterTable
ALTER TABLE "MediaLink" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DownloadLog" (
    "id" SERIAL NOT NULL,
    "linkId" INTEGER,
    "ownerType" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "userId" INTEGER,
    "visitor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkReport" (
    "id" SERIAL NOT NULL,
    "linkId" INTEGER NOT NULL,
    "userId" INTEGER,
    "visitor" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LinkReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemReview" (
    "id" SERIAL NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemFavorite" (
    "userId" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemFavorite_pkey" PRIMARY KEY ("userId","itemType","itemId")
);

-- CreateTable
CREATE TABLE "ItemStat" (
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemStat_pkey" PRIMARY KEY ("itemType","itemId")
);

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" SERIAL NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "access" TEXT NOT NULL DEFAULT 'PUBLIC',
    "boost" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" INTEGER,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushCampaign" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '/',
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "day" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("day","path")
);

-- CreateTable
CREATE TABLE "AnalyticsVisitor" (
    "day" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AnalyticsVisitor_pkey" PRIMARY KEY ("day","hash")
);

-- CreateTable
CREATE TABLE "AnalyticsDimension" (
    "day" TEXT NOT NULL,
    "dim" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDimension_pkey" PRIMARY KEY ("day","dim","value")
);

-- CreateTable
CREATE TABLE "CopyrightReport" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "workTitle" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL DEFAULT '',
    "infringingUrls" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT '',
    "itemId" INTEGER,
    "description" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "resolution" TEXT NOT NULL DEFAULT '',
    "actionTaken" TEXT NOT NULL DEFAULT '',
    "visitor" TEXT NOT NULL DEFAULT '',
    "handledBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CopyrightReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DownloadLog_createdAt_idx" ON "DownloadLog"("createdAt");

-- CreateIndex
CREATE INDEX "DownloadLog_userId_createdAt_idx" ON "DownloadLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DownloadLog_visitor_createdAt_idx" ON "DownloadLog"("visitor", "createdAt");

-- CreateIndex
CREATE INDEX "DownloadLog_ownerType_ownerId_idx" ON "DownloadLog"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "LinkReport_status_createdAt_idx" ON "LinkReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LinkReport_linkId_idx" ON "LinkReport"("linkId");

-- CreateIndex
CREATE INDEX "ItemReview_itemType_itemId_status_createdAt_idx" ON "ItemReview"("itemType", "itemId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ItemReview_status_createdAt_idx" ON "ItemReview"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ItemReview_itemType_itemId_userId_key" ON "ItemReview"("itemType", "itemId", "userId");

-- CreateIndex
CREATE INDEX "ItemFavorite_itemType_itemId_idx" ON "ItemFavorite"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "SearchDocument_itemType_publishedAt_idx" ON "SearchDocument"("itemType", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_itemType_itemId_key" ON "SearchDocument"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "SocialPost_status_nextAttemptAt_idx" ON "SocialPost"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_channel_itemType_itemId_key" ON "SocialPost"("channel", "itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushCampaign_createdAt_idx" ON "PushCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDimension_dim_day_idx" ON "AnalyticsDimension"("dim", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CopyrightReport_code_key" ON "CopyrightReport"("code");

-- CreateIndex
CREATE INDEX "CopyrightReport_status_createdAt_idx" ON "CopyrightReport"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LinkReport" ADD CONSTRAINT "LinkReport_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MediaLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemReview" ADD CONSTRAINT "ItemReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFavorite" ADD CONSTRAINT "ItemFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Super Admin gets the new module permissions (like a fresh seed).
UPDATE "Role" SET "permissions" = "permissions" || ',downloads.manage' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%downloads.manage%';
UPDATE "Role" SET "permissions" = "permissions" || ',reviews.moderate' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%reviews.moderate%';
UPDATE "Role" SET "permissions" = "permissions" || ',social.manage' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%social.manage%';
UPDATE "Role" SET "permissions" = "permissions" || ',push.manage' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%push.manage%';
UPDATE "Role" SET "permissions" = "permissions" || ',analytics.view' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%analytics.view%';
UPDATE "Role" SET "permissions" = "permissions" || ',copyright.manage' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%copyright.manage%';
