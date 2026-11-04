-- Hosting, servers and cloud: connected systems, products and their prices. Additive; nothing existing changes.
CREATE TABLE "HostingProvider" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "driver" TEXT NOT NULL,
  "url" TEXT NOT NULL DEFAULT '',
  "username" TEXT NOT NULL DEFAULT '',
  "secret" TEXT NOT NULL DEFAULT '',
  "config" TEXT NOT NULL DEFAULT '{}',
  "location" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckAt" TIMESTAMP(3),
  "lastCheckOk" BOOLEAN,
  "lastCheckMessage" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostingProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingProvider_family_check" CHECK ("family" IN ('WEB_PANEL', 'COMPUTE', 'REGISTRAR')),
  CONSTRAINT "HostingProvider_capacity_check" CHECK ("capacity" >= 0)
);
CREATE INDEX "HostingProvider_family_active_idx" ON "HostingProvider"("family", "active");

CREATE TABLE "HostingProduct" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tagline" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL,
  "fulfillment" TEXT NOT NULL DEFAULT 'MANUAL',
  "providerId" INTEGER,
  "providerPlan" TEXT NOT NULL DEFAULT '',
  "cpuCores" INTEGER NOT NULL DEFAULT 0,
  "ramMb" INTEGER NOT NULL DEFAULT 0,
  "diskGb" INTEGER NOT NULL DEFAULT 0,
  "diskType" TEXT NOT NULL DEFAULT 'NVMe',
  "trafficGb" INTEGER NOT NULL DEFAULT 0,
  "bandwidthMbps" INTEGER NOT NULL DEFAULT 0,
  "sites" INTEGER NOT NULL DEFAULT 0,
  "mailboxes" INTEGER NOT NULL DEFAULT 0,
  "databases" INTEGER NOT NULL DEFAULT 0,
  "ipv4" INTEGER NOT NULL DEFAULT 0,
  "location" TEXT NOT NULL DEFAULT '',
  "features" TEXT NOT NULL DEFAULT '[]',
  "allowTraffic" BOOLEAN NOT NULL DEFAULT false,
  "trafficPackGb" INTEGER NOT NULL DEFAULT 0,
  "trafficPackMinor" BIGINT NOT NULL DEFAULT 0,
  "allowUpgrade" BOOLEAN NOT NULL DEFAULT false,
  "stoppedHourlyMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostingProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingProduct_kind_check" CHECK ("kind" IN ('SHARED', 'RESELLER', 'CLOUD_HOSTING', 'VPS', 'CLOUD_SERVER', 'DEDICATED')),
  CONSTRAINT "HostingProduct_fulfillment_check" CHECK (("fulfillment" = 'MANUAL') OR ("fulfillment" = 'DRIVER' AND "providerId" IS NOT NULL)),
  CONSTRAINT "HostingProduct_money_nonnegative" CHECK ("trafficPackMinor" >= 0 AND "stoppedHourlyMinor" >= 0),
  CONSTRAINT "HostingProduct_traffic_pack_check" CHECK (NOT "allowTraffic" OR ("trafficPackGb" > 0 AND "trafficPackMinor" > 0))
);
CREATE UNIQUE INDEX "HostingProduct_slug_key" ON "HostingProduct"("slug");
CREATE INDEX "HostingProduct_kind_active_sort_idx" ON "HostingProduct"("kind", "active", "sort");
CREATE INDEX "HostingProduct_providerId_idx" ON "HostingProduct"("providerId");
ALTER TABLE "HostingProduct" ADD CONSTRAINT "HostingProduct_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "HostingProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HostingPrice" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "cycle" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "amountMinor" BIGINT NOT NULL,
  "setupMinor" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "HostingPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingPrice_cycle_check" CHECK ("cycle" IN ('HOURLY', 'MONTH', 'QUARTER', 'HALF', 'YEAR')),
  CONSTRAINT "HostingPrice_amount_check" CHECK ("amountMinor" > 0 AND "setupMinor" >= 0)
);
CREATE UNIQUE INDEX "HostingPrice_productId_cycle_currency_key" ON "HostingPrice"("productId", "cycle", "currency");
ALTER TABLE "HostingPrice" ADD CONSTRAINT "HostingPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HostingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
