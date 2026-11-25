-- Additive merchant delivery evidence and reviewed settlement operations.
BEGIN;
-- AlterTable
ALTER TABLE "PaySettlement" ADD COLUMN     "approvalPolicyRevision" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvalThresholdRial" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "destinationLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "destinationProfileId" TEXT,
ADD COLUMN     "destinationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstApprovedAt" TIMESTAMP(3),
ADD COLUMN     "requiresSecondApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "secondApprovedAt" TIMESTAMP(3),
ADD COLUMN     "secondApprovedById" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayWebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "cycleAttempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCode" TEXT NOT NULL DEFAULT '',
    "httpStatus" INTEGER,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayWebhookAttempt" (
    "configVersion" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "code" TEXT NOT NULL DEFAULT '',
    "httpStatus" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PayWebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaySettlementDestination" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "railId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaySettlementDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayWebhookEndpoint_terminalId_key" ON "PayWebhookEndpoint"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "PayWebhookDelivery_paymentId_key" ON "PayWebhookDelivery"("paymentId");

-- CreateIndex
CREATE INDEX "PayWebhookDelivery_status_nextAttemptAt_idx" ON "PayWebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PayWebhookDelivery_endpointId_createdAt_idx" ON "PayWebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayWebhookAttempt_token_key" ON "PayWebhookAttempt"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PayWebhookAttempt_deliveryId_number_key" ON "PayWebhookAttempt"("deliveryId", "number");

-- CreateIndex
CREATE INDEX "PaySettlementDestination_merchantId_active_idx" ON "PaySettlementDestination"("merchantId", "active");

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_secondApprovedById_fkey" FOREIGN KEY ("secondApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_destinationProfileId_fkey" FOREIGN KEY ("destinationProfileId") REFERENCES "PaySettlementDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayWebhookEndpoint" ADD CONSTRAINT "PayWebhookEndpoint_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PayTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayWebhookDelivery" ADD CONSTRAINT "PayWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "PayWebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayWebhookDelivery" ADD CONSTRAINT "PayWebhookDelivery_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayWebhookAttempt" ADD CONSTRAINT "PayWebhookAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PayWebhookDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySettlementDestination" ADD CONSTRAINT "PaySettlementDestination_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "PayMerchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PaySettlement" ADD CONSTRAINT "PaySettlement_center_check" CHECK (
 "version">=0 AND "approvalThresholdRial">=0 AND "destinationVersion">=0
 AND "requiresSecondApproval"=("approvalThresholdRial">0 AND "amountMinor">="approvalThresholdRial")
 AND ("secondApprovedById" IS NULL)=("secondApprovedAt" IS NULL)
 AND ("requiresSecondApproval" OR "secondApprovedById" IS NULL)
 AND (NOT "requiresSecondApproval" OR "approvedById" IS NULL OR "firstApprovedAt" IS NOT NULL)
 AND (NOT "requiresSecondApproval" OR "status" NOT IN ('APPROVED','PAID') OR
      ("approvedById" IS NOT NULL AND "firstApprovedAt" IS NOT NULL AND "secondApprovedById" IS NOT NULL AND "secondApprovedById"<>"approvedById" AND "secondApprovedAt">="firstApprovedAt"))
 AND ("scheduledFor" IS NULL OR ("scheduledFor">"createdAt" AND "scheduledFor"<="createdAt"+interval '30 days'))
 AND length("approvalPolicyRevision") IN (0,64)
);
ALTER TABLE "PaySettlementDestination" ADD CONSTRAINT "PaySettlementDestination_check" CHECK ("version">=0 AND length("label") BETWEEN 1 AND 80 AND length("destination") BETWEEN 1 AND 150);

