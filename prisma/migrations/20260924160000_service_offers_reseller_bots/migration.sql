CREATE TABLE "ServiceOffer" (
  "id" SERIAL NOT NULL,
  "ownerKey" TEXT NOT NULL,
  "planId" INTEGER NOT NULL,
  "nameFa" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "trafficGB" INTEGER NOT NULL,
  "days" INTEGER NOT NULL,
  "deviceLimit" INTEGER NOT NULL,
  "priceMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceOffer_ownerKey_active_sortOrder_idx" ON "ServiceOffer"("ownerKey", "active", "sortOrder");
ALTER TABLE "ServiceOffer" ADD CONSTRAINT "ServiceOffer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ResellerBot" (
  "id" SERIAL NOT NULL,
  "resellerId" INTEGER NOT NULL,
  "botId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "tokenCipher" TEXT NOT NULL,
  "webhookSecret" TEXT NOT NULL,
  "ownerTelegramId" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL DEFAULT '',
  "cardNumber" TEXT NOT NULL,
  "cardHolder" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "lastError" TEXT NOT NULL DEFAULT '',
  "installedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellerBot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResellerBot_resellerId_key" ON "ResellerBot"("resellerId");
CREATE UNIQUE INDEX "ResellerBot_botId_key" ON "ResellerBot"("botId");

CREATE TABLE "ResellerSale" (
  "id" SERIAL NOT NULL,
  "resellerId" INTEGER NOT NULL,
  "offerId" INTEGER NOT NULL,
  "botId" INTEGER NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_RECEIPT',
  "receiptFileId" TEXT NOT NULL DEFAULT '',
  "orderId" INTEGER,
  "subscriptionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellerSale_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResellerSale_resellerId_status_createdAt_idx" ON "ResellerSale"("resellerId", "status", "createdAt");
CREATE INDEX "ResellerSale_botId_telegramUserId_createdAt_idx" ON "ResellerSale"("botId", "telegramUserId", "createdAt");
ALTER TABLE "ResellerSale" ADD CONSTRAINT "ResellerSale_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ServiceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
