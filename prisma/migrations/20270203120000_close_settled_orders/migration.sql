-- Data only. Orders and invoices that came apart before the two began closing together (billing/server/order-closure.ts).
-- 1. A refunded invoice left its order paid and open to be shipped: the order is refunded too.
-- 2. A cancelled order left its invoice open to be paid: the invoice is void. The order worker gives back any wallet
--    credit held by a void invoice (recoverVoidInvoiceCredit), and stock held for the order is released when its hold ends.
-- Repeating this changes nothing. Stock, deliveries and money rows are left as they are: what really happened to the goods
-- of an already refunded order is for staff to see, not for a migration to guess.

UPDATE "Order" AS o
SET "status" = 'REFUNDED'
FROM "Invoice" AS i
WHERE i."orderId" = o."id" AND i."status" = 'REFUNDED' AND o."status" = 'PAID';

UPDATE "Invoice" AS i
SET "status" = 'VOID', "paymentUrl" = ''
FROM "Order" AS o
WHERE i."orderId" = o."id" AND o."status" = 'CANCELLED' AND i."status" IN ('UNPAID', 'DRAFT')
  AND NOT EXISTS (SELECT 1 FROM "PaymentReceipt" AS r WHERE r."invoiceId" = i."id" AND r."status" = 'PENDING');
