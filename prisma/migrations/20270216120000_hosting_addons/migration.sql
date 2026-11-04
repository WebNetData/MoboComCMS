-- Hosting add-ons: extra traffic bought on a service, on top of its plan. Additive.
ALTER TABLE "HostingService" ADD COLUMN "extraTrafficGb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HostingService" ADD CONSTRAINT "HostingService_extra_traffic_check" CHECK ("extraTrafficGb" >= 0);
