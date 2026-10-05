-- Additive. Existing cards keep a NULL key (a unique index allows any number of NULLs); nothing is backfilled,
-- because cards already issued twice for one purchase would make a backfill fail.
ALTER TABLE "GiftCard" ADD COLUMN "purchaseKey" TEXT;
CREATE UNIQUE INDEX "GiftCard_purchaseKey_key" ON "GiftCard"("purchaseKey");
