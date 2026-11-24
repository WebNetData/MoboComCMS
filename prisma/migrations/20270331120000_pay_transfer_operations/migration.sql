-- Admin evidence dispositions. Never alters an original notice or recycles an amount.
BEGIN;
CREATE TABLE "PayTransferReview" (
 "noticeId" TEXT PRIMARY KEY REFERENCES "PayBaleNotice"("id") ON DELETE RESTRICT,
 "collectionId" TEXT REFERENCES "PayBaleCollection"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "version" INTEGER NOT NULL DEFAULT 1,
 "note" TEXT NOT NULL, "reviewedBy" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayTransferReview_state" CHECK ("status" IN ('OPEN','DISMISSED','CONFIRMED') AND "version">0 AND length("note") BETWEEN 3 AND 300 AND ("status"<>'CONFIRMED' OR "collectionId" IS NOT NULL))
);
CREATE INDEX "PayTransferReview_status_reviewedAt_idx" ON "PayTransferReview"("status","reviewedAt");
CREATE INDEX "PayTransferReview_collectionId_idx" ON "PayTransferReview"("collectionId");
CREATE FUNCTION mobocom_transfer_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n "PayBaleNotice"; c "PayBaleCollection"; i "Invoice";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'review history is permanent'; END IF;
 IF TG_OP='UPDATE' AND (OLD."status"<>'OPEN' OR NEW."noticeId" IS DISTINCT FROM OLD."noticeId" OR NEW."version"<>OLD."version"+1) THEN RAISE EXCEPTION 'review version/state claim required'; END IF;
 IF TG_OP='INSERT' AND NEW."version"<>1 THEN RAISE EXCEPTION 'review starts at version one'; END IF;
 SELECT * INTO n FROM "PayBaleNotice" WHERE "id"=NEW."noticeId";
 IF n."status" IS DISTINCT FROM 'ORIGINAL_TRANSFER' OR n."direction" IS DISTINCT FROM 'CREDIT' THEN RAISE EXCEPTION 'original credit evidence required'; END IF;
 IF NEW."collectionId" IS NOT NULL THEN
  SELECT * INTO c FROM "PayBaleCollection" WHERE "id"=NEW."collectionId";
  SELECT * INTO i FROM "Invoice" WHERE "id"=c."invoiceId";
  IF c."bankAccountId" IS DISTINCT FROM n."bankAccountId" THEN RAISE EXCEPTION 'same destination required'; END IF;
  IF EXISTS (SELECT 1 FROM "PayBaleCollection" q WHERE q."collectedRial"=n."amountMinor" AND q."id"<>c."id") THEN RAISE EXCEPTION 'amount belongs to another reservation'; END IF;
  IF NEW."status"='CONFIRMED' AND (n."amountMinor" IS DISTINCT FROM c."collectedRial" OR c."acceptedAt" IS NULL OR n."receivedAt"<c."createdAt" OR n."sourceSentAt"<c."acceptedAt" OR n."sourceSentAt"<c."validFrom" OR i."status" IS DISTINCT FROM 'UNPAID' OR i."userId"=NEW."reviewedBy" OR EXISTS(SELECT 1 FROM "PayPayment" p JOIN "PayMerchant" m ON m."id"=p."merchantId" WHERE p."invoiceId"=i."id" AND m."userId"=NEW."reviewedBy")) THEN RAISE EXCEPTION 'exact accepted unpaid non-self collection required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PayTransferReview_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayTransferReview" FOR EACH ROW EXECUTE FUNCTION mobocom_transfer_review_guard();
