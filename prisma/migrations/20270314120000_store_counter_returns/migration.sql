-- Counter returns: any paid order (online or in-person, guest included) can be taken back at the counter and refunded
-- in cash or card from the cashier's register, or to the wallet. Cash/card refunds never reach the wallet recovery job.
ALTER TABLE "ReturnRequest" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ReturnRequest" ADD COLUMN "refundMethod" TEXT NOT NULL DEFAULT 'WALLET',
 ADD COLUMN "counterRequestId" TEXT,
 ADD COLUMN "counterFingerprint" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "registerAdjustmentId" INTEGER REFERENCES "StoreRegisterAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "restockLocationId" INTEGER REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_refundMethod_check" CHECK ("refundMethod" IN ('WALLET', 'CASH', 'CARD') AND ("refundMethod" <> 'WALLET' OR "userId" IS NOT NULL));
CREATE UNIQUE INDEX "ReturnRequest_registerAdjustmentId_key" ON "ReturnRequest"("registerAdjustmentId");
CREATE UNIQUE INDEX "ReturnRequest_counterRequestId_key" ON "ReturnRequest"("counterRequestId");

-- A paid cash/card return has the same finality as a paid wallet return.
CREATE OR REPLACE FUNCTION "mobocom_return_request_rules"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."refundMethod" IS DISTINCT FROM OLD."refundMethod" OR NEW."counterRequestId" IS DISTINCT FROM OLD."counterRequestId"
     OR NEW."counterFingerprint" IS DISTINCT FROM OLD."counterFingerprint" THEN
    PERFORM "mobocom_refuse_transition"('a return keeps its order, buyer and refund method', 'ReturnRequest ' || OLD."id");
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" IN ('REJECTED', 'WITHDRAWN') THEN PERFORM "mobocom_refuse_transition"('a decided request is closed', 'ReturnRequest ' || OLD."id"); END IF;
    IF OLD."status" = 'REFUNDED' AND (OLD."walletTxId" IS NOT NULL OR OLD."registerAdjustmentId" IS NOT NULL) THEN
      PERFORM "mobocom_refuse_transition"('a refund that was paid is not taken back', 'ReturnRequest ' || OLD."id");
    END IF;
  END IF;
  IF OLD."status" = 'REFUNDED' AND (OLD."walletTxId" IS NOT NULL OR OLD."registerAdjustmentId" IS NOT NULL)
     AND (NEW."refundMinor" IS DISTINCT FROM OLD."refundMinor" OR NEW."walletTxId" IS DISTINCT FROM OLD."walletTxId"
          OR NEW."registerAdjustmentId" IS DISTINCT FROM OLD."registerAdjustmentId") THEN
    PERFORM "mobocom_refuse_transition"('the amount of a paid refund does not change', 'ReturnRequest ' || OLD."id");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Deferred because the claim and its immutable register movement are written within one transaction.
CREATE FUNCTION "mobocom_counter_return_payment"() RETURNS trigger AS $$
DECLARE r "ReturnRequest"; a "StoreRegisterAdjustment"; s "StoreRegisterSession";
BEGIN
  SELECT * INTO r FROM "ReturnRequest" WHERE "id" = NEW."id";
  IF r."refundMethod" IN ('CASH', 'CARD') AND r."status" = 'REFUNDED' THEN
    SELECT * INTO a FROM "StoreRegisterAdjustment" WHERE "id" = r."registerAdjustmentId";
    SELECT * INTO s FROM "StoreRegisterSession" WHERE "id" = a."sessionId";
    IF a."id" IS NULL OR a."method" <> r."refundMethod" OR a."amountMinor" <> -r."refundMinor"
       OR a."actorId" IS DISTINCT FROM r."decidedBy" OR s."currency" <> r."currency" OR r."walletTxId" IS NOT NULL
       OR r."counterRequestId" IS NULL THEN
      PERFORM "mobocom_refuse_transition"('cash/card refund needs its exact register movement', 'ReturnRequest ' || r."id");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "ReturnRequest_counter_payment" AFTER INSERT OR UPDATE ON "ReturnRequest"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "mobocom_counter_return_payment"();
