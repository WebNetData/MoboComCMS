BEGIN;

CREATE TABLE "PayTerminalApiKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "terminalId" TEXT NOT NULL REFERENCES "PayTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PayTerminalApiKey_contract" CHECK (
    char_length("label") BETWEEN 1 AND 80
    AND "prefix" ~ '^mcpterm_[0-9a-f]{8}$'
    AND "keyHash" ~ '^[0-9a-f]{64}$'
    AND "version" > 0
  )
);
CREATE UNIQUE INDEX "PayTerminalApiKey_keyHash_key" ON "PayTerminalApiKey"("keyHash");
CREATE INDEX "PayTerminalApiKey_terminalId_revokedAt_createdAt_idx" ON "PayTerminalApiKey"("terminalId", "revokedAt", "createdAt");

CREATE FUNCTION "pay_terminal_key_guard"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."id", NEW."terminalId", NEW."label", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."terminalId", OLD."label", OLD."createdAt")
     OR OLD."revokedAt" IS NOT NULL OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'terminal API key identity, version or revoked state is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PayTerminalApiKey_guard" BEFORE UPDATE ON "PayTerminalApiKey"
  FOR EACH ROW EXECUTE FUNCTION "pay_terminal_key_guard"();

COMMIT;