CREATE FUNCTION "mobocom_pay_settlement_center_guard"() RETURNS trigger AS $$
DECLARE owner_id INTEGER; profile "PaySettlementDestination"; rail TEXT;
BEGIN
 IF TG_TABLE_NAME='PaySettlementDestination' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'saved destination history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(NEW."id",NEW."merchantId",NEW."railId",NEW."asset",NEW."network",NEW."destination",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."merchantId",OLD."railId",OLD."asset",OLD."network",OLD."destination",OLD."createdAt") OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'saved destination facts are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."createdAt",NEW."scheduledFor",NEW."destinationProfileId",NEW."destinationVersion",NEW."destinationLabel",NEW."requiresSecondApproval",NEW."approvalThresholdRial",NEW."approvalPolicyRevision") IS DISTINCT FROM ROW(OLD."createdAt",OLD."scheduledFor",OLD."destinationProfileId",OLD."destinationVersion",OLD."destinationLabel",OLD."requiresSecondApproval",OLD."approvalThresholdRial",OLD."approvalPolicyRevision") OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'settlement policy and schedule are immutable' USING ERRCODE='23514'; END IF;
  IF OLD."approvedById" IS NOT NULL AND ROW(NEW."approvedById",NEW."firstApprovedAt") IS DISTINCT FROM ROW(OLD."approvedById",OLD."firstApprovedAt") THEN RAISE EXCEPTION 'first approval is immutable' USING ERRCODE='23514'; END IF;
  IF OLD."secondApprovedById" IS NOT NULL AND ROW(NEW."secondApprovedById",NEW."secondApprovedAt") IS DISTINCT FROM ROW(OLD."secondApprovedById",OLD."secondApprovedAt") THEN RAISE EXCEPTION 'second approval is immutable' USING ERRCODE='23514'; END IF;
  IF OLD."approvedById" IS NULL AND NEW."approvedById" IS NOT NULL AND (OLD."status"<>'REQUESTED' OR NEW."status" NOT IN ('REQUESTED','APPROVED') OR NEW."firstApprovedAt" IS NULL) THEN RAISE EXCEPTION 'first approval facts are incomplete' USING ERRCODE='23514'; END IF;
  IF OLD."secondApprovedById" IS NULL AND NEW."secondApprovedById" IS NOT NULL AND (OLD."status"<>'REQUESTED' OR OLD."approvedById" IS NULL OR NEW."status"<>'APPROVED') THEN RAISE EXCEPTION 'second approval transition is invalid' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW."approvedById" IS NOT NULL OR NEW."secondApprovedById" IS NOT NULL OR NEW."firstApprovedAt" IS NOT NULL OR NEW."secondApprovedAt" IS NOT NULL THEN RAISE EXCEPTION 'new request cannot contain prior approvals' USING ERRCODE='23514'; END IF;
  IF NEW."destinationProfileId" IS NOT NULL THEN
   SELECT * INTO profile FROM "PaySettlementDestination" WHERE "id"=NEW."destinationProfileId";
   SELECT "railId" INTO rail FROM "PaySettlementQuote" WHERE "id"=NEW."quoteId";
   IF profile."id" IS NULL OR NOT profile."active" OR profile."merchantId"<>NEW."merchantId" OR profile."version"<>NEW."destinationVersion" OR profile."railId"<>rail OR ROW(profile."asset",profile."network",profile."destination",profile."label") IS DISTINCT FROM ROW(NEW."asset",NEW."network",NEW."destination",NEW."destinationLabel") THEN RAISE EXCEPTION 'saved destination binding is invalid' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 SELECT "userId" INTO owner_id FROM "PayMerchant" WHERE "id"=NEW."merchantId";
 IF NEW."approvedById"=owner_id OR NEW."secondApprovedById"=owner_id OR NEW."secondApprovedById"=NEW."approvedById" THEN RAISE EXCEPTION 'independent nonmerchant approvals are required' USING ERRCODE='23514'; END IF;
 IF NEW."scheduledFor" IS NOT NULL AND NEW."scheduledFor">CURRENT_TIMESTAMP AND (NEW."status" IN ('APPROVED','PAID') OR (TG_OP='UPDATE' AND NEW."approvedById" IS DISTINCT FROM OLD."approvedById")) THEN RAISE EXCEPTION 'scheduled settlement is not due' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PaySettlement_center_guard" BEFORE INSERT OR UPDATE ON "PaySettlement" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_settlement_center_guard"();
