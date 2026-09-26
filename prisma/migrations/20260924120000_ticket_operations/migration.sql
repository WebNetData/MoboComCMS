ALTER TABLE "Ticket" ADD COLUMN "assignedToId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "lastCustomerAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "lastStaffAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "slaDueAt" TIMESTAMP(3);
ALTER TABLE "TicketMessage" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");
UPDATE "Ticket" t SET "lastCustomerAt" = (SELECT MAX(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."fromAdmin" = false), "lastStaffAt" = (SELECT MAX(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."fromAdmin" = true);
