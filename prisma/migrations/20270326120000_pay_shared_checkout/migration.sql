-- Shared canonical Billing checkout, scoped guest proof and fee snapshots. Legacy amounts retained.
ALTER TABLE "PayMerchant" ADD COLUMN "feeBearer" TEXT NOT NULL DEFAULT 'MERCHANT', ADD COLUMN "feeBps" INTEGER,
 ADD COLUMN "flatFeeMinor" BIGINT, ADD COLUMN "feeCapMinor" BIGINT;
ALTER TABLE "PayMerchant" ADD CONSTRAINT "PayMerchant_terms_check" CHECK ("feeBearer" IN ('MERCHANT','CUSTOMER') AND ("feeBps" IS NULL OR "feeBps" BETWEEN 0 AND 3000) AND ("flatFeeMinor" IS NULL OR "flatFeeMinor">=0) AND ("feeCapMinor" IS NULL OR "feeCapMinor">=0));
ALTER TABLE "PayPayment" ALTER COLUMN "bankAccountId" DROP NOT NULL;
ALTER TABLE "PayPayment" ADD COLUMN "totalMinor" BIGINT, ADD COLUMN "feeBearer" TEXT NOT NULL DEFAULT 'MERCHANT',
 ADD COLUMN "invoiceId" INTEGER, ADD COLUMN "payerSessionHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "payerPhoneCiphertext" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "payerPhoneLast4" TEXT NOT NULL DEFAULT '', ADD COLUMN "payerVerifiedAt" TIMESTAMP(3), ADD COLUMN "payerSessionExpiresAt" TIMESTAMP(3),
 ADD COLUMN "gatewayAttemptToken" TEXT NOT NULL DEFAULT '', ADD COLUMN "gatewayAttemptAt" TIMESTAMP(3),
 ADD COLUMN "gatewayAttemptStatus" TEXT NOT NULL DEFAULT '', ADD COLUMN "gatewayAttemptRef" TEXT NOT NULL DEFAULT '', ADD COLUMN "gatewayAttemptProvider" TEXT NOT NULL DEFAULT '';
UPDATE "PayPayment" SET "totalMinor"="amountMinor";
-- Flush existing deferred proof events from the backfill before changing this table again.
SET CONSTRAINTS "PayPayment_links" IMMEDIATE;
SET CONSTRAINTS "PayPayment_links" DEFERRED;
ALTER TABLE "PayPayment" ALTER COLUMN "totalMinor" SET NOT NULL;
CREATE UNIQUE INDEX "PayPayment_invoiceId_key" ON "PayPayment"("invoiceId");
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayPayment" DROP CONSTRAINT "PayPayment_money_check";
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_money_check" CHECK ("amountMinor">0 AND "feeMinor">=0 AND "netMinor">0 AND "totalMinor">0 AND "totalMinor"="netMinor"+"feeMinor" AND "expiresAt">"createdAt" AND (("feeBearer"='MERCHANT' AND "totalMinor"="amountMinor") OR ("feeBearer"='CUSTOMER' AND "netMinor"="amountMinor")));
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_attempt_check" CHECK ("gatewayAttemptStatus" IN ('','STARTING','READY','UNKNOWN','FAILED'));
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_kind_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_kind_check" CHECK ("kind" IN ('BILLING','WALLET_TOPUP','PAY_COLLECTION'));
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_counter_buyer_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_counter_buyer_check" CHECK ("saleSource" IN ('ONLINE','COUNTER') AND
 (("kind"='PAY_COLLECTION' AND "saleSource"='ONLINE' AND "userId" IS NULL AND "orderId" IS NULL AND "planId" IS NULL AND "productId" IS NULL AND "walletAppliedMinor"=0 AND "currency"='IRR') OR
 ("kind"<>'PAY_COLLECTION' AND (("saleSource"='ONLINE' AND "userId" IS NOT NULL) OR ("saleSource"='COUNTER' AND "orderId" IS NOT NULL AND "kind"='BILLING' AND ("walletAppliedMinor"=0 OR "userId" IS NOT NULL))))));
ALTER TABLE "PaymentReceipt" ALTER COLUMN "userId" DROP NOT NULL;

