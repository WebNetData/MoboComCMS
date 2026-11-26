-- Terminal identity erasure does not delete shared ledger rows, weaken amount
-- reservations or provide a session-variable bypass for money guards.
CREATE FUNCTION mobocom_erased_user_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."erasedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'erased identity is terminal' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "User_erasure_terminal" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION mobocom_erased_user_guard();

-- Existing FK writers cannot create new user-owned facts after erasure. The
-- row lock coordinates with the erasure command's FOR UPDATE claim.
CREATE FUNCTION mobocom_no_erased_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id INTEGER; erased TIMESTAMP;
BEGIN
 owner_id := (to_jsonb(NEW)->>TG_ARGV[0])::INTEGER;
 IF owner_id IS NULL THEN RETURN NEW; END IF;
 SELECT "erasedAt" INTO erased FROM "User" WHERE "id"=owner_id FOR KEY SHARE;
 IF erased IS NOT NULL THEN RAISE EXCEPTION 'erased identity cannot own new data' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE r RECORD; BEGIN
 FOR r IN SELECT c.conrelid::regclass AS tab,a.attname AS col,c.oid AS oid
 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
 WHERE c.contype='f' AND c.confrelid='"User"'::regclass AND array_length(c.conkey,1)=1
 LOOP EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION mobocom_no_erased_owner(%L)', 'identity_erased_owner_'||r.oid,r.tab,r.col); END LOOP;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['OtpCode','PasswordReset','FormSubmission','CrmTag','LoyaltyAccount','LoyaltyEntry','ContentPurchase','StockAlert','CartReminder','NewsletterSubscriber','NewsletterDelivery','ChatConversation','MembershipTeamMember','MembershipApplication','UserMembership','RecurringInvoice','SmsLog'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION mobocom_no_erased_owner(%L)','identity_erased_scalar_'||tab,tab,'userId');
 END LOOP;
END $$;

-- Only erasing the private display fields of an already-erased owner's row is
-- allowed here. Amounts, status, hashes, original event IDs and all links remain
-- byte-for-byte identical. Other updates still run every original guard.
CREATE FUNCTION mobocom_erasure_redaction(old_row JSONB,new_row JSONB,tab TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE merchant_id TEXT; owner_id INTEGER; allowed TEXT[];
BEGIN
 IF tab='PayPayment' THEN
  merchant_id:=old_row->>'merchantId'; allowed:=ARRAY['purchaseRecipientName','updatedAt'];
  IF new_row->>'purchaseRecipientName'<>'حساب حذف‌شده' THEN RETURN FALSE; END IF;
 ELSIF tab='PaySettlement' THEN
  merchant_id:=old_row->>'merchantId'; allowed:=ARRAY['destination','destinationLabel','reason','updatedAt'];
  IF new_row->>'destination'<>'erased' OR new_row->>'destinationLabel'<>'' OR new_row->>'reason'<>'' THEN RETURN FALSE; END IF;
 ELSIF tab='PaySettlementDestination' THEN
  merchant_id:=old_row->>'merchantId'; allowed:=ARRAY['destination','label','active','updatedAt'];
  IF new_row->>'destination'<>'erased' OR new_row->>'label'<>'حساب حذف‌شده' OR new_row->>'active'<>'false' THEN RETURN FALSE; END IF;
 ELSE RETURN FALSE;
 END IF;
 SELECT m."userId" INTO owner_id FROM "PayMerchant" m WHERE m."id"=merchant_id;
 RETURN EXISTS(SELECT 1 FROM "User" WHERE "id"=owner_id AND "erasedAt" IS NOT NULL)
   AND (old_row-allowed)=(new_row-allowed);
END $$;
DO $$ DECLARE fn TEXT; definition TEXT; BEGIN
 FOREACH fn IN ARRAY ARRAY['mobocom_pay_rules','mobocom_pay_asset_facts','mobocom_pay_settlement_center_guard'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn||'()')) INTO definition;
  IF definition IS NULL THEN RAISE EXCEPTION 'expected money guard missing: %',fn; END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF TG_OP=''UPDATE'' AND mobocom_erasure_redaction(to_jsonb(OLD),to_jsonb(NEW),TG_TABLE_NAME) THEN RETURN NEW; END IF;','i');
  EXECUTE definition;
 END LOOP;
END $$;
