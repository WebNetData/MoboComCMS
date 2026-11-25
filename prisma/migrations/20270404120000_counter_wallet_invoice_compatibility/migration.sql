-- Preserve the Store's linked-customer wallet tender when extending Pay checkout.
-- Also repairs installations that already applied the pre-release Pay constraint.
-- Guest counter sales and Pay collection invoices still cannot apply wallet credit.
BEGIN;
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_counter_buyer_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_counter_buyer_check" CHECK (
 "saleSource" IN ('ONLINE','COUNTER') AND
 (("kind"='PAY_COLLECTION' AND "saleSource"='ONLINE' AND "userId" IS NULL AND "orderId" IS NULL AND "planId" IS NULL AND "productId" IS NULL AND "walletAppliedMinor"=0 AND "currency"='IRR') OR
 ("kind"<>'PAY_COLLECTION' AND (("saleSource"='ONLINE' AND "userId" IS NOT NULL) OR
 ("saleSource"='COUNTER' AND "orderId" IS NOT NULL AND "kind"='BILLING' AND ("walletAppliedMinor"=0 OR "userId" IS NOT NULL))))));
COMMIT;
