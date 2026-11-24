-- Additive channel/acquisition/source snapshots; historical denominations retained.
BEGIN;
LOCK TABLE "PayPayment", "PaySettlementQuote", "PaySettlement", "WalletAccount", "WalletTx" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "PayTerminal" ADD COLUMN "channelType" TEXT NOT NULL DEFAULT 'WEBSITE', ADD COLUMN "channelUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayTerminal" ADD CONSTRAINT "PayTerminal_channel_check" CHECK ("channelType" IN ('WEBSITE','BOT','INSTAGRAM','CHANNEL','PAYMENT_LINK','OTHER') AND (("channelType" IN ('WEBSITE','BOT') AND "returnUrl" LIKE 'https://%') OR ("channelType"='PAYMENT_LINK' AND "returnUrl"='' AND "channelUrl"='') OR ("channelType" IN ('INSTAGRAM','CHANNEL','OTHER') AND "channelUrl" LIKE 'https://%' AND "returnUrl"="channelUrl")));
ALTER TABLE "PayMerchant" ADD COLUMN "creditCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD CONSTRAINT "PayMerchant_credit_currency" CHECK ("creditCurrency" IN ('IRR','USDT'));
ALTER TABLE "PayPayment" ADD COLUMN "creditCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD COLUMN "creditMinor" BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN "creditRateRial" TEXT NOT NULL DEFAULT '1', ADD COLUMN "creditRateAt" TIMESTAMP(3), ADD COLUMN "creditRateSource" TEXT NOT NULL DEFAULT '', ADD COLUMN "creditRoundingRial" BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN "purchaseTermsHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "purchaseRecipientName" TEXT NOT NULL DEFAULT '', ADD COLUMN "purchasePayerHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "purchaseAcceptedHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "purchaseAcceptedAt" TIMESTAMP(3);
UPDATE "PayPayment" SET "creditMinor"="netMinor";
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE "PaySettlementQuote" ADD COLUMN "sourceCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD COLUMN "sourceMinor" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "sourceRateRial" TEXT NOT NULL DEFAULT '1', ADD COLUMN "rateAt" TIMESTAMP(3), ADD COLUMN "feeCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD COLUMN "feeAmount" TEXT NOT NULL DEFAULT '0', ADD COLUMN "feePolicySnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaySettlement" ADD COLUMN "sourceCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD COLUMN "sourceMinor" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "sourceRateRial" TEXT NOT NULL DEFAULT '1', ADD COLUMN "rateAt" TIMESTAMP(3), ADD COLUMN "feeCurrency" TEXT NOT NULL DEFAULT 'IRR', ADD COLUMN "feeAmount" TEXT NOT NULL DEFAULT '0', ADD COLUMN "feePolicySnapshot" TEXT NOT NULL DEFAULT '';
-- Only the owned immutable triggers are disabled for this locked historical backfill.
ALTER TABLE "PaySettlementQuote" DISABLE TRIGGER "PayQuote_rules";
ALTER TABLE "PaySettlement" DISABLE TRIGGER "PaySettlement_rules";
UPDATE "PaySettlementQuote" SET "sourceMinor"="amountMinor", "feeAmount"="feeMinor"::text;
UPDATE "PaySettlement" SET "sourceMinor"="amountMinor", "feeAmount"="feeMinor"::text;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE "PaySettlementQuote" ENABLE TRIGGER "PayQuote_rules";
ALTER TABLE "PaySettlement" ENABLE TRIGGER "PaySettlement_rules";
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_withdrawable_subset";
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_withdrawable_subset" CHECK ("withdrawableMinor">=0 AND "withdrawableMinor"<="balanceMinor" AND ("currency" IN ('IRR','USDT') OR "withdrawableMinor"=0));
ALTER TABLE "WalletTx" DROP CONSTRAINT "WalletTx_pay_proceeds_sign";
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_pay_proceeds_sign" CHECK ("type" NOT IN ('PAY_CREDIT','PAY_RESERVE','PAY_RELEASE') OR ("currency" IN ('IRR','USDT') AND "status"='DONE' AND "withdrawableDeltaMinor"="amountMinor" AND CASE WHEN "type"='PAY_RESERVE' THEN "amountMinor"<0 ELSE "amountMinor">0 END));
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_credit_snapshot_check" CHECK ("creditMinor">0 AND "creditRoundingRial">=0 AND (("creditCurrency"='IRR' AND "creditMinor"="netMinor" AND "creditRateRial"='1' AND "creditRoundingRial"=0 AND "purchaseTermsHash"='') OR ("creditCurrency"='USDT' AND "creditRateRial" ~ '^[0-9]{1,18}(\.[0-9]{1,12})?$' AND "creditRateRial"::numeric>0 AND "creditRateAt" IS NOT NULL AND "purchaseTermsHash" ~ '^[a-f0-9]{64}$' AND "purchaseRecipientName"<>'' AND "creditMinor"=floor("netMinor"::numeric*100/"creditRateRial"::numeric) AND "creditRoundingRial"="netMinor"-ceil("creditMinor"::numeric*"creditRateRial"::numeric/100))));
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_purchase_accept_check" CHECK ("creditCurrency"<>'USDT' OR ("purchaseAcceptedAt" IS NULL AND "purchaseAcceptedHash"='' AND "purchasePayerHash"='' AND "invoiceId" IS NULL AND "status"<>'PAID') OR ("purchaseAcceptedAt" IS NOT NULL AND "purchaseAcceptedAt" BETWEEN "createdAt" AND "expiresAt" AND "purchaseAcceptedHash"="purchaseTermsHash" AND "purchasePayerHash"<>'' AND "purchasePayerHash"="payerSessionHash" AND "payerVerifiedAt" IS NOT NULL));
ALTER TABLE "PaySettlementQuote" ADD CONSTRAINT "PaySettlementQuote_source_check" CHECK ("sourceCurrency" IN ('IRR','USDT') AND "sourceMinor">0 AND (("sourceCurrency"='IRR' AND "sourceMinor"="amountMinor" AND "sourceRateRial"='1') OR ("sourceCurrency"='USDT' AND "sourceRateRial" ~ '^[0-9]{1,18}(\.[0-9]{1,12})?$' AND "sourceRateRial"::numeric>0 AND "rateAt" IS NOT NULL AND "amountMinor"=floor("sourceMinor"::numeric*"sourceRateRial"::numeric/100))) AND "feeCurrency" IN ('IRR','USDT') AND "feeAmount" ~ '^[0-9]{1,19}(\.[0-9]{1,6})?$');
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_source_check" CHECK ("sourceCurrency" IN ('IRR','USDT') AND "sourceMinor">0 AND (("sourceCurrency"='IRR' AND "sourceMinor"="amountMinor" AND "sourceRateRial"='1') OR ("sourceCurrency"='USDT' AND "sourceRateRial" ~ '^[0-9]{1,18}(\.[0-9]{1,12})?$' AND "sourceRateRial"::numeric>0 AND "rateAt" IS NOT NULL AND "amountMinor"=floor("sourceMinor"::numeric*"sourceRateRial"::numeric/100))) AND "feeCurrency" IN ('IRR','USDT') AND "feeAmount" ~ '^[0-9]{1,19}(\.[0-9]{1,6})?$');
CREATE FUNCTION "mobocom_pay_asset_facts"() RETURNS trigger AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF TG_TABLE_NAME='PayPayment' THEN
   IF NEW."creditCurrency"='IRR' AND NEW."creditMinor"=0 THEN NEW."creditMinor"=NEW."netMinor"; END IF;
  ELSE
   IF NEW."sourceCurrency"='IRR' AND NEW."sourceMinor"=0 THEN NEW."sourceMinor"=NEW."amountMinor"; END IF;
   IF NEW."feePolicySnapshot"='' AND NEW."feeCurrency"='IRR' AND NEW."feeAmount"='0' THEN NEW."feeAmount"=NEW."feeMinor"::text; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='PayPayment' THEN
  IF ROW(NEW."creditCurrency",NEW."creditMinor",NEW."creditRateRial",NEW."creditRateAt",NEW."creditRateSource",NEW."creditRoundingRial",NEW."purchaseTermsHash",NEW."purchaseRecipientName") IS DISTINCT FROM ROW(OLD."creditCurrency",OLD."creditMinor",OLD."creditRateRial",OLD."creditRateAt",OLD."creditRateSource",OLD."creditRoundingRial",OLD."purchaseTermsHash",OLD."purchaseRecipientName") OR
    (OLD."purchaseAcceptedAt" IS NOT NULL AND (NEW."invoiceId" IS NOT NULL OR OLD."invoiceId" IS NOT NULL OR NEW."status"='PAID') AND ROW(NEW."purchaseAcceptedAt",NEW."purchaseAcceptedHash",NEW."purchasePayerHash") IS DISTINCT FROM ROW(OLD."purchaseAcceptedAt",OLD."purchaseAcceptedHash",OLD."purchasePayerHash")) THEN RAISE EXCEPTION 'acquisition facts are immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW."sourceCurrency",NEW."sourceMinor",NEW."sourceRateRial",NEW."rateAt",NEW."feeCurrency",NEW."feeAmount",NEW."feePolicySnapshot") IS DISTINCT FROM ROW(OLD."sourceCurrency",OLD."sourceMinor",OLD."sourceRateRial",OLD."rateAt",OLD."feeCurrency",OLD."feeAmount",OLD."feePolicySnapshot") THEN RAISE EXCEPTION 'source asset facts are immutable' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayPayment_asset_facts" BEFORE INSERT OR UPDATE ON "PayPayment" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_asset_facts"();
CREATE TRIGGER "PayQuote_asset_facts" BEFORE INSERT OR UPDATE ON "PaySettlementQuote" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_asset_facts"();
CREATE TRIGGER "PaySettlement_asset_facts" BEFORE INSERT OR UPDATE ON "PaySettlement" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_asset_facts"();
CREATE OR REPLACE FUNCTION "mobocom_pay_links"() RETURNS trigger AS $$ DECLARE p "PayPayment"; s "PaySettlement"; m INTEGER; BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  SELECT * INTO p FROM "PayPayment" WHERE "id"=NEW."id";
  IF p."status"='PAID' THEN
   IF p."creditCurrency"='USDT' AND NOT (
     EXISTS(SELECT 1 FROM "PayBankEvent" b WHERE b."paymentId"=p."id" AND b."status"='MATCHED' AND b."occurredAt"<=p."expiresAt") OR
     EXISTS(SELECT 1 FROM "PayBaleCollection" c JOIN "PayBaleNotice" n ON n."id"=c."noticeId" WHERE c."invoiceId"=p."invoiceId" AND c."status"='PAID' AND n."status"='ORIGINAL_TRANSFER' AND n."direction"='CREDIT' AND n."sourceSentAt"<=p."expiresAt") OR
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
