ALTER TABLE "Ticket" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Ticket" ADD COLUMN "productId" INTEGER;
UPDATE "Ticket" SET "department" = 'SUBSCRIPTION' WHERE "subscriptionId" IS NOT NULL;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Ticket_department_status_updatedAt_idx" ON "Ticket"("department", "status", "updatedAt");
