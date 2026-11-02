-- VIP tiers, plan options, member choices and item rules. Additive: every stored plan and period keeps its meaning.
CREATE TABLE "MembershipTier" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "tagline" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#b45309',
  "rank" INTEGER NOT NULL,
  "storeDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  "freeShipping" BOOLEAN NOT NULL DEFAULT false,
  "hideAds" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipTier_rank_range" CHECK ("rank" BETWEEN 1 AND 99),
  CONSTRAINT "MembershipTier_discount_range" CHECK ("storeDiscountPercent" BETWEEN 0 AND 90)
);
CREATE UNIQUE INDEX "MembershipTier_rank_key" ON "MembershipTier"("rank");
ALTER TABLE "MembershipPlan"
  ADD COLUMN "tierId" INTEGER,
  ADD COLUMN "billing" TEXT NOT NULL DEFAULT 'DAYS',
  ADD COLUMN "fixedEndsAt" TIMESTAMP(3),
  ADD COLUMN "compareAtMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "signupFeeMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trialPriceMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "payWhatYouWant" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minPriceMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "maxMembers" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserMembership"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PERIOD',
  ADD COLUMN "amountMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT '';
CREATE TABLE "MembershipAccount" (
  "userId" INTEGER NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "renewPlanId" INTEGER,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT NOT NULL DEFAULT '',
  "adminNote" TEXT NOT NULL DEFAULT '',
  "renewError" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipAccount_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "MembershipAccount_autoRenew_idx" ON "MembershipAccount"("autoRenew");
ALTER TABLE "MembershipAccount" ADD CONSTRAINT "MembershipAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "MembershipRule" (
  "id" SERIAL NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "minRank" INTEGER NOT NULL DEFAULT 0,
  "dripDays" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipRule_ownerType_ownerId_key" ON "MembershipRule"("ownerType", "ownerId");
ALTER TABLE "Promotion" ADD COLUMN "membershipPlanId" INTEGER;
