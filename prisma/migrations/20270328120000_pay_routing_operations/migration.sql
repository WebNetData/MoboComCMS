ALTER TABLE "PayBotIntegration" ADD COLUMN "routingRules" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "PayBotIntegration" ADD COLUMN "routingVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("routingVersion">0);
ALTER TABLE "PayBotIntegration" ADD CONSTRAINT "PayBotIntegration_routing_rules" CHECK (
  jsonb_typeof("routingRules"::jsonb)='array' AND jsonb_array_length("routingRules"::jsonb)<=12
);
ALTER TABLE "PayBotDelivery" ADD COLUMN "routingSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayBotDelivery" ADD CONSTRAINT "PayBotDelivery_routing_snapshot" CHECK (
  "routingSnapshot"='' OR (
    jsonb_typeof("routingSnapshot"::jsonb)='object'
    AND "routingSnapshot"::jsonb->>'version'='1'
    AND jsonb_typeof("routingSnapshot"::jsonb->'gateways')='array'
    AND jsonb_array_length("routingSnapshot"::jsonb->'gateways') BETWEEN 1 AND 5
  )
);
CREATE INDEX "PayBotDelivery_integrationId_status_createdAt_idx" ON "PayBotDelivery"("integrationId","status","createdAt");

CREATE FUNCTION "pay_bot_routing_snapshot_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."routingSnapshot" IS DISTINCT FROM OLD."routingSnapshot" THEN
    RAISE EXCEPTION 'bot routing snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PayBotDelivery_routing_snapshot_guard" BEFORE UPDATE ON "PayBotDelivery"
FOR EACH ROW EXECUTE FUNCTION "pay_bot_routing_snapshot_guard"();
