-- Additive links/snapshots; historical tickets and sold lines retain their meaning.
ALTER TABLE "Ticket" ADD COLUMN "orderId" INTEGER;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");
ALTER TABLE "OrderLine" ADD COLUMN "deviceIdentifiers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_deviceIdentifiers_array" CHECK (jsonb_typeof("deviceIdentifiers"::jsonb) = 'array');
