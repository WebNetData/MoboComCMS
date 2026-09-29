-- AlterTable
ALTER TABLE "Gateway" ADD COLUMN "config" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "remindedAt" TIMESTAMP(3),
ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" SERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "codeEnc" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "amountMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "purchaserId" INTEGER,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "redeemedBy" INTEGER,
    "redeemedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "orderId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "userId" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CartReminder" (
    "id" SERIAL NOT NULL,
    "cartId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "valueMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "couponCode" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredOrderId" INTEGER,
    "recoveredAt" TIMESTAMP(3),

    CONSTRAINT "CartReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockAlert_productId_notifiedAt_idx" ON "StockAlert"("productId", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAlert_userId_productId_variantId_key" ON "StockAlert"("userId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_codeHash_key" ON "GiftCard"("codeHash");

-- CreateIndex
CREATE INDEX "GiftCard_status_createdAt_idx" ON "GiftCard"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GiftCard_purchaserId_idx" ON "GiftCard"("purchaserId");

-- CreateIndex
CREATE INDEX "GiftCard_redeemedBy_idx" ON "GiftCard"("redeemedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_idempotencyKey_key" ON "LoyaltyEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_userId_createdAt_idx" ON "LoyaltyEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_orderId_idx" ON "LoyaltyEntry"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_lifetime_idx" ON "LoyaltyAccount"("lifetime");

-- CreateIndex
CREATE INDEX "CartReminder_cartId_idx" ON "CartReminder"("cartId");

-- CreateIndex
CREATE INDEX "CartReminder_userId_sentAt_idx" ON "CartReminder"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "CartReminder_sentAt_idx" ON "CartReminder"("sentAt");
