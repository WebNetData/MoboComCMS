BEGIN;

ALTER TABLE "PayMerchant" ADD COLUMN "gatewayPolicy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayTerminal" ADD COLUMN "gatewayPolicy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayPayment" ADD COLUMN "requestedGatewayRef" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PayMerchant" ADD CONSTRAINT "PayMerchant_gateway_policy_size" CHECK (octet_length("gatewayPolicy") <= 8192);
ALTER TABLE "PayTerminal" ADD CONSTRAINT "PayTerminal_gateway_policy_size" CHECK (octet_length("gatewayPolicy") <= 8192);
ALTER TABLE "PayPayment" ADD CONSTRAINT "PayPayment_requested_gateway_check" CHECK (
  "requestedGatewayRef" = '' OR (
    char_length("requestedGatewayRef") <= 64
    AND "requestedGatewayRef" ~ '^(db:[1-9][0-9]*|env:[A-Z][A-Z0-9_]*)$'
    AND ("gatewayAttemptRef" = '' OR "gatewayAttemptRef" = "requestedGatewayRef")
  )
);

CREATE FUNCTION "mobocom_pay_requested_gateway_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."requestedGatewayRef" IS DISTINCT FROM OLD."requestedGatewayRef" THEN
    RAISE EXCEPTION 'requested gateway is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayPayment_requested_gateway_immutable" BEFORE UPDATE OF "requestedGatewayRef" ON "PayPayment"
  FOR EACH ROW EXECUTE FUNCTION "mobocom_pay_requested_gateway_immutable"();
COMMIT;
