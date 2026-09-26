CREATE TABLE "ReferralCode" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralCode_ownerId_key" ON "ReferralCode"("ownerId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE TABLE "ReferralAttribution" (
  "id" SERIAL NOT NULL,
  "referredUserId" INTEGER NOT NULL,
  "referrerUserId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "rewardBps" INTEGER NOT NULL,
  "rewardOrderId" INTEGER,
  "rewardMinor" BIGINT NOT NULL DEFAULT 0,
  "rewardCurrency" TEXT NOT NULL DEFAULT 'USD',
  "rewardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralAttribution_referredUserId_key" ON "ReferralAttribution"("referredUserId");
CREATE INDEX "ReferralAttribution_referrerUserId_createdAt_idx" ON "ReferralAttribution"("referrerUserId", "createdAt");