CREATE TRIGGER "PaySettlementDestination_guard" BEFORE UPDATE OR DELETE ON "PaySettlementDestination" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_settlement_center_guard"();

ALTER TABLE "PayWebhookEndpoint" ADD CONSTRAINT "PayWebhookEndpoint_check" CHECK ("version">=1 AND "url" LIKE 'https://%' AND "secretCiphertext" LIKE 'encv1:%');
ALTER TABLE "PayWebhookDelivery" ADD CONSTRAINT "PayWebhookDelivery_check" CHECK (
 "status" IN ('PENDING','SENDING','RETRY','DELIVERED','FAILED','PAUSED') AND "version">=0 AND "attempts">=0 AND "cycleAttempts" BETWEEN 0 AND 8 AND "attempts">="cycleAttempts" AND "configVersion">=1
 AND ("status"='SENDING')=("attemptToken"<>'') AND ("status"='SENDING')=("leaseExpiresAt" IS NOT NULL)
 AND ("status"='DELIVERED')=("deliveredAt" IS NOT NULL)
 AND ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
 AND "payloadHash" ~ '^[a-f0-9]{64}$' AND octet_length("payloadJson") BETWEEN 1 AND 16000
);
ALTER TABLE "PayWebhookAttempt" ADD CONSTRAINT "PayWebhookAttempt_check" CHECK ("number">0 AND "configVersion">=1 AND "status" IN ('STARTED','DELIVERED','FAILED','UNKNOWN') AND ("status"='STARTED')=("finishedAt" IS NULL) AND ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599));

