-- Solved human checks, each accepted once. A row lives until its challenge expires; nothing else refers to it. Additive.
CREATE TABLE "HumanCheckUse" (
  "salt" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanCheckUse_pkey" PRIMARY KEY ("salt")
);
CREATE INDEX "HumanCheckUse_expiresAt_idx" ON "HumanCheckUse"("expiresAt");
