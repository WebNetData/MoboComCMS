-- Hourly cloud billing: power state and charged-until mark on a service, and one charge row per service-hour. Additive.
ALTER TABLE "HostingService" ADD COLUMN "powerState" TEXT NOT NULL DEFAULT 'RUNNING';
ALTER TABLE "HostingService" ADD COLUMN "stoppedHourlyMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "HostingService" ADD COLUMN "chargedUntil" TIMESTAMP(3);
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_powerState_check" CHECK ("powerState" IN ('RUNNING', 'STOPPED'));
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_stopped_price_check" CHECK ("stoppedHourlyMinor" >= 0);

CREATE TABLE "HostingUsageCharge" (
  "id" SERIAL NOT NULL,
  "serviceId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "hourStart" TIMESTAMP(3) NOT NULL,
  "powerState" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "walletTxId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostingUsageCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostingUsageCharge_amount_check" CHECK ("amountMinor" >= 0),
  CONSTRAINT "HostingUsageCharge_power_check" CHECK ("powerState" IN ('RUNNING', 'STOPPED')),
  -- An hour starts on the hour.
  CONSTRAINT "HostingUsageCharge_hour_check" CHECK (date_trunc('hour', "hourStart") = "hourStart")
);
-- The rule that an hour is never charged twice.
CREATE UNIQUE INDEX "HostingUsageCharge_serviceId_hourStart_key" ON "HostingUsageCharge"("serviceId", "hourStart");
CREATE UNIQUE INDEX "HostingUsageCharge_walletTxId_key" ON "HostingUsageCharge"("walletTxId");
CREATE INDEX "HostingUsageCharge_userId_hourStart_idx" ON "HostingUsageCharge"("userId", "hourStart");
ALTER TABLE "HostingUsageCharge" ADD CONSTRAINT "HostingUsageCharge_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "HostingService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
