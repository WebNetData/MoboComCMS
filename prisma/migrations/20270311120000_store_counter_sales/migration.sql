ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "saleSource" TEXT NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "createdById" INTEGER,
  ADD COLUMN "customerName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "customerPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_counter_buyer_check" CHECK (
  "saleSource" IN ('ONLINE', 'COUNTER') AND
  (("saleSource" = 'ONLINE' AND "userId" IS NOT NULL) OR
   ("saleSource" = 'COUNTER' AND "createdById" IS NOT NULL AND "productId" IS NOT NULL))
);
CREATE INDEX "Order_saleSource_createdAt_idx" ON "Order"("saleSource", "createdAt");

ALTER TABLE "Invoice" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "saleSource" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_counter_buyer_check" CHECK (
  "saleSource" IN ('ONLINE', 'COUNTER') AND
  (("saleSource" = 'ONLINE' AND "userId" IS NOT NULL) OR
   ("saleSource" = 'COUNTER' AND "orderId" IS NOT NULL AND "kind" = 'BILLING' AND "walletAppliedMinor" = 0))
);

CREATE FUNCTION "check_counter_invoice_buyer"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."saleSource" = 'COUNTER' AND NOT EXISTS (
    SELECT 1 FROM "Order" WHERE "id" = NEW."orderId" AND "saleSource" = 'COUNTER'
      AND "userId" IS NOT DISTINCT FROM NEW."userId"
  ) THEN
    RAISE EXCEPTION 'counter invoice must belong to the same counter buyer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Invoice_counter_buyer_match" BEFORE INSERT OR UPDATE OF "orderId", "userId", "saleSource" ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "check_counter_invoice_buyer"();
