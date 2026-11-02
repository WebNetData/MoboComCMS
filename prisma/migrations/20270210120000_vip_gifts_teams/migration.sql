-- Gifts, group seats and approval for VIP plans. Additive.
ALTER TABLE "MembershipPlan" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "MembershipGift" (
  "id" SERIAL NOT NULL, "code" TEXT NOT NULL, "planId" INTEGER NOT NULL, "buyerId" INTEGER NOT NULL, "orderId" INTEGER NOT NULL,
  "recipientEmail" TEXT NOT NULL DEFAULT '', "message" TEXT NOT NULL DEFAULT '', "claimedBy" INTEGER, "claimedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipGift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipGift_code_key" ON "MembershipGift"("code");
CREATE UNIQUE INDEX "MembershipGift_orderId_key" ON "MembershipGift"("orderId");
CREATE INDEX "MembershipGift_buyerId_idx" ON "MembershipGift"("buyerId");
CREATE TABLE "MembershipTeam" (
  "id" SERIAL NOT NULL, "ownerId" INTEGER NOT NULL, "planId" INTEGER NOT NULL, "orderId" INTEGER NOT NULL, "name" TEXT NOT NULL DEFAULT '', "code" TEXT NOT NULL,
  "seats" INTEGER NOT NULL, "used" INTEGER NOT NULL DEFAULT 0, "endsAt" TIMESTAMP(3) NOT NULL, "closedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipTeam_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipTeam_seats_held" CHECK ("used" >= 0 AND "used" <= "seats")
);
CREATE UNIQUE INDEX "MembershipTeam_orderId_key" ON "MembershipTeam"("orderId");
CREATE UNIQUE INDEX "MembershipTeam_code_key" ON "MembershipTeam"("code");
CREATE INDEX "MembershipTeam_ownerId_idx" ON "MembershipTeam"("ownerId");
CREATE TABLE "MembershipTeamMember" (
  "id" SERIAL NOT NULL, "teamId" INTEGER NOT NULL, "userId" INTEGER NOT NULL, "periodId" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "removedAt" TIMESTAMP(3),
  CONSTRAINT "MembershipTeamMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipTeamMember_teamId_userId_key" ON "MembershipTeamMember"("teamId", "userId");
CREATE INDEX "MembershipTeamMember_userId_idx" ON "MembershipTeamMember"("userId");
ALTER TABLE "MembershipTeamMember" ADD CONSTRAINT "MembershipTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "MembershipTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "MembershipApplication" (
  "id" SERIAL NOT NULL, "userId" INTEGER NOT NULL, "planId" INTEGER NOT NULL, "orderId" INTEGER, "status" TEXT NOT NULL DEFAULT 'PENDING', "note" TEXT NOT NULL DEFAULT '',
  "decidedBy" INTEGER, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipApplication_orderId_key" ON "MembershipApplication"("orderId");
CREATE INDEX "MembershipApplication_status_idx" ON "MembershipApplication"("status");
CREATE INDEX "MembershipApplication_userId_idx" ON "MembershipApplication"("userId");
