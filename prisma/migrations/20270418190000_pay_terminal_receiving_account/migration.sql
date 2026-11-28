ALTER TABLE "BankAccount" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_archived_inactive" CHECK ("archivedAt" IS NULL OR NOT "active");

ALTER TABLE "PayTerminal" ADD COLUMN "bankAccountId" INTEGER;
ALTER TABLE "PayTerminal" ADD CONSTRAINT "PayTerminal_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PayTerminal_bankAccountId_idx" ON "PayTerminal"("bankAccountId");

ALTER TABLE "PayPayment" ADD COLUMN "assignedBankAccountId" INTEGER;
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_assignedBankAccountId_fkey"
  FOREIGN KEY ("assignedBankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PayPayment_assignedBankAccountId_status_idx" ON "PayPayment"("assignedBankAccountId", "status");

CREATE FUNCTION mobocom_pay_assigned_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assignedBankAccountId" IS DISTINCT FROM OLD."assignedBankAccountId" THEN
    RAISE EXCEPTION 'Pay assigned bank account is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PayPayment_assigned_bank_guard" BEFORE UPDATE OF "assignedBankAccountId" ON "PayPayment"
FOR EACH ROW EXECUTE FUNCTION mobocom_pay_assigned_bank_guard();
