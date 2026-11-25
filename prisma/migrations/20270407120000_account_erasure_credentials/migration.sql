-- A late writer cannot rebind an existing row to an erased identity. Ordinary
-- updates on retained financial facts still pass their original owner guards.
DO $$ DECLARE r RECORD; BEGIN
 FOR r IN SELECT c.conrelid::regclass AS tab,a.attname AS col,c.oid AS oid
 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
 WHERE c.contype='f' AND c.confrelid='"User"'::regclass AND array_length(c.conkey,1)=1
 LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF %I ON %s FOR EACH ROW WHEN (OLD.%I IS DISTINCT FROM NEW.%I) EXECUTE FUNCTION mobocom_no_erased_owner(%L)', 'identity_erased_rebind_'||r.oid,r.col,r.tab,r.col,r.col,r.col); END LOOP;
END $$;

-- Retained form/order documents may still be reconciled by their domain, but
-- stale workers must never restore their erased customer's private fields.
CREATE FUNCTION mobocom_erased_private_fields() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id INTEGER; new_row JSONB; col TEXT; value TEXT;
BEGIN
 new_row:=to_jsonb(NEW); owner_id:=(new_row->>'userId')::INTEGER;
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM "User" WHERE "id"=owner_id AND "erasedAt" IS NOT NULL) THEN RETURN NEW; END IF;
 FOREACH col IN ARRAY TG_ARGV LOOP
  value:=new_row->>col;
  IF value IS NOT NULL AND value NOT IN ('','{}') THEN RAISE EXCEPTION 'erased private data cannot be restored' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "FormSubmission_erased_private" BEFORE UPDATE ON "FormSubmission" FOR EACH ROW EXECUTE FUNCTION mobocom_erased_private_fields('data','secrets','note','reply','ipHash','pickupCode','receiptToken');
CREATE TRIGGER "Order_erased_private" BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION mobocom_erased_private_fields('customerName','customerPhone','meta','paymentUrl','receiptToken');
CREATE TRIGGER "Invoice_erased_private" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION mobocom_erased_private_fields('title','detail','notes','paymentUrl');
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['OtpCode','PasswordReset','FormSubmission','CrmTag','LoyaltyAccount','LoyaltyEntry','ContentPurchase','StockAlert','CartReminder','NewsletterSubscriber','NewsletterDelivery','ChatConversation','MembershipTeamMember','MembershipApplication','UserMembership','RecurringInvoice','SmsLog'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF "userId" ON %I FOR EACH ROW WHEN (OLD."userId" IS DISTINCT FROM NEW."userId") EXECUTE FUNCTION mobocom_no_erased_owner(%L)','identity_erased_scalar_rebind_'||tab,tab,'userId');
 END LOOP;
END $$;

-- Redaction may change only a URL and encrypted secret of an erased owner's
-- callback evidence. Event IDs, payload/hash, payment, status, attempts, versions
-- and timestamps are retained. No arbitrary no-delete/state-guard bypass.
CREATE FUNCTION mobocom_erasure_webhook_redaction(old_row JSONB,new_row JSONB,tab TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE endpoint_id TEXT; owner_id INTEGER; allowed TEXT[];
BEGIN
 IF tab='PayWebhookDelivery' THEN
  endpoint_id:=old_row->>'endpointId'; allowed:=ARRAY['url','secretCiphertext','updatedAt'];
  IF new_row->>'secretCiphertext' NOT LIKE 'encv1:%' OR new_row->>'secretCiphertext'=old_row->>'secretCiphertext' THEN RETURN FALSE; END IF;
 ELSIF tab='PayWebhookAttempt' THEN
  SELECT "endpointId" INTO endpoint_id FROM "PayWebhookDelivery" WHERE "id"=old_row->>'deliveryId'; allowed:=ARRAY['url'];
 ELSE RETURN FALSE;
 END IF;
 IF new_row->>'url'<>'https://erased.invalid' THEN RETURN FALSE; END IF;
 SELECT m."userId" INTO owner_id FROM "PayWebhookEndpoint" e JOIN "PayTerminal" t ON t."id"=e."terminalId" JOIN "PayMerchant" m ON m."id"=t."merchantId" WHERE e."id"=endpoint_id;
 RETURN EXISTS(SELECT 1 FROM "User" WHERE "id"=owner_id AND "erasedAt" IS NOT NULL) AND (old_row-allowed)=(new_row-allowed);
END $$;
DO $$ DECLARE definition TEXT; BEGIN
 SELECT pg_get_functiondef('mobocom_pay_webhook_guard()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF TG_OP=''UPDATE'' AND mobocom_erasure_webhook_redaction(to_jsonb(OLD),to_jsonb(NEW),TG_TABLE_NAME) THEN RETURN NEW; END IF;','i');
 EXECUTE definition;
END $$;
