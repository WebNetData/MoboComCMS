-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "fxAmountMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "fxCompareAtMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "fxCurrency" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fxMemberMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "markupBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "markupFixedMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "pricingMode" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "repricedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "fxAmountMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "code" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "pendingRate" DOUBLE PRECISION,
    "pendingAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CurrencyRateLog" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "products" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrencyRateLog_code_createdAt_idx" ON "CurrencyRateLog"("code", "createdAt");

-- CreateIndex
CREATE INDEX "Product_pricingMode_idx" ON "Product"("pricingMode");

