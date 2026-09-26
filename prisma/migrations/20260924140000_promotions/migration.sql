CREATE TABLE "Promotion" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "kind" TEXT NOT NULL DEFAULT 'PERCENT',
  "percentBps" INTEGER NOT NULL DEFAULT 0,
  "amountMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "planId" INTEGER,
  "minSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
  "maxUses" INTEGER NOT NULL DEFAULT 0,
  "perUserLimit" INTEGER NOT NULL DEFAULT 1,
  "reservedCount" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
CREATE TABLE "PromotionRedemption" (
  "id" SERIAL NOT NULL,
  "promotionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromotionRedemption_orderId_key" ON "PromotionRedemption"("orderId");
CREATE INDEX "PromotionRedemption_promotionId_userId_status_idx" ON "PromotionRedemption"("promotionId", "userId", "status");
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
