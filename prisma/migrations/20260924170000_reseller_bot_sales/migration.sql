ALTER TABLE "ServiceOffer" ADD COLUMN "cardPriceMinor" BIGINT;
ALTER TABLE "ServiceOffer" ADD COLUMN "cardCurrency" TEXT;
ALTER TABLE "ResellerSale" ADD COLUMN "terms" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ResellerSale" ADD COLUMN "sourceUpdateId" TEXT;
CREATE UNIQUE INDEX "ResellerSale_botId_sourceUpdateId_key" ON "ResellerSale"("botId", "sourceUpdateId");
ALTER TABLE "ResellerSale" ADD COLUMN "retailMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ResellerSale" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ResellerSale" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "ResellerSale" ADD COLUMN "lastError" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ResellerSale" ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE TABLE "ResellerBotUpdate" (
  "id" SERIAL NOT NULL,
  "botId" INTEGER NOT NULL,
  "updateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellerBotUpdate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResellerBotUpdate_botId_updateId_key" ON "ResellerBotUpdate"("botId", "updateId");
CREATE INDEX "ResellerBotUpdate_createdAt_idx" ON "ResellerBotUpdate"("createdAt");
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
