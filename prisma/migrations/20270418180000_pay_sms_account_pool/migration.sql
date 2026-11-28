CREATE OR REPLACE FUNCTION mobocom_sms_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bank "BankAccount";
BEGIN
  IF TG_OP = 'UPDATE' AND (
    ROW(NEW."id", NEW."bankAccountId", NEW."ownerUserId", NEW."createdAt") IS DISTINCT FROM
    ROW(OLD."id", OLD."bankAccountId", OLD."ownerUserId", OLD."createdAt") OR NEW."version" <> OLD."version" + 1
  ) THEN RAISE EXCEPTION 'SMS source identity immutable; versioned claim required'; END IF;
  SELECT * INTO bank FROM "BankAccount" WHERE "id" = NEW."bankAccountId" FOR UPDATE;
  IF bank."id" IS NULL OR (bank."collectionUse" = 'GENERAL' AND mobocom_bank_digits(bank."accountNumber") !~ '^[0-9]{5,30}$') THEN
    RAISE EXCEPTION 'SMS source needs an identifiable bank account';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mobocom_sms_bank_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."accountNumber", NEW."cardNumber", NEW."sheba") IS DISTINCT FROM
     ROW(OLD."accountNumber", OLD."cardNumber", OLD."sheba") AND (
       EXISTS (SELECT 1 FROM "PaySmsSource" WHERE "bankAccountId" = OLD."id") OR
       EXISTS (SELECT 1 FROM "PayBaleCollection" WHERE "bankAccountId" = OLD."id" AND "activeInvoiceId" IS NOT NULL)
     ) THEN RAISE EXCEPTION 'bank identity is in use by an SMS source or open transfer'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "BankAccount_sms_identity_guard" BEFORE UPDATE OF "accountNumber", "cardNumber", "sheba" ON "BankAccount"
FOR EACH ROW EXECUTE FUNCTION mobocom_sms_bank_identity_guard();
