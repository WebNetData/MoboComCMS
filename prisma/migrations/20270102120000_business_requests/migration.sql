-- Additive: existing business identities, URLs and reviews are untouched.
CREATE TABLE "BusinessRequest" (
  "id" SERIAL PRIMARY KEY,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SUGGESTION', 'CLAIM')),
  "requesterId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "businessId" INTEGER REFERENCES "BusinessProfile"("id") ON DELETE SET NULL,
  "reviewerId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "website" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  "decisionNote" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BusinessRequest_status_id_idx" ON "BusinessRequest"("status", "id");
CREATE INDEX "BusinessRequest_requesterId_id_idx" ON "BusinessRequest"("requesterId", "id");
CREATE UNIQUE INDEX "BusinessRequest_pending_unique" ON "BusinessRequest"("requesterId", "kind", "domain") WHERE "status" = 'PENDING';