CREATE OR REPLACE FUNCTION "mobocom_pay_rules"() RETURNS trigger AS $$ BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  IF ROW(NEW."merchantId",NEW."terminalId",NEW."bankAccountId",NEW."externalId",NEW."idempotencyKey",NEW."fingerprint",NEW."amountMinor",NEW."feeMinor",NEW."netMinor",NEW."totalMinor",NEW."feeBearer",NEW."createdAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."merchantId",OLD."terminalId",OLD."bankAccountId",OLD."externalId",OLD."idempotencyKey",OLD."fingerprint",OLD."amountMinor",OLD."feeMinor",OLD."netMinor",OLD."totalMinor",OLD."feeBearer",OLD."createdAt",OLD."expiresAt") OR (OLD."status"<>'PENDING' AND NEW."status"<>OLD."status") OR (OLD."walletTxId" IS NOT NULL AND NEW."walletTxId" IS DISTINCT FROM OLD."walletTxId") OR (OLD."status"='PAID' AND ROW(NEW."transferReference",NEW."paidAt") IS DISTINCT FROM ROW(OLD."transferReference",OLD."paidAt")) THEN RAISE EXCEPTION 'payment facts are immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PayBankEvent' THEN
  IF ROW(NEW."providerId",NEW."externalId",NEW."bankAccountId",NEW."amountMinor",NEW."transferReference",NEW."occurredAt",NEW."payloadHash",NEW."targetPaymentId") IS DISTINCT FROM ROW(OLD."providerId",OLD."externalId",OLD."bankAccountId",OLD."amountMinor",OLD."transferReference",OLD."occurredAt",OLD."payloadHash",OLD."targetPaymentId") OR (OLD."status"='MATCHED' AND ROW(NEW."status",NEW."paymentId") IS DISTINCT FROM ROW(OLD."status",OLD."paymentId")) THEN RAISE EXCEPTION 'bank facts are immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PaySettlementQuote' THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'settlement quote is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PaySettlement' THEN
  IF ROW(NEW."merchantId",NEW."quoteId",NEW."idempotencyKey",NEW."fingerprint",NEW."amountMinor",NEW."feeMinor",NEW."payoutAtoms",NEW."asset",NEW."network",NEW."decimals",NEW."destination",NEW."reserveWalletTxId") IS DISTINCT FROM ROW(OLD."merchantId",OLD."quoteId",OLD."idempotencyKey",OLD."fingerprint",OLD."amountMinor",OLD."feeMinor",OLD."payoutAtoms",OLD."asset",OLD."network",OLD."decimals",OLD."destination",OLD."reserveWalletTxId") OR (NEW."status"<>OLD."status" AND NOT ((OLD."status"='REQUESTED' AND NEW."status" IN ('APPROVED','REJECTED')) OR (OLD."status"='APPROVED' AND NEW."status" IN ('PAID','REJECTED')))) OR (OLD."status" IN ('PAID','REJECTED') AND ROW(NEW."status",NEW."reference",NEW."reason",NEW."approvedById",NEW."completedById") IS DISTINCT FROM ROW(OLD."status",OLD."reference",OLD."reason",OLD."approvedById",OLD."completedById")) OR (OLD."releaseWalletTxId" IS NOT NULL AND NEW."releaseWalletTxId" IS DISTINCT FROM OLD."releaseWalletTxId") THEN RAISE EXCEPTION 'settlement facts or transition invalid' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION "mobocom_pay_checkout_facts"() RETURNS trigger AS $$ BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  IF (OLD."invoiceId" IS NOT NULL AND NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId") OR (OLD."gatewayAttemptRef"<>'' AND ROW(NEW."gatewayAttemptRef",NEW."gatewayAttemptProvider") IS DISTINCT FROM ROW(OLD."gatewayAttemptRef",OLD."gatewayAttemptProvider")) OR
     (OLD."invoiceId" IS NOT NULL AND ROW(NEW."payerPhoneCiphertext",NEW."payerPhoneLast4") IS DISTINCT FROM ROW(OLD."payerPhoneCiphertext",OLD."payerPhoneLast4")) THEN RAISE EXCEPTION 'checkout attribution is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='Invoice' AND (OLD."kind"='PAY_COLLECTION' OR NEW."kind"='PAY_COLLECTION') THEN
  IF ROW(NEW."kind",NEW."userId",NEW."orderId",NEW."totalMinor",NEW."currency",NEW."walletAppliedMinor",NEW."gatewayId") IS DISTINCT FROM ROW(OLD."kind",OLD."userId",OLD."orderId",OLD."totalMinor",OLD."currency",OLD."walletAppliedMinor",OLD."gatewayId") THEN RAISE EXCEPTION 'collection invoice facts are immutable' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayPayment_checkout_facts" BEFORE UPDATE ON "PayPayment" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_checkout_facts"();
CREATE TRIGGER "Invoice_collection_facts" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_checkout_facts"();

CREATE OR REPLACE FUNCTION "mobocom_pay_links"() RETURNS trigger AS $$ DECLARE p "PayPayment"; s "PaySettlement"; m INTEGER; BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  SELECT * INTO p FROM "PayPayment" WHERE "id"=NEW."id";
  IF p."status"='PAID' THEN
   SELECT "userId" INTO m FROM "PayMerchant" WHERE "id"=p."merchantId";
   IF NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=p."walletTxId" AND w."userId"=m AND w."type"='PAY_CREDIT' AND w."currency"='IRR' AND w."status"='DONE' AND w."amountMinor"=p."netMinor" AND w."withdrawableDeltaMinor"=p."netMinor") OR
     NOT (EXISTS(SELECT 1 FROM "PayBankEvent" b WHERE b."paymentId"=p."id" AND b."targetPaymentId"=p."id" AND b."status"='MATCHED' AND b."amountMinor"=p."totalMinor" AND b."bankAccountId"=p."bankAccountId" AND b."transferReference"=p."transferReference" AND b."occurredAt" BETWEEN p."createdAt" AND p."expiresAt") OR
          EXISTS(SELECT 1 FROM "Invoice" i JOIN "Payment" j ON j."invoiceId"=i."id" WHERE i."id"=p."invoiceId" AND i."kind"='PAY_COLLECTION' AND i."status"='PAID' AND i."totalMinor"=p."totalMinor" AND i."paidAmountMinor"=p."totalMinor" AND i."currency"='IRR' AND j."status"='CONFIRMED' AND j."amountMinor"=p."totalMinor" AND j."currency"='IRR')) THEN RAISE EXCEPTION 'verified payment proof is incomplete' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO s FROM "PaySettlement" WHERE "id"=NEW."id";
  SELECT "userId" INTO m FROM "PayMerchant" WHERE "id"=s."merchantId";
  IF NOT EXISTS(SELECT 1 FROM "PaySettlementQuote" q WHERE q."id"=s."quoteId" AND q."merchantId"=s."merchantId" AND q."amountMinor"=s."amountMinor" AND q."feeMinor"=s."feeMinor" AND q."payoutAtoms"=s."payoutAtoms" AND q."asset"=s."asset" AND q."network"=s."network" AND q."decimals"=s."decimals") OR NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."reserveWalletTxId" AND w."userId"=m AND w."type"='PAY_RESERVE' AND w."currency"='IRR' AND w."status"='DONE' AND w."amountMinor"=-s."amountMinor" AND w."withdrawableDeltaMinor"=-s."amountMinor") OR (s."status"='REJECTED' AND NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."releaseWalletTxId" AND w."userId"=m AND w."type"='PAY_RELEASE' AND w."status"='DONE' AND w."currency"='IRR' AND w."amountMinor"=s."amountMinor" AND w."withdrawableDeltaMinor"=s."amountMinor")) OR s."approvedById"=m OR s."completedById"=m THEN RAISE EXCEPTION 'settlement proof is incomplete' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL; END; $$ LANGUAGE plpgsql;

