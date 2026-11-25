-- Three-field forwarder receipt time is not original-time proof for locked USDT purchases.
BEGIN;
CREATE OR REPLACE FUNCTION "mobocom_pay_links"() RETURNS trigger AS $$ DECLARE p "PayPayment"; s "PaySettlement"; m INTEGER; BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  SELECT * INTO p FROM "PayPayment" WHERE "id"=NEW."id";
  IF p."status"='PAID' THEN
   IF p."creditCurrency"='USDT' AND NOT (
     EXISTS(SELECT 1 FROM "PayBankEvent" b WHERE b."paymentId"=p."id" AND b."status"='MATCHED' AND b."occurredAt"<=p."expiresAt") OR
     EXISTS(SELECT 1 FROM "PayBaleCollection" c JOIN "PayBaleNotice" n ON n."id"=c."noticeId" WHERE c."invoiceId"=p."invoiceId" AND c."status"='PAID' AND n."status"='ORIGINAL_TRANSFER' AND n."direction"='CREDIT' AND n."code"<>'SMS_FORWARDER_CREDIT' AND n."sourceSentAt"<=p."expiresAt") OR
     EXISTS(SELECT 1 FROM "PaymentReceipt" r WHERE r."invoiceId"=p."invoiceId" AND r."status"='APPROVED' AND r."reviewedBy" IS NOT NULL AND r."createdAt"<=p."expiresAt")
   ) THEN RAISE EXCEPTION 'USDT acquisition requires timely payment proof' USING ERRCODE='23514'; END IF;
   SELECT "userId" INTO m FROM "PayMerchant" WHERE "id"=p."merchantId";
   IF NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=p."walletTxId" AND w."userId"=m AND w."type"='PAY_CREDIT' AND w."currency"=p."creditCurrency" AND w."status"='DONE' AND w."amountMinor"=p."creditMinor" AND w."withdrawableDeltaMinor"=p."creditMinor") OR
     NOT (EXISTS(SELECT 1 FROM "PayBankEvent" b WHERE b."paymentId"=p."id" AND b."targetPaymentId"=p."id" AND b."status"='MATCHED' AND b."amountMinor"=p."totalMinor" AND b."bankAccountId"=p."bankAccountId" AND b."transferReference"=p."transferReference" AND b."occurredAt" BETWEEN p."createdAt" AND p."expiresAt") OR
          EXISTS(SELECT 1 FROM "Invoice" i JOIN "Payment" j ON j."invoiceId"=i."id" WHERE i."id"=p."invoiceId" AND i."kind"='PAY_COLLECTION' AND i."status"='PAID' AND i."totalMinor"=p."totalMinor" AND i."paidAmountMinor"=p."totalMinor" AND i."currency"='IRR' AND j."status"='CONFIRMED' AND j."amountMinor"=p."totalMinor" AND j."currency"='IRR')) THEN RAISE EXCEPTION 'verified payment proof is incomplete' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO s FROM "PaySettlement" WHERE "id"=NEW."id";
  SELECT "userId" INTO m FROM "PayMerchant" WHERE "id"=s."merchantId";
  IF NOT EXISTS(SELECT 1 FROM "PaySettlementQuote" q WHERE q."id"=s."quoteId" AND q."merchantId"=s."merchantId" AND q."amountMinor"=s."amountMinor" AND q."feeMinor"=s."feeMinor" AND q."payoutAtoms"=s."payoutAtoms" AND q."asset"=s."asset" AND q."network"=s."network" AND q."decimals"=s."decimals" AND q."sourceCurrency"=s."sourceCurrency" AND q."sourceMinor"=s."sourceMinor" AND q."sourceRateRial"=s."sourceRateRial" AND q."feeCurrency"=s."feeCurrency" AND q."feeAmount"=s."feeAmount" AND q."feePolicySnapshot"=s."feePolicySnapshot" AND q."rateAt" IS NOT DISTINCT FROM s."rateAt") OR NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."reserveWalletTxId" AND w."userId"=m AND w."type"='PAY_RESERVE' AND w."currency"=s."sourceCurrency" AND w."status"='DONE' AND w."amountMinor"=-s."sourceMinor" AND w."withdrawableDeltaMinor"=-s."sourceMinor") OR (s."status"='REJECTED' AND NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."releaseWalletTxId" AND w."userId"=m AND w."type"='PAY_RELEASE' AND w."status"='DONE' AND w."currency"=s."sourceCurrency" AND w."amountMinor"=s."sourceMinor" AND w."withdrawableDeltaMinor"=s."sourceMinor")) OR s."approvedById"=m OR s."completedById"=m THEN RAISE EXCEPTION 'settlement proof is incomplete' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL; END; $$ LANGUAGE plpgsql;
COMMIT;
