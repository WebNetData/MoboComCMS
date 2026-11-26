-- Add an explicit boolean status acknowledgement profile; retain every money,
-- delivery ownership and ciphertext invariant. No existing rows are rewritten.
ALTER TABLE "PayBotIntegration" DROP CONSTRAINT "PayBotIntegration_contract";
ALTER TABLE "PayBotIntegration" ADD CONSTRAINT "PayBotIntegration_contract" CHECK (
  "version">0 AND "keyHash" ~ '^[a-f0-9]{64}$'
  AND "ackPolicy" IN ('UNCONFIGURED','JSON_OK','JSON_SUCCESS','JSON_STATUS_TRUE','HTTP_2XX')
  AND "responseMode" IN ('URL','LINKS')
  AND (NOT "active" OR ("ackPolicy"<>'UNCONFIGURED' AND "callbackTokenCiphertext" LIKE 'encv1:%'))
);
ALTER TABLE "PayBotDelivery" DROP CONSTRAINT "PayBotDelivery_contract";
ALTER TABLE "PayBotDelivery" ADD CONSTRAINT "PayBotDelivery_contract" CHECK (
  "status" IN ('WAITING','QUEUED','SENDING','SENT','UNKNOWN','BLOCKED')
  AND "version">0 AND "configVersion">0 AND "attempts">=0
  AND "orderType" IN ('purchase','renewal','balance_increase')
  AND "customerRefHash" ~ '^[a-f0-9]{64}$'
  AND "ackPolicy" IN ('JSON_OK','JSON_SUCCESS','JSON_STATUS_TRUE','HTTP_2XX')
  AND "callbackTokenCiphertext" LIKE 'encv1:%'
  AND ("status"<>'SENDING' OR (length("attemptToken")>0 AND "lastAttemptAt" IS NOT NULL))
  AND ("status"<>'SENT' OR "confirmedAt" IS NOT NULL)
);