CREATE FUNCTION "mobocom_pay_invoice_link"() RETURNS trigger AS $$ DECLARE i "Invoice"; BEGIN
 IF TG_TABLE_NAME='Invoice' THEN
  SELECT * INTO i FROM "Invoice" WHERE "id"=NEW."id";
  IF i."kind"='PAY_COLLECTION' AND (NOT EXISTS(SELECT 1 FROM "PayPayment" p WHERE p."invoiceId"=i."id" AND p."totalMinor"=i."totalMinor" AND (i."status"<>'PAID' OR (p."status"='PAID' AND p."payerVerifiedAt" IS NOT NULL AND p."walletTxId" IS NOT NULL)))) THEN RAISE EXCEPTION 'collection invoice needs its verified Pay owner' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO i FROM "Invoice" WHERE "id"=NEW."invoiceId";
  IF NEW."userId" IS DISTINCT FROM i."userId" OR (NEW."userId" IS NULL AND i."kind"<>'PAY_COLLECTION') OR (i."kind"='PAY_COLLECTION' AND (NEW."amountMinor"<>i."totalMinor" OR NEW."currency"<>i."currency")) THEN RAISE EXCEPTION 'receipt must match its canonical invoice' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL; END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Invoice_pay_link" AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_invoice_link"();
CREATE CONSTRAINT TRIGGER "Receipt_pay_link" AFTER INSERT OR UPDATE ON "PaymentReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_invoice_link"();
CREATE UNIQUE INDEX "PaymentReceipt_pay_pending_key" ON "PaymentReceipt"("invoiceId") WHERE "status"='PENDING' AND "userId" IS NULL;
CREATE UNIQUE INDEX "PaymentReceipt_pay_approved_reference" ON "PaymentReceipt"(COALESCE("bankAccountId",-1), lower("trackingCode")) WHERE "userId" IS NULL AND "status"='APPROVED' AND "trackingCode"<>'';
