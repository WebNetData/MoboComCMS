ALTER TABLE "PayMerchant"
  ADD COLUMN "customerFeeShareBps" INTEGER,
  ADD CONSTRAINT "PayMerchant_customer_fee_share_check" CHECK ("customerFeeShareBps" BETWEEN 0 AND 10000);

ALTER TABLE "PayPayment" DROP CONSTRAINT "PayPayment_money_check";
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_money_check" CHECK (
  "amountMinor" > 0 AND "feeMinor" >= 0 AND "netMinor" > 0 AND "totalMinor" > 0
  AND "totalMinor" = "netMinor" + "feeMinor" AND "expiresAt" > "createdAt"
  AND (
    ("feeBearer" = 'MERCHANT' AND "totalMinor" = "amountMinor")
    OR ("feeBearer" = 'CUSTOMER' AND "netMinor" = "amountMinor")
    OR ("feeBearer" = 'SPLIT' AND "netMinor" < "amountMinor" AND "amountMinor" < "totalMinor")
  )
);
