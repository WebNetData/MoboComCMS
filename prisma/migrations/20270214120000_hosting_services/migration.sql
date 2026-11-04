-- Hosting services (what a customer bought) and their action history. Additive; nothing existing changes.
CREATE TABLE "HostingService" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "providerId" INTEGER,
  "orderId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "cycle" TEXT NOT NULL,
  "priceMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "label" TEXT NOT NULL,
  "hostname" TEXT NOT NULL DEFAULT '',
  "externalId" TEXT NOT NULL DEFAULT '',
  "ipv4" TEXT NOT NULL DEFAULT '',
  "ipv6" TEXT NOT NULL DEFAULT '',
  "panelUrl" TEXT NOT NULL DEFAULT '',
  "loginUser" TEXT NOT NULL DEFAULT '',
  "loginSecret" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "allowTraffic" BOOLEAN,
  "allowUpgrade" BOOLEAN,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "terminatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostingService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingService_status_check" CHECK ("status" IN ('PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'FAILED')),
  CONSTRAINT "HostingService_cycle_check" CHECK ("cycle" IN ('HOURLY', 'MONTH', 'QUARTER', 'HALF', 'YEAR')),
  CONSTRAINT "HostingService_price_check" CHECK ("priceMinor" >= 0),
  -- An active service has started and, on a fixed term, knows when it is due.
  CONSTRAINT "HostingService_active_dates_check" CHECK ("status" <> 'ACTIVE' OR ("startedAt" IS NOT NULL AND ("cycle" = 'HOURLY' OR "nextDueAt" IS NOT NULL)))
);
CREATE UNIQUE INDEX "HostingService_orderId_key" ON "HostingService"("orderId");
-- One service per machine or account on a system; an empty id means not created there yet.
CREATE UNIQUE INDEX "HostingService_provider_external_key" ON "HostingService"("providerId", "externalId") WHERE "externalId" <> '';
CREATE INDEX "HostingService_userId_status_idx" ON "HostingService"("userId", "status");
CREATE INDEX "HostingService_status_nextDueAt_idx" ON "HostingService"("status", "nextDueAt");
CREATE INDEX "HostingService_providerId_idx" ON "HostingService"("providerId");
CREATE INDEX "HostingService_productId_idx" ON "HostingService"("productId");
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HostingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "HostingProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HostingAction" (
  "id" SERIAL NOT NULL,
  "serviceId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "actor" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DONE',
  "idempotencyKey" TEXT,
  "detail" TEXT NOT NULL DEFAULT '',
  "error" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "HostingAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingAction_actor_check" CHECK ("actor" IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
  CONSTRAINT "HostingAction_status_check" CHECK ("status" IN ('WAITING', 'RUNNING', 'DONE', 'FAILED'))
);
CREATE UNIQUE INDEX "HostingAction_idempotencyKey_key" ON "HostingAction"("idempotencyKey");
CREATE INDEX "HostingAction_serviceId_createdAt_idx" ON "HostingAction"("serviceId", "createdAt");
CREATE INDEX "HostingAction_status_kind_idx" ON "HostingAction"("status", "kind");
ALTER TABLE "HostingAction" ADD CONSTRAINT "HostingAction_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "HostingService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
