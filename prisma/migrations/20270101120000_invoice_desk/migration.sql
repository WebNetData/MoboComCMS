-- Invoice desk: titles, expiry, the rates an invoice was priced at, recurring invoices.
ALTER TABLE "Invoice" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "detail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "fxRates" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "closedReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "recurringId" INTEGER;
CREATE INDEX "Invoice_status_expiresAt_idx" ON "Invoice"("status", "expiresAt");
CREATE INDEX "Invoice_recurringId_idx" ON "Invoice"("recurringId");

CREATE TABLE "RecurringInvoice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "interval" TEXT NOT NULL DEFAULT 'MONTH',
    "nextAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "maxCount" INTEGER NOT NULL DEFAULT 0,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "dueDays" INTEGER NOT NULL DEFAULT 7,
    "gatewayId" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastInvoiceId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecurringInvoice_active_nextAt_idx" ON "RecurringInvoice"("active", "nextAt");
CREATE INDEX "RecurringInvoice_userId_idx" ON "RecurringInvoice"("userId");
