ALTER TABLE "Product" ADD COLUMN "barcode" TEXT NOT NULL DEFAULT '', ADD COLUMN "costMinor" BIGINT;
ALTER TABLE "ProductVariant" ADD COLUMN "barcode" TEXT NOT NULL DEFAULT '', ADD COLUMN "costMinor" BIGINT;
ALTER TABLE "OrderLine" ADD COLUMN "unitCostMinor" BIGINT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_check" CHECK ("costMinor" IS NULL OR "costMinor" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_cost_check" CHECK ("costMinor" IS NULL OR "costMinor" >= 0);
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_cost_check" CHECK ("unitCostMinor" IS NULL OR "unitCostMinor" >= 0);
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

CREATE TABLE "StoreRegisterSession" (
 "id" SERIAL PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "register" TEXT NOT NULL,
 "cashierId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "currency" TEXT NOT NULL,
 "openingCashMinor" BIGINT NOT NULL DEFAULT 0, "expectedCashMinor" BIGINT NOT NULL DEFAULT 0, "expectedCardMinor" BIGINT NOT NULL DEFAULT 0,
 "countedCashMinor" BIGINT, "countedCardMinor" BIGINT, "differenceCashMinor" BIGINT NOT NULL DEFAULT 0, "differenceCardMinor" BIGINT NOT NULL DEFAULT 0,
 "note" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "closedAt" TIMESTAMP(3), "closedById" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "StoreRegisterSession_state_check" CHECK ("openingCashMinor" >= 0 AND (("status" = 'OPEN' AND "closedAt" IS NULL AND "countedCashMinor" IS NULL AND "countedCardMinor" IS NULL) OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "countedCashMinor" IS NOT NULL AND "countedCardMinor" IS NOT NULL AND "countedCashMinor" >= 0 AND "countedCardMinor" >= 0)))
);
CREATE UNIQUE INDEX "StoreRegisterSession_one_open_register" ON "StoreRegisterSession"("register") WHERE "status" = 'OPEN';
CREATE INDEX "StoreRegisterSession_cashierId_status_idx" ON "StoreRegisterSession"("cashierId", "status");
ALTER TABLE "Order" ADD COLUMN "registerSessionId" INTEGER REFERENCES "StoreRegisterSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "receiptToken" TEXT;
CREATE UNIQUE INDEX "Order_receiptToken_key" ON "Order"("receiptToken");
CREATE TABLE "StoreTender" (
 "id" SERIAL PRIMARY KEY, "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sessionId" INTEGER REFERENCES "StoreRegisterSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "method" TEXT NOT NULL, "amountMinor" BIGINT NOT NULL, "reference" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StoreTender_amount_method_check" CHECK ("amountMinor" > 0 AND "method" IN ('CASH','CARD','WALLET')),
 UNIQUE("orderId", "method")
);
CREATE INDEX "StoreTender_sessionId_method_idx" ON "StoreTender"("sessionId", "method");
INSERT INTO "StoreTender" ("orderId", "method", "amountMinor", "reference", "createdAt")
 SELECT "id", CASE WHEN "meta"::jsonb->>'counterMethod' = 'CARD' THEN 'CARD' ELSE 'CASH' END, "totalMinor", COALESCE("meta"::jsonb->>'counterReference',''), "createdAt"
 FROM "Order" WHERE "saleSource" = 'COUNTER' AND "status" IN ('PAID','REFUNDED') AND "totalMinor" > 0;
CREATE TABLE "StoreRegisterAdjustment" (
 "id" SERIAL PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE,
 "sessionId" INTEGER NOT NULL REFERENCES "StoreRegisterSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "method" TEXT NOT NULL, "amountMinor" BIGINT NOT NULL, "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StoreRegisterAdjustment_amount_method_check" CHECK ("amountMinor" <> 0 AND "method" IN ('CASH','CARD') AND length("reason") >= 3)
);
CREATE TABLE "StorePickup" (
 "orderId" INTEGER PRIMARY KEY REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'WAITING', "codeHash" TEXT NOT NULL, "codeSecret" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0, "readyAt" TIMESTAMP(3), "collectedAt" TIMESTAMP(3), "collectedById" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StorePickup_state_check" CHECK ("attempts" >= 0 AND "status" IN ('WAITING','READY','COLLECTED') AND ("status" <> 'COLLECTED' OR ("collectedAt" IS NOT NULL AND "collectedById" IS NOT NULL)))
);
CREATE INDEX "StorePickup_status_createdAt_idx" ON "StorePickup"("status", "createdAt");
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_counter_buyer_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_counter_buyer_check" CHECK (
 "saleSource" IN ('ONLINE','COUNTER') AND (("saleSource" = 'ONLINE' AND "userId" IS NOT NULL) OR
 ("saleSource" = 'COUNTER' AND "orderId" IS NOT NULL AND "kind" = 'BILLING' AND ("walletAppliedMinor" = 0 OR "userId" IS NOT NULL)))
);
CREATE FUNCTION guard_store_register() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status" = 'CLOSED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'closed register session is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "StoreRegisterSession_closed_immutable" BEFORE UPDATE ON "StoreRegisterSession" FOR EACH ROW EXECUTE FUNCTION guard_store_register();
CREATE FUNCTION guard_store_tender_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_state TEXT;
BEGIN
 IF NEW."sessionId" IS NOT NULL THEN
  SELECT "status" INTO session_state FROM "StoreRegisterSession" WHERE "id"=NEW."sessionId" FOR UPDATE;
  IF session_state IS DISTINCT FROM 'OPEN' THEN RAISE EXCEPTION 'register session is closed' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "StoreTender_open_session" BEFORE INSERT ON "StoreTender" FOR EACH ROW EXECUTE FUNCTION guard_store_tender_session();
CREATE TRIGGER "StoreRegisterAdjustment_open_session" BEFORE INSERT ON "StoreRegisterAdjustment" FOR EACH ROW EXECUTE FUNCTION guard_store_tender_session();
CREATE FUNCTION guard_store_posted_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'posted store movement is immutable; record a separate adjustment' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "StoreTender_posted_immutable" BEFORE UPDATE ON "StoreTender" FOR EACH ROW EXECUTE FUNCTION guard_store_posted_movement();
CREATE TRIGGER "StoreRegisterAdjustment_posted_immutable" BEFORE UPDATE ON "StoreRegisterAdjustment" FOR EACH ROW EXECUTE FUNCTION guard_store_posted_movement();