CREATE FUNCTION mobocom_transfer_review_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."status"='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM "PayBaleCollection" c WHERE c."id"=NEW."collectionId" AND c."status"='PAID' AND c."settlementMethod"='REVIEWED_NOTICE' AND c."noticeId"=NEW."noticeId") THEN RAISE EXCEPTION 'review confirmation and payment must commit together'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "PayTransferReview_settlement_guard" AFTER INSERT OR UPDATE ON "PayTransferReview" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mobocom_transfer_review_settlement_guard();
-- Widen only the existing collection proof. All previous journal/binding guards remain.
ALTER TABLE "PayBaleCollection" DROP CONSTRAINT "PayBaleCollection_state_check";
ALTER TABLE "PayBaleCollection" ADD CONSTRAINT "PayBaleCollection_state_check" CHECK (
 ("status" IN ('PENDING','UNDER_REVIEW') AND "activeInvoiceId" IS NOT NULL AND "activeInvoiceId"="invoiceId" AND "noticeId" IS NULL AND "principalPaymentId" IS NULL AND "adjustmentPaymentId" IS NULL AND "paidCollectedRial" IS NULL AND "paidAt" IS NULL AND "settlementMethod"='' AND "reviewReason"='' AND (("status"='PENDING' AND "receiptId" IS NULL) OR ("status"='UNDER_REVIEW' AND "receiptId" IS NOT NULL)))
 OR ("status"='PAID' AND "activeInvoiceId" IS NULL AND "principalPaymentId" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "paidAt" IS NOT NULL AND "reviewReason"='' AND "paidCollectedRial" IS NOT NULL AND "paidCollectedRial" IN ("principalRial","collectedRial") AND (("paidCollectedRial"="principalRial" AND "adjustmentPaymentId" IS NULL) OR ("paidCollectedRial"="collectedRial" AND "adjustmentPaymentId" IS NOT NULL)) AND (("settlementMethod" IN ('AUTO','REVIEWED_NOTICE') AND "noticeId" IS NOT NULL AND "paidCollectedRial"="collectedRial") OR ("settlementMethod"='MANUAL' AND "receiptId" IS NOT NULL AND "receiptAmountRial"="paidCollectedRial")))
 OR ("status" IN ('EXPIRED','REVIEW') AND "activeInvoiceId" IS NULL AND "principalPaymentId" IS NULL AND "adjustmentPaymentId" IS NULL AND "paidCollectedRial" IS NULL AND "paidAt" IS NULL AND "settlementMethod"='' AND "reviewReason"<>'')
 );
