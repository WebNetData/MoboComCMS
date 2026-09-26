CREATE TABLE "TrialClaim" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "planId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "subscriptionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrialClaim_userId_key" ON "TrialClaim"("userId");
CREATE UNIQUE INDEX "TrialClaim_orderId_key" ON "TrialClaim"("orderId");
ALTER TABLE "TrialClaim" ADD CONSTRAINT "TrialClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
