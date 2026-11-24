ALTER TABLE "PayMerchant" ADD COLUMN "baleAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayTerminal" ADD COLUMN "baleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BankAccount" ADD COLUMN "collectionUse" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_collectionUse_check" CHECK ("collectionUse" IN ('GENERAL','MOBOCOM_PAY'));

CREATE FUNCTION mobocom_bank_digits(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT regexp_replace(translate(value, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')
$$;
CREATE FUNCTION mobocom_dedicated_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."collectionUse" IS DISTINCT FROM OLD."collectionUse" OR
    (OLD."collectionUse" = 'MOBOCOM_PAY' AND
      ROW(NEW."accountNumber",NEW."cardNumber",NEW."sheba") IS DISTINCT FROM ROW(OLD."accountNumber",OLD."cardNumber",OLD."sheba"))) THEN
    RAISE EXCEPTION 'bank collection purpose and dedicated identity are immutable';
  END IF;
  IF NEW."collectionUse" = 'MOBOCOM_PAY' AND NEW."accountNumber" !~ '^[0-9]{6,30}$' THEN
    RAISE EXCEPTION 'dedicated collection account requires an 6 to 30 digit account';
  END IF;
  PERFORM pg_advisory_xact_lock(1885432165, 1);
  IF EXISTS (SELECT 1 FROM "BankAccount" b WHERE b."id" <> NEW."id"
    AND (b."collectionUse" = 'MOBOCOM_PAY' OR NEW."collectionUse" = 'MOBOCOM_PAY')
    AND ((mobocom_bank_digits(NEW."accountNumber") <> '' AND mobocom_bank_digits(b."accountNumber") = mobocom_bank_digits(NEW."accountNumber"))
      OR (mobocom_bank_digits(NEW."cardNumber") <> '' AND mobocom_bank_digits(b."cardNumber") = mobocom_bank_digits(NEW."cardNumber"))
      OR (mobocom_bank_digits(NEW."sheba") <> '' AND mobocom_bank_digits(b."sheba") = mobocom_bank_digits(NEW."sheba")))) THEN
    RAISE EXCEPTION 'dedicated bank identity cannot be aliased or exposed through another account';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BankAccount_dedicated_guard" BEFORE INSERT OR UPDATE ON "BankAccount"
FOR EACH ROW EXECUTE FUNCTION mobocom_dedicated_bank_guard();

CREATE TABLE "PaySmsSource" (
 "id" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "bankCode" TEXT NOT NULL,
 "bankAccountId" INTEGER NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "secretCiphertext" TEXT NOT NULL, "templateJson" TEXT NOT NULL,
 "verified" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("version">0 AND length("label") BETWEEN 1 AND 80 AND "bankCode" ~ '^[a-z0-9_]{3,40}$' AND "secretCiphertext" LIKE 'encv1:%')
);
CREATE INDEX "PaySmsSource_bankAccountId_active_idx" ON "PaySmsSource"("bankAccountId","active");
CREATE FUNCTION mobocom_sms_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (ROW(NEW."id",NEW."bankAccountId",NEW."ownerUserId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."bankAccountId",OLD."ownerUserId",OLD."createdAt") OR NEW."version"<>OLD."version"+1) THEN RAISE EXCEPTION 'SMS source identity immutable; versioned claim required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "BankAccount" WHERE "id"=NEW."bankAccountId" AND "collectionUse"='MOBOCOM_PAY') THEN RAISE EXCEPTION 'dedicated account required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PaySmsSource_guard" BEFORE INSERT OR UPDATE ON "PaySmsSource" FOR EACH ROW EXECUTE FUNCTION mobocom_sms_source_guard();
ALTER TABLE "PayBaleNotice" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'BALE', ADD COLUMN "bankCode" TEXT NOT NULL DEFAULT 'bankmeli',
 ADD COLUMN "smsSourceId" TEXT REFERENCES "PaySmsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PayBaleNotice_smsSourceId_sourceEventId_key" ON "PayBaleNotice"("smsSourceId","sourceEventId") WHERE "smsSourceId" IS NOT NULL;
ALTER TABLE "PayBaleNotice" ADD CONSTRAINT "PayBaleNotice_source_type_check" CHECK (("sourceType"='BALE' AND "smsSourceId" IS NULL) OR ("sourceType"='SMS' AND "smsSourceId" IS NOT NULL AND "bankCode" ~ '^[a-z0-9_]{3,40}$'));
ALTER TABLE "PayBaleNotice" DROP CONSTRAINT "PayBaleNotice_fact_check";
ALTER TABLE "PayBaleNotice" ADD CONSTRAINT "PayBaleNotice_fact_check" CHECK (
 "status" IN ('ORIGINAL_TRANSFER','IGNORED','REJECTED','DUPLICATE','CONFLICT') AND "direction" IN ('','CREDIT','DEBIT')
 AND ("amountMinor" IS NULL OR "amountMinor">0) AND length("transferReference")<=64 AND length("code") BETWEEN 1 AND 64 AND length("kind") BETWEEN 1 AND 40
 AND (("occurredFrom" IS NULL AND "occurredBefore" IS NULL) OR ("occurredFrom" IS NOT NULL AND "occurredBefore" IS NOT NULL AND "occurredBefore"="occurredFrom"+INTERVAL '1 minute'))
 AND ("status"<>'REJECTED' OR ("amountMinor" IS NULL AND "direction"='' AND "bankFingerprint" IS NULL))
 AND ("status"<>'ORIGINAL_TRANSFER' OR ("amountMinor" IS NOT NULL AND "direction"='CREDIT' AND "kind" IN ('CARD_TRANSFER','PAYA','SATNA')))
 AND ("duplicateOfId" IS NULL OR "duplicateOfId"<>"id")
 AND (("duplicateOfId" IS NULL AND "status" NOT IN ('DUPLICATE','CONFLICT')) OR ("duplicateOfId" IS NOT NULL AND "status" IN ('DUPLICATE','CONFLICT') AND "bankFingerprint" IS NULL))
);
CREATE TABLE "PayBaleCollection" (
 "id" TEXT PRIMARY KEY, "invoiceId" INTEGER NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "activeInvoiceId" INTEGER UNIQUE,
 "gatewayId" INTEGER NOT NULL REFERENCES "Gateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "bankAccountId" INTEGER NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceInstanceId" TEXT NOT NULL, "sourceAccountId" TEXT NOT NULL, "bankPeerId" TEXT NOT NULL,
 "sourceTypes" TEXT NOT NULL DEFAULT '["BALE"]', "sourceBindings" TEXT NOT NULL DEFAULT '{}',
 "currency" TEXT NOT NULL, "dueMinor" BIGINT NOT NULL, "principalRial" BIGINT NOT NULL, "adjustmentRial" BIGINT NOT NULL, "collectedRial" BIGINT NOT NULL UNIQUE,
 "policyRevision" TEXT NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "acceptedAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'PENDING',
 "noticeId" TEXT UNIQUE REFERENCES "PayBaleNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "principalPaymentId" INTEGER UNIQUE REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "adjustmentPaymentId" INTEGER UNIQUE REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receiptId" INTEGER UNIQUE REFERENCES "PaymentReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receiptAmountRial" BIGINT, "paidCollectedRial" BIGINT, "settlementMethod" TEXT NOT NULL DEFAULT '', "paidAt" TIMESTAMP(3), "reviewReason" TEXT NOT NULL DEFAULT '',
 CONSTRAINT "PayBaleCollection_money_check" CHECK ("dueMinor">0 AND "principalRial">0 AND "adjustmentRial" BETWEEN 10 AND 99990 AND "collectedRial"%10=0
 AND "collectedRial"::numeric="principalRial"::numeric+"adjustmentRial"::numeric
 AND (("currency"='IRR' AND "principalRial"="dueMinor") OR ("currency" IN ('IRT','TMN') AND "principalRial"::numeric="dueMinor"::numeric*10))
 AND (("receiptId" IS NULL AND "receiptAmountRial" IS NULL) OR ("receiptId" IS NOT NULL AND "receiptAmountRial" IS NOT NULL AND "receiptAmountRial" IN ("principalRial","collectedRial")))),
 CONSTRAINT "PayBaleCollection_shape_check" CHECK ("id" ~ '^[A-Za-z0-9_-]{32}$' AND "policyRevision" ~ '^[a-f0-9]{64}$' AND "validFrom">="createdAt" AND "expiresAt">"validFrom"
 AND ("acceptedAt" IS NULL OR ("acceptedAt">="createdAt" AND "acceptedAt"<"expiresAt")) AND length("reviewReason")<=64
 AND "sourceTypes"::jsonb <@ '["SMS","BALE"]'::jsonb AND jsonb_array_length("sourceTypes"::jsonb)>0 AND jsonb_typeof("sourceBindings"::jsonb)='object'),
 CONSTRAINT "PayBaleCollection_state_check" CHECK (
 ("status" IN ('PENDING','UNDER_REVIEW') AND "activeInvoiceId" IS NOT NULL AND "activeInvoiceId"="invoiceId" AND "noticeId" IS NULL AND "principalPaymentId" IS NULL AND "adjustmentPaymentId" IS NULL AND "paidCollectedRial" IS NULL AND "paidAt" IS NULL AND "settlementMethod"='' AND "reviewReason"='' AND (("status"='PENDING' AND "receiptId" IS NULL) OR ("status"='UNDER_REVIEW' AND "receiptId" IS NOT NULL)))
 OR ("status"='PAID' AND "activeInvoiceId" IS NULL AND "principalPaymentId" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "paidAt" IS NOT NULL AND "reviewReason"='' AND "paidCollectedRial" IS NOT NULL AND "paidCollectedRial" IN ("principalRial","collectedRial") AND (("paidCollectedRial"="principalRial" AND "adjustmentPaymentId" IS NULL) OR ("paidCollectedRial"="collectedRial" AND "adjustmentPaymentId" IS NOT NULL)) AND (("settlementMethod"='AUTO' AND "noticeId" IS NOT NULL AND "paidCollectedRial"="collectedRial") OR ("settlementMethod"='MANUAL' AND "receiptId" IS NOT NULL AND "receiptAmountRial"="paidCollectedRial")))
 OR ("status" IN ('EXPIRED','REVIEW') AND "activeInvoiceId" IS NULL AND "principalPaymentId" IS NULL AND "adjustmentPaymentId" IS NULL AND "paidCollectedRial" IS NULL AND "paidAt" IS NULL AND "settlementMethod"='' AND "reviewReason"<>'')
 )
);
CREATE INDEX "PayBaleCollection_invoiceId_createdAt_idx" ON "PayBaleCollection"("invoiceId","createdAt");
CREATE INDEX "PayBaleCollection_status_expiresAt_idx" ON "PayBaleCollection"("status","expiresAt");
CREATE FUNCTION mobocom_bale_collection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv "Invoice"; notice "PayBaleNotice"; principal "Payment"; adjustment "Payment"; receipt "PaymentReceipt"; provider TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."id",NEW."invoiceId",NEW."gatewayId",NEW."bankAccountId",NEW."ownerUserId",NEW."sourceInstanceId",NEW."sourceAccountId",NEW."bankPeerId",NEW."sourceTypes",NEW."sourceBindings",NEW."currency",NEW."dueMinor",NEW."principalRial",NEW."adjustmentRial",NEW."collectedRial",NEW."policyRevision",NEW."validFrom",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id",OLD."invoiceId",OLD."gatewayId",OLD."bankAccountId",OLD."ownerUserId",OLD."sourceInstanceId",OLD."sourceAccountId",OLD."bankPeerId",OLD."sourceTypes",OLD."sourceBindings",OLD."currency",OLD."dueMinor",OLD."principalRial",OLD."adjustmentRial",OLD."collectedRial",OLD."policyRevision",OLD."validFrom",OLD."expiresAt",OLD."createdAt") THEN RAISE EXCEPTION 'quote and amount tombstone immutable'; END IF;
  IF OLD."status"='PAID' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'settled collection immutable'; END IF;
  IF NEW."status"<>OLD."status" AND NOT ((OLD."status"='PENDING' AND NEW."status" IN ('UNDER_REVIEW','PAID','EXPIRED','REVIEW')) OR (OLD."status"='UNDER_REVIEW' AND NEW."status" IN ('PAID','REVIEW')) OR (OLD."status"='EXPIRED' AND NEW."status"='REVIEW') OR (OLD."status"='REVIEW' AND NEW."status"='PAID' AND NEW."settlementMethod"='MANUAL')) THEN RAISE EXCEPTION 'invalid collection transition'; END IF;
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
   SELECT * INTO notice FROM "PayBaleNotice" WHERE "id"=NEW."noticeId";
   IF notice."id" IS NULL OR notice."status" IS DISTINCT FROM 'ORIGINAL_TRANSFER' OR notice."direction" IS DISTINCT FROM 'CREDIT' OR notice."amountMinor" IS DISTINCT FROM NEW."collectedRial" OR notice."bankAccountId" IS DISTINCT FROM NEW."bankAccountId" OR notice."receivedAt"<NEW."createdAt" OR notice."sourceSentAt"<NEW."acceptedAt" OR notice."sourceSentAt"<NEW."validFrom" OR (OLD."status"<>'UNDER_REVIEW' AND notice."receivedAt">NEW."expiresAt") OR NOT (NEW."sourceTypes"::jsonb ? notice."sourceType") THEN RAISE EXCEPTION 'authenticated current transfer proof required'; END IF;
   IF notice."sourceType"='BALE' AND (notice."instanceId" IS DISTINCT FROM NEW."sourceInstanceId" OR notice."sourceAccountId" IS DISTINCT FROM NEW."sourceAccountId" OR notice."bankPeerId" IS DISTINCT FROM NEW."bankPeerId") THEN RAISE EXCEPTION 'Bale source binding mismatch'; END IF;
   IF notice."sourceType"='SMS' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."sourceBindings"::jsonb->'sms') b WHERE b->>'id'=notice."smsSourceId") THEN RAISE EXCEPTION 'SMS source binding mismatch'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PayBaleCollection_guard" BEFORE INSERT OR UPDATE ON "PayBaleCollection" FOR EACH ROW EXECUTE FUNCTION mobocom_bale_collection_guard();
CREATE FUNCTION mobocom_bale_collection_keep_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'final amount reservations are permanent'; END $$;
CREATE TRIGGER "PayBaleCollection_no_delete" BEFORE DELETE ON "PayBaleCollection" FOR EACH ROW EXECUTE FUNCTION mobocom_bale_collection_keep_amount();
-- Receipt submission locks Invoice first. Closure owns the same row lock and checks committed holds.
CREATE FUNCTION mobocom_invoice_receipt_hold() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."status"='VOID' AND OLD."status"<>'VOID' AND EXISTS (SELECT 1 FROM "PayBaleCollection" c JOIN "PaymentReceipt" r ON r."id"=c."receiptId" WHERE c."invoiceId"=OLD."id" AND r."status"='PENDING') THEN RAISE EXCEPTION 'invoice has a receipt awaiting review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Invoice_automatic_receipt_hold" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION mobocom_invoice_receipt_hold();
