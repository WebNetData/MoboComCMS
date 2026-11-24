CREATE TABLE "PayBaleNotice" (
  "id" TEXT PRIMARY KEY,
  "instanceId" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "bankPeerId" TEXT NOT NULL,
  "bankAccountId" INTEGER NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payloadHash" TEXT NOT NULL,
  "bankFingerprint" TEXT UNIQUE,
  "duplicateOfId" TEXT REFERENCES "PayBaleNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amountMinor" BIGINT,
  "transferReference" TEXT NOT NULL DEFAULT '',
  "occurredFrom" TIMESTAMP(3),
  "occurredBefore" TIMESTAMP(3),
  "sourceSentAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayBaleNotice_source_check" CHECK (
    "instanceId" ~ '^[a-f0-9]{64}$' AND "sourceEventId" ~ '^[a-f0-9]{64}$'
    AND "payloadHash" ~ '^[a-f0-9]{64}$'
    AND "sourceAccountId" ~ '^[1-9][0-9]{0,9}$' AND "bankPeerId" ~ '^[1-9][0-9]{0,9}$'
    AND "messageId" ~ '^-?[1-9][0-9]{0,18}$'
    AND ("bankFingerprint" IS NULL OR "bankFingerprint" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "PayBaleNotice_fact_check" CHECK (
    "status" IN ('ORIGINAL_TRANSFER','IGNORED','REJECTED','DUPLICATE','CONFLICT')
    AND "direction" IN ('','CREDIT','DEBIT')
    AND ("amountMinor" IS NULL OR "amountMinor" > 0)
    AND length("transferReference") <= 64 AND length("code") BETWEEN 1 AND 64
    AND length("kind") BETWEEN 1 AND 40
    AND (("occurredFrom" IS NULL AND "occurredBefore" IS NULL)
      OR ("occurredFrom" IS NOT NULL AND "occurredBefore" IS NOT NULL AND "occurredBefore" = "occurredFrom" + INTERVAL '1 minute'))
    AND ("status" <> 'REJECTED' OR ("amountMinor" IS NULL AND "occurredFrom" IS NULL AND "occurredBefore" IS NULL AND "transferReference" = '' AND "direction" = '' AND "bankFingerprint" IS NULL))
    AND ("status" <> 'ORIGINAL_TRANSFER' OR ("amountMinor" IS NOT NULL AND "direction" = 'CREDIT' AND "occurredFrom" IS NOT NULL AND "bankFingerprint" IS NOT NULL AND "kind" IN ('CARD_TRANSFER','PAYA','SATNA')))
    AND ("duplicateOfId" IS NULL OR "duplicateOfId" <> "id")
    AND (("duplicateOfId" IS NULL AND "status" NOT IN ('DUPLICATE','CONFLICT'))
      OR ("duplicateOfId" IS NOT NULL AND "status" IN ('DUPLICATE','CONFLICT') AND "bankFingerprint" IS NULL))
  )
);
CREATE UNIQUE INDEX "PayBaleNotice_instanceId_sourceEventId_key" ON "PayBaleNotice"("instanceId", "sourceEventId");
CREATE UNIQUE INDEX "PayBaleNotice_instanceId_messageId_key" ON "PayBaleNotice"("instanceId", "messageId");
CREATE INDEX "PayBaleNotice_receivedAt_id_idx" ON "PayBaleNotice"("receivedAt", "id");
CREATE INDEX "PayBaleNotice_instanceId_receivedAt_idx" ON "PayBaleNotice"("instanceId", "receivedAt");
CREATE INDEX "PayBaleNotice_bankAccountId_idx" ON "PayBaleNotice"("bankAccountId");
CREATE FUNCTION mobocom_pay_bale_notice_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bale source evidence is immutable';
END $$;
CREATE TRIGGER "PayBaleNotice_immutable" BEFORE UPDATE ON "PayBaleNotice"
FOR EACH ROW EXECUTE FUNCTION mobocom_pay_bale_notice_immutable();