CREATE OR REPLACE FUNCTION mobocom_bale_collection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv "Invoice"; notice "PayBaleNotice"; principal "Payment"; adjustment "Payment"; receipt "PaymentReceipt"; provider TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."id",NEW."invoiceId",NEW."gatewayId",NEW."bankAccountId",NEW."ownerUserId",NEW."sourceInstanceId",NEW."sourceAccountId",NEW."bankPeerId",NEW."sourceTypes",NEW."sourceBindings",NEW."currency",NEW."dueMinor",NEW."principalRial",NEW."adjustmentRial",NEW."collectedRial",NEW."policyRevision",NEW."validFrom",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id",OLD."invoiceId",OLD."gatewayId",OLD."bankAccountId",OLD."ownerUserId",OLD."sourceInstanceId",OLD."sourceAccountId",OLD."bankPeerId",OLD."sourceTypes",OLD."sourceBindings",OLD."currency",OLD."dueMinor",OLD."principalRial",OLD."adjustmentRial",OLD."collectedRial",OLD."policyRevision",OLD."validFrom",OLD."expiresAt",OLD."createdAt") THEN RAISE EXCEPTION 'quote and amount tombstone immutable'; END IF;
  IF OLD."status"='PAID' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'settled collection immutable'; END IF;
  IF NEW."status"<>OLD."status" AND NOT ((OLD."status"='PENDING' AND NEW."status" IN ('UNDER_REVIEW','PAID','EXPIRED','REVIEW')) OR (OLD."status"='UNDER_REVIEW' AND NEW."status" IN ('PAID','REVIEW')) OR (OLD."status"='EXPIRED' AND NEW."status"='REVIEW') OR (OLD."status"='REVIEW' AND NEW."status"='PAID' AND NEW."settlementMethod" IN ('MANUAL','REVIEWED_NOTICE'))) THEN RAISE EXCEPTION 'invalid collection transition'; END IF;
  IF OLD."acceptedAt" IS NOT NULL AND NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" THEN RAISE EXCEPTION 'acceptance immutable'; END IF;
  IF OLD."receiptId" IS NOT NULL AND ROW(NEW."receiptId",NEW."receiptAmountRial") IS DISTINCT FROM ROW(OLD."receiptId",OLD."receiptAmountRial") THEN RAISE EXCEPTION 'receipt link immutable'; END IF;
 ELSIF NEW."status"<>'PENDING' OR NEW."acceptedAt" IS NOT NULL THEN RAISE EXCEPTION 'quote starts pending unaccepted';
 END IF;
 IF NEW."receiptId" IS NOT NULL THEN
  SELECT * INTO receipt FROM "PaymentReceipt" WHERE "id"=NEW."receiptId";
  IF receipt."id" IS NULL OR receipt."invoiceId" IS DISTINCT FROM NEW."invoiceId" OR receipt."bankAccountId" IS DISTINCT FROM NEW."bankAccountId" OR receipt."amountMinor" IS DISTINCT FROM NEW."dueMinor" OR receipt."currency" IS DISTINCT FROM NEW."currency" OR (NEW."status"='UNDER_REVIEW' AND receipt."status" IS DISTINCT FROM 'PENDING') THEN RAISE EXCEPTION 'canonical receipt proof required'; END IF;
 END IF;
 IF NEW."status"='PAID' THEN
  SELECT * INTO inv FROM "Invoice" WHERE "id"=NEW."invoiceId";
  SELECT "Gateway"."provider" INTO provider FROM "Gateway" WHERE "id"=NEW."gatewayId";
  SELECT * INTO principal FROM "Payment" WHERE "id"=NEW."principalPaymentId";
  IF inv."id" IS NULL OR principal."id" IS NULL OR inv."status" IS DISTINCT FROM 'PAID' OR inv."gatewayId" IS DISTINCT FROM NEW."gatewayId" OR inv."currency" IS DISTINCT FROM NEW."currency" OR provider NOT IN ('CARD_TRANSFER','MOBOCOM_PAY')
   OR principal."invoiceId" IS DISTINCT FROM inv."id" OR principal."provider" IS DISTINCT FROM provider OR principal."status" IS DISTINCT FROM 'CONFIRMED' OR principal."currency" IS DISTINCT FROM NEW."currency" OR principal."amountMinor" IS DISTINCT FROM NEW."dueMinor" OR principal."providerTxnId" IS DISTINCT FROM NEW."id" OR principal."gatewayId" IS DISTINCT FROM NEW."gatewayId" OR principal."userId" IS DISTINCT FROM inv."userId" OR principal."orderId" IS DISTINCT FROM inv."orderId" OR principal."eventKey" IS DISTINCT FROM 'invoice:'||NEW."invoiceId"||':payment:'||provider||':'||NEW."id" THEN RAISE EXCEPTION 'exact principal journal required'; END IF;
  IF NEW."adjustmentPaymentId" IS NOT NULL THEN
   SELECT * INTO adjustment FROM "Payment" WHERE "id"=NEW."adjustmentPaymentId";
   IF adjustment."id" IS NULL OR adjustment."invoiceId" IS NOT NULL OR adjustment."orderId" IS NOT NULL OR adjustment."userId" IS NOT NULL OR adjustment."provider" IS DISTINCT FROM 'MOBOCOM_PAY_ADJUSTMENT' OR adjustment."status" IS DISTINCT FROM 'CONFIRMED' OR adjustment."currency" IS DISTINCT FROM 'IRR' OR adjustment."amountMinor" IS DISTINCT FROM NEW."adjustmentRial" OR adjustment."eventKey" IS DISTINCT FROM 'bale-adjustment:'||NEW."id" OR adjustment."gatewayId" IS DISTINCT FROM NEW."gatewayId" OR adjustment."providerTxnId" IS DISTINCT FROM NEW."id" THEN RAISE EXCEPTION 'exact fee journal required'; END IF;
  END IF;
  IF NEW."settlementMethod"='MANUAL' THEN
   IF receipt."id" IS NULL OR receipt."status" IS DISTINCT FROM 'APPROVED' OR receipt."reviewedBy" IS NULL OR receipt."reviewedAt" IS NULL THEN RAISE EXCEPTION 'approved staff receipt required'; END IF;
  ELSE
   IF NEW."settlementMethod"='REVIEWED_NOTICE' AND NOT EXISTS (SELECT 1 FROM "PayTransferReview" r WHERE r."noticeId"=NEW."noticeId" AND r."collectionId"=NEW."id" AND r."status"='CONFIRMED') THEN RAISE EXCEPTION 'confirmed staff review required'; END IF;
   SELECT * INTO notice FROM "PayBaleNotice" WHERE "id"=NEW."noticeId";
   IF notice."id" IS NULL OR notice."status" IS DISTINCT FROM 'ORIGINAL_TRANSFER' OR notice."direction" IS DISTINCT FROM 'CREDIT' OR notice."amountMinor" IS DISTINCT FROM NEW."collectedRial" OR notice."bankAccountId" IS DISTINCT FROM NEW."bankAccountId" OR notice."receivedAt"<NEW."createdAt" OR notice."sourceSentAt"<NEW."acceptedAt" OR notice."sourceSentAt"<NEW."validFrom" OR (NEW."settlementMethod"='AUTO' AND OLD."status"<>'UNDER_REVIEW' AND notice."receivedAt">NEW."expiresAt") OR NOT (NEW."sourceTypes"::jsonb ? notice."sourceType") THEN RAISE EXCEPTION 'authenticated current transfer proof required'; END IF;
   IF notice."sourceType"='BALE' AND (notice."instanceId" IS DISTINCT FROM NEW."sourceInstanceId" OR notice."sourceAccountId" IS DISTINCT FROM NEW."sourceAccountId" OR notice."bankPeerId" IS DISTINCT FROM NEW."bankPeerId") THEN RAISE EXCEPTION 'Bale source binding mismatch'; END IF;
   IF notice."sourceType"='SMS' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."sourceBindings"::jsonb->'sms') b WHERE b->>'id'=notice."smsSourceId") THEN RAISE EXCEPTION 'SMS source binding mismatch'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
