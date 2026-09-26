CREATE TABLE "ResellerMember" (
  "id" SERIAL NOT NULL,
  "resellerId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "permissions" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellerMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResellerMember_userId_key" ON "ResellerMember"("userId");
CREATE INDEX "ResellerMember_resellerId_active_idx" ON "ResellerMember"("resellerId", "active");
ALTER TABLE "ResellerMember" ADD CONSTRAINT "ResellerMember_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResellerMember" ADD CONSTRAINT "ResellerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResellerSale" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ResellerSale" ADD COLUMN "reviewerUserId" INTEGER;
ALTER TABLE "ResellerSale" ADD COLUMN "reviewerTelegramId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ResellerSale" ADD COLUMN "reviewDecision" TEXT NOT NULL DEFAULT '';
