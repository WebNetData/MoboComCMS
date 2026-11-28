ALTER TABLE "Ticket" ADD COLUMN "expertRequestKey" TEXT;
CREATE UNIQUE INDEX "Ticket_expertRequestKey_key" ON "Ticket" ("expertRequestKey");
