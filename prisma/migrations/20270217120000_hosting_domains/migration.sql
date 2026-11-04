-- Domains: extensions with their prices, the domains customers order, and each domain's history. Additive.
CREATE TABLE "DomainTld" (
  "id" SERIAL NOT NULL,
  "suffix" TEXT NOT NULL,
  "registrarId" INTEGER,
  "registerMinor" BIGINT NOT NULL,
  "renewMinor" BIGINT NOT NULL,
  "transferMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "years" TEXT NOT NULL DEFAULT '1,2,3,5',
  "needsHandle" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomainTld_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DomainTld_suffix_check" CHECK ("suffix" ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*$'),
  CONSTRAINT "DomainTld_price_check" CHECK ("registerMinor" > 0 AND "renewMinor" > 0 AND "transferMinor" >= 0)
);
CREATE UNIQUE INDEX "DomainTld_suffix_key" ON "DomainTld"("suffix");
CREATE INDEX "DomainTld_active_sort_idx" ON "DomainTld"("active", "sort");
ALTER TABLE "DomainTld" ADD CONSTRAINT "DomainTld_registrarId_fkey" FOREIGN KEY ("registrarId") REFERENCES "HostingProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Domain" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tldId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "kind" TEXT NOT NULL DEFAULT 'REGISTER',
  "years" INTEGER NOT NULL DEFAULT 1,
  "renewMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "orderId" INTEGER,
  "registeredAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "nameservers" TEXT NOT NULL DEFAULT '[]',
  "handle" TEXT NOT NULL DEFAULT '',
  "authCode" TEXT NOT NULL DEFAULT '',
  "locked" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Domain_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Domain_status_check" CHECK ("status" IN ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT "Domain_kind_check" CHECK ("kind" IN ('REGISTER', 'TRANSFER')),
  CONSTRAINT "Domain_years_check" CHECK ("years" BETWEEN 1 AND 10),
  CONSTRAINT "Domain_price_check" CHECK ("renewMinor" > 0),
  CONSTRAINT "Domain_name_check" CHECK ("name" = lower("name") AND "name" ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  -- A registered domain knows when it expires.
  CONSTRAINT "Domain_dates_check" CHECK ("status" NOT IN ('ACTIVE', 'EXPIRED') OR ("registeredAt" IS NOT NULL AND "expiresAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "Domain_orderId_key" ON "Domain"("orderId");
-- One live registration per name; a cancelled order frees it.
CREATE UNIQUE INDEX "Domain_live_name_key" ON "Domain"("name") WHERE "status" <> 'CANCELLED';
CREATE INDEX "Domain_userId_status_idx" ON "Domain"("userId", "status");
CREATE INDEX "Domain_status_expiresAt_idx" ON "Domain"("status", "expiresAt");
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_tldId_fkey" FOREIGN KEY ("tldId") REFERENCES "DomainTld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DomainAction" (
  "id" SERIAL NOT NULL,
  "domainId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "actor" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DONE',
  "idempotencyKey" TEXT,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "DomainAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DomainAction_actor_check" CHECK ("actor" IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
  CONSTRAINT "DomainAction_status_check" CHECK ("status" IN ('WAITING', 'DONE', 'FAILED'))
);
CREATE UNIQUE INDEX "DomainAction_idempotencyKey_key" ON "DomainAction"("idempotencyKey");
CREATE INDEX "DomainAction_domainId_createdAt_idx" ON "DomainAction"("domainId", "createdAt");
CREATE INDEX "DomainAction_status_kind_idx" ON "DomainAction"("status", "kind");
ALTER TABLE "DomainAction" ADD CONSTRAINT "DomainAction_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