CREATE FUNCTION "mobocom_pay_webhook_guard"() RETURNS trigger AS $$
DECLARE payment "PayPayment"; endpoint "PayWebhookEndpoint"; delivery "PayWebhookDelivery"; body JSONB; scale NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'webhook evidence is retained' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='PayWebhookEndpoint' THEN
  IF NEW."terminalId"<>OLD."terminalId" OR NEW."id"<>OLD."id" OR NEW."createdAt"<>OLD."createdAt" OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'endpoint identity or version is invalid' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PayWebhookDelivery' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO payment FROM "PayPayment" WHERE "id"=NEW."paymentId";
   SELECT * INTO endpoint FROM "PayWebhookEndpoint" WHERE "id"=NEW."endpointId";
   body:=NEW."payloadJson"::jsonb;
   scale:=CASE WHEN payment."creditCurrency"='USDT' THEN 100 ELSE 1 END;
   IF (payment."status"<>'PAID' OR payment."walletTxId" IS NULL OR endpoint."terminalId"<>payment."terminalId" OR ROW(endpoint."url",endpoint."secretCiphertext",endpoint."version") IS DISTINCT FROM ROW(NEW."url",NEW."secretCiphertext",NEW."configVersion") OR body->>'id'<>NEW."id" OR body->>'type'<>'payment.paid' OR body->>'version'<>'1' OR body->'data'->>'payment_id'<>payment."id" OR body->'data'->>'terminal_id'<>payment."terminalId" OR body->'data'->>'external_id'<>payment."externalId" OR body->'data'->>'status'<>'PAID' OR (body->'data'->>'order_amount_rial')::numeric<>payment."amountMinor" OR (body->'data'->>'invoice_total_rial')::numeric<>payment."totalMinor" OR (body->'data'->>'contract_fee_rial')::numeric<>payment."feeMinor" OR body->'data'->>'merchant_credit_currency'<>payment."creditCurrency" OR (body->'data'->>'merchant_credit_amount')::numeric*scale<>payment."creditMinor" OR NEW."payloadHash"<>encode(sha256(convert_to(NEW."payloadJson",'UTF8')),'hex') OR (SELECT count(*) FROM jsonb_object_keys(body))<>5 OR (SELECT count(*) FROM jsonb_object_keys(body->'data'))<>9 OR (body->>'created_at')::timestamptz IS DISTINCT FROM payment."paidAt"::timestamptz) IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'webhook requires exact persisted paid facts' USING ERRCODE='23514'; END IF;
  ELSE
   IF ROW(NEW."id",NEW."endpointId",NEW."paymentId",NEW."payloadJson",NEW."payloadHash",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."endpointId",OLD."paymentId",OLD."payloadJson",OLD."payloadHash",OLD."createdAt") OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'webhook event is immutable' USING ERRCODE='23514'; END IF;
   IF NOT ((OLD."status" IN ('PENDING','RETRY') AND NEW."status" IN ('SENDING','PAUSED')) OR (OLD."status"='SENDING' AND NEW."status" IN ('DELIVERED','RETRY','FAILED')) OR (OLD."status" IN ('DELIVERED','FAILED','PAUSED') AND NEW."status"='PENDING')) THEN RAISE EXCEPTION 'webhook transition is invalid' USING ERRCODE='23514'; END IF;
   IF ROW(NEW."configVersion",NEW."url",NEW."secretCiphertext") IS DISTINCT FROM ROW(OLD."configVersion",OLD."url",OLD."secretCiphertext") THEN
    SELECT * INTO endpoint FROM "PayWebhookEndpoint" WHERE "id"=NEW."endpointId";
    IF NEW."status"<>'PENDING' OR OLD."status" NOT IN ('DELIVERED','FAILED','PAUSED') OR ROW(endpoint."version",endpoint."url",endpoint."secretCiphertext") IS DISTINCT FROM ROW(NEW."configVersion",NEW."url",NEW."secretCiphertext") THEN RAISE EXCEPTION 'historical endpoint rebind is invalid' USING ERRCODE='23514'; END IF;
   END IF;
   IF NEW."attempts"<>OLD."attempts"+(CASE WHEN NEW."status"='SENDING' THEN 1 ELSE 0 END) OR NEW."cycleAttempts"<>(CASE WHEN NEW."status"='SENDING' THEN OLD."cycleAttempts"+1 WHEN NEW."status"='PENDING' THEN 0 ELSE OLD."cycleAttempts" END) THEN RAISE EXCEPTION 'webhook attempt counters are invalid' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF TG_OP='INSERT' THEN
   SELECT * INTO delivery FROM "PayWebhookDelivery" WHERE "id"=NEW."deliveryId";
   IF delivery."status"<>'SENDING' OR delivery."attemptToken"<>NEW."token" OR delivery."attempts"<>NEW."number" OR ROW(delivery."configVersion",delivery."url") IS DISTINCT FROM ROW(NEW."configVersion",NEW."url") THEN RAISE EXCEPTION 'attempt binding is invalid' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD."status"<>'STARTED' OR NEW."status"='STARTED' OR ROW(NEW."id",NEW."deliveryId",NEW."token",NEW."number",NEW."configVersion",NEW."url",NEW."startedAt") IS DISTINCT FROM ROW(OLD."id",OLD."deliveryId",OLD."token",OLD."number",OLD."configVersion",OLD."url",OLD."startedAt") THEN RAISE EXCEPTION 'attempt history is immutable' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayWebhookEndpoint_guard" BEFORE UPDATE OR DELETE ON "PayWebhookEndpoint" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_webhook_guard"();
CREATE TRIGGER "PayWebhookDelivery_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayWebhookDelivery" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_webhook_guard"();
CREATE TRIGGER "PayWebhookAttempt_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayWebhookAttempt" FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_webhook_guard"();

COMMIT;
