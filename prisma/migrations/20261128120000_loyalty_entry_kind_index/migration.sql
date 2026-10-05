-- Additive: lets the redemption recovery find recent REDEEM entries without reading the whole ledger.
CREATE INDEX "LoyaltyEntry_kind_createdAt_idx" ON "LoyaltyEntry"("kind", "createdAt");
