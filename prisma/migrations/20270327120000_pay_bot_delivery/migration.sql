CREATE TABLE "PayBotIntegration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "terminalId" TEXT NOT NULL REFERENCES "PayTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "keyHash" TEXT NOT NULL, "keyPrefix" TEXT NOT NULL,
  "callbackUrl" TEXT NOT NULL, "callbackTokenCiphertext" TEXT NOT NULL,
  "ackPolicy" TEXT NOT NULL DEFAULT 'UNCONFIGURED', "responseMode" TEXT NOT NULL DEFAULT 'URL',
  "active" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayBotIntegration_contract" CHECK (
    "version">0 AND "keyHash" ~ '^[a-f0-9]{64}$'
    AND "ackPolicy" IN ('UNCONFIGURED','JSON_OK','JSON_SUCCESS','HTTP_2XX')
    AND "responseMode" IN ('URL','LINKS')
    AND (NOT "active" OR ("ackPolicy"<>'UNCONFIGURED' AND "callbackTokenCiphertext" LIKE 'encv1:%'))
  )
);
CREATE UNIQUE INDEX "PayBotIntegration_terminalId_key" ON "PayBotIntegration"("terminalId");
CREATE UNIQUE INDEX "PayBotIntegration_keyHash_key" ON "PayBotIntegration"("keyHash");
CREATE TABLE "PayBotDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "integrationId" TEXT NOT NULL REFERENCES "PayBotIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "PayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "configVersion" INTEGER NOT NULL, "callbackUrl" TEXT NOT NULL,
  "callbackTokenCiphertext" TEXT NOT NULL, "ackPolicy" TEXT NOT NULL,
  "customerRefHash" TEXT NOT NULL, "orderType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING', "version" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0, "attemptToken" TEXT NOT NULL DEFAULT '',
  "lastAttemptAt" TIMESTAMP(3), "lastCode" TEXT NOT NULL DEFAULT '', "httpStatus" INTEGER,
  "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayBotDelivery_contract" CHECK (
    "status" IN ('WAITING','QUEUED','SENDING','SENT','UNKNOWN','BLOCKED')
    AND "version">0 AND "configVersion">0 AND "attempts">=0
    AND "orderType" IN ('purchase','renewal','balance_increase')
    AND "customerRefHash" ~ '^[a-f0-9]{64}$'
    AND "ackPolicy" IN ('JSON_OK','JSON_SUCCESS','HTTP_2XX')
    AND "callbackTokenCiphertext" LIKE 'encv1:%'
    AND ("status"<>'SENDING' OR (length("attemptToken")>0 AND "lastAttemptAt" IS NOT NULL))
    AND ("status"<>'SENT' OR "confirmedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "PayBotDelivery_paymentId_key" ON "PayBotDelivery"("paymentId");
CREATE INDEX "PayBotDelivery_integrationId_createdAt_idx" ON "PayBotDelivery"("integrationId","createdAt");
CREATE INDEX "PayBotDelivery_status_updatedAt_idx" ON "PayBotDelivery"("status","updatedAt");

CREATE FUNCTION "pay_bot_delivery_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE p "PayPayment"; t "PayTerminal";
BEGIN
  SELECT * INTO STRICT p FROM "PayPayment" WHERE "id"=NEW."paymentId";
  SELECT pt.* INTO STRICT t FROM "PayTerminal" pt JOIN "PayBotIntegration" b ON b."terminalId"=pt."id" WHERE b."id"=NEW."integrationId";
  IF p."terminalId"<>t."id" OR p."merchantId"<>t."merchantId" THEN RAISE EXCEPTION 'bot delivery ownership mismatch'; END IF;
  IF NEW."status" IN ('QUEUED','SENDING','SENT','UNKNOWN') AND (p."status"<>'PAID' OR p."walletTxId" IS NULL) THEN RAISE EXCEPTION 'bot delivery requires credited payment'; END IF;
  IF TG_OP='UPDATE' AND (NEW."paymentId"<>OLD."paymentId" OR NEW."integrationId"<>OLD."integrationId" OR NEW."customerRefHash"<>OLD."customerRefHash" OR NEW."orderType"<>OLD."orderType") THEN RAISE EXCEPTION 'bot delivery identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PayBotDelivery_guard" BEFORE INSERT OR UPDATE ON "PayBotDelivery" FOR EACH ROW EXECUTE FUNCTION "pay_bot_delivery_guard"();
