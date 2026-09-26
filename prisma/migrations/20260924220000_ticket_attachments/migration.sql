CREATE TABLE "TicketAttachment" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketAttachment_filename_key" ON "TicketAttachment"("filename");
CREATE INDEX "TicketAttachment_messageId_idx" ON "TicketAttachment"("messageId");
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
