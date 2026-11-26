CREATE TABLE "HostingOperation" (
 "id" TEXT PRIMARY KEY, "providerId" INTEGER NOT NULL REFERENCES "HostingProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "serviceId" INTEGER REFERENCES "HostingService"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "domainId" INTEGER REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "orderId" INTEGER REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "key" TEXT NOT NULL UNIQUE, "command" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "snapshot" TEXT NOT NULL, "reference" TEXT NOT NULL DEFAULT '', "version" INTEGER NOT NULL DEFAULT 1,
 "attempts" INTEGER NOT NULL DEFAULT 0, "token" TEXT NOT NULL DEFAULT '', "leaseAt" TIMESTAMP(3),
 "code" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "HostingOperation_contract" CHECK (
   ("serviceId" IS NOT NULL)::int+("domainId" IS NOT NULL)::int=1
   AND "command" IN ('CREATE','SUSPEND','UNSUSPEND','TERMINATE','START','STOP','SHUTDOWN','REBOOT','REGISTER','RENEW')
   AND "status" IN ('QUEUED','RUNNING','PENDING','UNKNOWN','DONE','FAILED','BLOCKED')
   AND "version">0 AND "attempts">=0 AND "snapshot" LIKE 'encv1:%'
   AND ("status"<>'RUNNING' OR ("leaseAt" IS NOT NULL AND length("token")>0))
 ));
CREATE INDEX "HostingOperation_status_updatedAt_idx" ON "HostingOperation"("status","updatedAt");
CREATE INDEX "HostingOperation_serviceId_createdAt_idx" ON "HostingOperation"("serviceId","createdAt");
CREATE INDEX "HostingOperation_domainId_createdAt_idx" ON "HostingOperation"("domainId","createdAt");
CREATE UNIQUE INDEX "HostingOperation_service_live" ON "HostingOperation"("serviceId") WHERE "status" NOT IN ('DONE','FAILED');
CREATE UNIQUE INDEX "HostingOperation_domain_live" ON "HostingOperation"("domainId") WHERE "status" NOT IN ('DONE','FAILED');

CREATE FUNCTION mobocom_cloud_resource_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE work RECORD;
BEGIN
 FOR work IN SELECT "id" FROM "HostingOperation"
 WHERE "status" NOT IN ('DONE','FAILED')
 AND ((TG_TABLE_NAME='HostingService' AND "serviceId"=OLD."id") OR (TG_TABLE_NAME='Domain' AND "domainId"=OLD."id"))
 LOOP
  IF current_setting('mobocom.cloud_operation',true) IS DISTINCT FROM work."id" THEN
   RAISE EXCEPTION 'cloud operation is unresolved' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "HostingService_cloud_fence" BEFORE UPDATE OF "status","externalId","loginSecret","providerId","hostname" ON "HostingService"
FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."externalId" IS DISTINCT FROM NEW."externalId" OR OLD."loginSecret" IS DISTINCT FROM NEW."loginSecret" OR OLD."providerId" IS DISTINCT FROM NEW."providerId" OR OLD."hostname" IS DISTINCT FROM NEW."hostname") EXECUTE FUNCTION mobocom_cloud_resource_fence();
CREATE TRIGGER "Domain_cloud_fence" BEFORE UPDATE OF "status","expiresAt","nameservers","name" ON "Domain"
FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR OLD."nameservers" IS DISTINCT FROM NEW."nameservers" OR OLD."name" IS DISTINCT FROM NEW."name") EXECUTE FUNCTION mobocom_cloud_resource_fence();
-- Paid resource work and financial closure share the canonical order row lock.
CREATE FUNCTION mobocom_cloud_financial_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id INTEGER;
BEGIN
 IF TG_TABLE_NAME='Order' THEN order_id:=OLD."id"; ELSE order_id:=OLD."orderId"; END IF;
 IF order_id IS NULL THEN RETURN NEW; END IF;
 PERFORM "id" FROM "Order" WHERE "id"=order_id FOR UPDATE;
 IF EXISTS (SELECT 1 FROM "HostingOperation" WHERE "orderId"=order_id AND "status" NOT IN ('DONE','FAILED')) THEN
  RAISE EXCEPTION 'cloud operation is unresolved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Invoice_cloud_financial_fence" BEFORE UPDATE OF "status" ON "Invoice"
FOR EACH ROW WHEN (OLD."status"='PAID' AND NEW."status"<>'PAID') EXECUTE FUNCTION mobocom_cloud_financial_fence();
CREATE TRIGGER "Order_cloud_financial_fence" BEFORE UPDATE OF "status" ON "Order"
FOR EACH ROW WHEN (OLD."status"='PAID' AND NEW."status"<>'PAID') EXECUTE FUNCTION mobocom_cloud_financial_fence();
