-- Open pre-upgrade drawers continue at the original default warehouse until their next shift.
UPDATE "StoreRegisterSession" SET "locationId" = (SELECT "id" FROM "StockLocation" WHERE "isDefault") WHERE "status" = 'OPEN' AND "locationId" IS NULL;

ALTER TABLE "StockReceipt" ADD COLUMN "fingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_itemKey_check"
CHECK ("itemKey" = "productId"::TEXT || ':' || COALESCE("variantId", 0)::TEXT);
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_itemKey_check"
CHECK ("itemKey" = "productId"::TEXT || ':' || COALESCE("variantId", 0)::TEXT);

-- Child edits and posting lock the same count header. A scan cannot land behind a completed count.
CREATE FUNCTION "mobocom_stock_count_line_rules"() RETURNS trigger AS $$
DECLARE state TEXT; parent_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN parent_id := OLD."countId"; ELSE parent_id := NEW."countId"; END IF;
  SELECT "status" INTO state FROM "StockCount" WHERE "id" = parent_id FOR UPDATE;
  IF state IS NULL THEN RETURN OLD; END IF;
  IF state <> 'OPEN' THEN RAISE EXCEPTION 'a closed stock count cannot be edited' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCountLine_state_rules" BEFORE INSERT OR UPDATE OR DELETE ON "StockCountLine"
FOR EACH ROW EXECUTE FUNCTION "mobocom_stock_count_line_rules"();
