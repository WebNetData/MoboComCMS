-- A foreign-currency variant may carry its own profit percentage and fixed profit (null = the product's).
ALTER TABLE "ProductVariant" ADD COLUMN "markupBps" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "markupFixedMinor" BIGINT;
