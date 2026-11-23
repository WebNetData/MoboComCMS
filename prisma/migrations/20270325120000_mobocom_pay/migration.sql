-- AlterTable
ALTER TABLE "WalletTx" ADD COLUMN     "withdrawableAfterMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "withdrawableDeltaMinor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WalletAccount" ADD COLUMN     "withdrawableMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayMerchant" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayTerminal" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "returnUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPayment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transferReference" TEXT NOT NULL DEFAULT '',
    "walletTxId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayBankEvent" (
    "targetPaymentId" TEXT,
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "transferReference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayBankEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaySettlementQuote" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "railId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "payoutAtoms" BIGINT NOT NULL,
    "rialPerUnit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaySettlementQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaySettlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "payoutAtoms" BIGINT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reference" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "reserveWalletTxId" INTEGER NOT NULL,
    "releaseWalletTxId" INTEGER,
    "approvedById" INTEGER,
    "completedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayMerchant_userId_key" ON "PayMerchant"("userId");

-- CreateIndex
CREATE INDEX "PayTerminal_merchantId_active_idx" ON "PayTerminal"("merchantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PayPayment_walletTxId_key" ON "PayPayment"("walletTxId");

-- CreateIndex
CREATE INDEX "PayPayment_merchantId_createdAt_idx" ON "PayPayment"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "PayPayment_bankAccountId_transferReference_status_idx" ON "PayPayment"("bankAccountId", "transferReference", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayPayment_merchantId_idempotencyKey_key" ON "PayPayment"("merchantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayPayment_terminalId_externalId_key" ON "PayPayment"("terminalId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PayBankEvent_paymentId_key" ON "PayBankEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PayBankEvent_status_createdAt_idx" ON "PayBankEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayBankEvent_providerId_externalId_key" ON "PayBankEvent"("providerId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PayBankEvent_bankAccountId_transferReference_key" ON "PayBankEvent"("bankAccountId", "transferReference");

-- CreateIndex
CREATE INDEX "PaySettlementQuote_merchantId_createdAt_idx" ON "PaySettlementQuote"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaySettlement_quoteId_key" ON "PaySettlement"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PaySettlement_reserveWalletTxId_key" ON "PaySettlement"("reserveWalletTxId");

-- CreateIndex
CREATE UNIQUE INDEX "PaySettlement_releaseWalletTxId_key" ON "PaySettlement"("releaseWalletTxId");

-- CreateIndex
CREATE INDEX "PaySettlement_merchantId_createdAt_idx" ON "PaySettlement"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaySettlement_status_createdAt_idx" ON "PaySettlement"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaySettlement_merchantId_idempotencyKey_key" ON "PaySettlement"("merchantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PayMerchant" ADD CONSTRAINT "PayMerchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayTerminal" ADD CONSTRAINT "PayTerminal_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "PayMerchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "PayMerchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PayTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_walletTxId_fkey" FOREIGN KEY ("walletTxId") REFERENCES "WalletTx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayBankEvent" ADD CONSTRAINT "PayBankEvent_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayBankEvent" ADD CONSTRAINT "PayBankEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlementQuote" ADD CONSTRAINT "PaySettlementQuote_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "PayMerchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "PayMerchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "PaySettlementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_reserveWalletTxId_fkey" FOREIGN KEY ("reserveWalletTxId") REFERENCES "WalletTx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_releaseWalletTxId_fkey" FOREIGN KEY ("releaseWalletTxId") REFERENCES "WalletTx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive ledger vocabulary; legacy balances are deliberately non-withdrawable.
ALTER TABLE "WalletTx" DROP CONSTRAINT "WalletTx_type_check";
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_type_check" CHECK ("type" IN ('TOPUP','PURCHASE','REFUND','ADMIN_CREDIT','ADMIN_DEBIT','RENEWAL','REFERRAL','GIFT_CARD','LOYALTY','PAY_CREDIT','PAY_RESERVE','PAY_RELEASE'));
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_withdrawable_subset" CHECK ("withdrawableMinor" >= 0 AND "withdrawableMinor" <= "balanceMinor" AND ("currency" = 'IRR' OR "withdrawableMinor" = 0));
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_withdrawable_subset" CHECK ("withdrawableAfterMinor" >= 0 AND "withdrawableAfterMinor" <= "balanceAfterMinor"),
 ADD CONSTRAINT "WalletTx_pay_proceeds_sign" CHECK ("type" NOT IN ('PAY_CREDIT','PAY_RESERVE','PAY_RELEASE') OR ("currency" = 'IRR' AND "status" = 'DONE' AND "withdrawableDeltaMinor" = "amountMinor" AND CASE WHEN "type"='PAY_RESERVE' THEN "amountMinor" < 0 ELSE "amountMinor" > 0 END));
CREATE FUNCTION "mobocom_wallet_proceeds_immutable"() RETURNS trigger AS $$ BEGIN
 IF OLD."status"='DONE' AND (NEW."withdrawableDeltaMinor" IS DISTINCT FROM OLD."withdrawableDeltaMinor" OR NEW."withdrawableAfterMinor" IS DISTINCT FROM OLD."withdrawableAfterMinor" OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId") THEN RAISE EXCEPTION 'completed wallet proceeds are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "WalletTx_proceeds_rules" BEFORE UPDATE ON "WalletTx" FOR EACH ROW EXECUTE FUNCTION "mobocom_wallet_proceeds_immutable"();

ALTER TABLE "PayMerchant" ADD CONSTRAINT "PayMerchant_status_check" CHECK ("status" IN ('PENDING','ACTIVE','SUSPENDED'));
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_status_check" CHECK ("status" IN ('PENDING','PAID','EXPIRED')),
 ADD CONSTRAINT "PayPayment_money_check" CHECK ("amountMinor">0 AND "feeMinor">=0 AND "netMinor">0 AND "netMinor"+"feeMinor"="amountMinor" AND "expiresAt">"createdAt"),
 ADD CONSTRAINT "PayPayment_paidAt_check" CHECK (("status"='PAID')=("paidAt" IS NOT NULL));
ALTER TABLE "PayBankEvent" ADD CONSTRAINT "PayBankEvent_money_check" CHECK ("amountMinor">0),
 ADD CONSTRAINT "PayBankEvent_status_check" CHECK (("status"='UNMATCHED' AND "paymentId" IS NULL) OR ("status"='MATCHED' AND "paymentId" IS NOT NULL));
ALTER TABLE "PaySettlementQuote" ADD CONSTRAINT "PayQuote_money_check" CHECK ("amountMinor">"feeMinor" AND "feeMinor">=0 AND "payoutAtoms">0 AND "decimals" BETWEEN 0 AND 18 AND "expiresAt">"createdAt");
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_money_check" CHECK ("amountMinor">"feeMinor" AND "feeMinor">=0 AND "payoutAtoms">0 AND "decimals" BETWEEN 0 AND 18),
 ADD CONSTRAINT "PaySettlement_status_check" CHECK ("status" IN ('REQUESTED','APPROVED','PAID','REJECTED')),
 ADD CONSTRAINT "PaySettlement_proof_check" CHECK (("status"<>'APPROVED' OR "approvedById" IS NOT NULL) AND ("status"<>'PAID' OR ("approvedById" IS NOT NULL AND "completedById" IS NOT NULL AND length("reference")>=6)) AND ("status"<>'REJECTED' OR ("completedById" IS NOT NULL AND length("reason")>0)));
CREATE UNIQUE INDEX "PaySettlement_paid_reference_key" ON "PaySettlement"("asset","network",lower("reference")) WHERE "status"='PAID';

CREATE FUNCTION "mobocom_pay_rules"() RETURNS trigger AS $$ BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  IF ROW(NEW."merchantId",NEW."terminalId",NEW."bankAccountId",NEW."externalId",NEW."idempotencyKey",NEW."fingerprint",NEW."amountMinor",NEW."feeMinor",NEW."netMinor",NEW."createdAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."merchantId",OLD."terminalId",OLD."bankAccountId",OLD."externalId",OLD."idempotencyKey",OLD."fingerprint",OLD."amountMinor",OLD."feeMinor",OLD."netMinor",OLD."createdAt",OLD."expiresAt") OR (OLD."status"<>'PENDING' AND NEW."status"<>OLD."status") OR (OLD."walletTxId" IS NOT NULL AND NEW."walletTxId" IS DISTINCT FROM OLD."walletTxId") OR (OLD."status"='PAID' AND ROW(NEW."transferReference",NEW."paidAt") IS DISTINCT FROM ROW(OLD."transferReference",OLD."paidAt")) THEN RAISE EXCEPTION 'payment facts are immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PayBankEvent' THEN
  IF ROW(NEW."providerId",NEW."externalId",NEW."bankAccountId",NEW."amountMinor",NEW."transferReference",NEW."occurredAt",NEW."payloadHash",NEW."targetPaymentId") IS DISTINCT FROM ROW(OLD."providerId",OLD."externalId",OLD."bankAccountId",OLD."amountMinor",OLD."transferReference",OLD."occurredAt",OLD."payloadHash",OLD."targetPaymentId") OR (OLD."status"='MATCHED' AND ROW(NEW."status",NEW."paymentId") IS DISTINCT FROM ROW(OLD."status",OLD."paymentId")) THEN RAISE EXCEPTION 'bank facts are immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PaySettlementQuote' THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'settlement quote is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PaySettlement' THEN
  IF ROW(NEW."merchantId",NEW."quoteId",NEW."idempotencyKey",NEW."fingerprint",NEW."amountMinor",NEW."feeMinor",NEW."payoutAtoms",NEW."asset",NEW."network",NEW."decimals",NEW."destination",NEW."reserveWalletTxId") IS DISTINCT FROM ROW(OLD."merchantId",OLD."quoteId",OLD."idempotencyKey",OLD."fingerprint",OLD."amountMinor",OLD."feeMinor",OLD."payoutAtoms",OLD."asset",OLD."network",OLD."decimals",OLD."destination",OLD."reserveWalletTxId") OR (NEW."status"<>OLD."status" AND NOT ((OLD."status"='REQUESTED' AND NEW."status" IN ('APPROVED','REJECTED')) OR (OLD."status"='APPROVED' AND NEW."status" IN ('PAID','REJECTED')))) OR (OLD."status" IN ('PAID','REJECTED') AND ROW(NEW."status",NEW."reference",NEW."reason",NEW."approvedById",NEW."completedById") IS DISTINCT FROM ROW(OLD."status",OLD."reference",OLD."reason",OLD."approvedById",OLD."completedById")) OR (OLD."releaseWalletTxId" IS NOT NULL AND NEW."releaseWalletTxId" IS DISTINCT FROM OLD."releaseWalletTxId") THEN RAISE EXCEPTION 'settlement facts or transition invalid' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayPayment_rules" BEFORE UPDATE ON "PayPayment" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_rules"();
CREATE TRIGGER "PayBankEvent_rules" BEFORE UPDATE ON "PayBankEvent" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_rules"();
CREATE TRIGGER "PayQuote_rules" BEFORE UPDATE ON "PaySettlementQuote" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_rules"();
CREATE TRIGGER "PaySettlement_rules" BEFORE UPDATE ON "PaySettlement" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_rules"();

-- Composed money effects must agree at commit, after both claimed rows were linked.
CREATE FUNCTION "mobocom_pay_links"() RETURNS trigger AS $$ DECLARE p "PayPayment"; s "PaySettlement"; m INTEGER; BEGIN
 IF TG_TABLE_NAME='PayPayment' THEN
  SELECT * INTO p FROM "PayPayment" WHERE "id"=NEW."id";
  IF NOT EXISTS(SELECT 1 FROM "PayTerminal" t WHERE t."id"=p."terminalId" AND t."merchantId"=p."merchantId") THEN RAISE EXCEPTION 'payment merchant mismatch' USING ERRCODE='23514'; END IF;
  IF p."status"='PAID' AND (NOT EXISTS(SELECT 1 FROM "WalletTx" w JOIN "PayMerchant" m ON m."userId"=w."userId" WHERE m."id"=p."merchantId" AND w."id"=p."walletTxId" AND w."status"='DONE' AND w."type"='PAY_CREDIT' AND w."amountMinor"=p."netMinor") OR NOT EXISTS(SELECT 1 FROM "PayBankEvent" e WHERE e."paymentId"=p."id" AND e."targetPaymentId"=p."id" AND e."status"='MATCHED' AND e."amountMinor"=p."amountMinor" AND e."bankAccountId"=p."bankAccountId" AND e."transferReference"=p."transferReference" AND e."occurredAt" BETWEEN p."createdAt" AND p."expiresAt")) THEN RAISE EXCEPTION 'verified payment requires bank and wallet facts' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PaySettlement' THEN
  SELECT * INTO s FROM "PaySettlement" WHERE "id"=NEW."id";
  SELECT "userId" INTO m FROM "PayMerchant" WHERE "id"=s."merchantId";
  IF s."approvedById"=m OR s."completedById"=m OR NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."reserveWalletTxId" AND w."userId"=m AND w."type"='PAY_RESERVE' AND w."amountMinor"=-s."amountMinor") OR NOT EXISTS(SELECT 1 FROM "PaySettlementQuote" q WHERE q."id"=s."quoteId" AND q."merchantId"=s."merchantId" AND ROW(q."amountMinor",q."feeMinor",q."payoutAtoms",q."asset",q."network",q."decimals")=ROW(s."amountMinor",s."feeMinor",s."payoutAtoms",s."asset",s."network",s."decimals")) OR (s."status"='REJECTED' AND NOT EXISTS(SELECT 1 FROM "WalletTx" w WHERE w."id"=s."releaseWalletTxId" AND w."userId"=m AND w."type"='PAY_RELEASE' AND w."amountMinor"=s."amountMinor")) THEN RAISE EXCEPTION 'settlement requires matching reserved or released funds' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "PayPayment_links" AFTER INSERT OR UPDATE ON "PayPayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_links"();
CREATE CONSTRAINT TRIGGER "PaySettlement_links" AFTER INSERT OR UPDATE ON "PaySettlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_links"();


ALTER TABLE "PayBankEvent" ADD CONSTRAINT "PayBankEvent_targetPaymentId_fkey" FOREIGN KEY ("targetPaymentId") REFERENCES "PayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletTx" ADD COLUMN "reversalOfId" INTEGER;
CREATE UNIQUE INDEX "WalletTx_reversalOfId_key" ON "WalletTx"("reversalOfId");
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "WalletTx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
