-- The states and amounts of orders, invoices, payments, wallet rows, fulfilment jobs, receipts and
-- returns are held by the database itself, whatever code (or hand) writes them.
--
-- 1. Values: a state column only holds a state the code knows; money that cannot be negative is not.
-- 2. Transitions: what is settled stays settled. A trigger refuses the moves that would unsettle it.
--
-- Additive: no row is changed. Every constraint is validated against the rows already stored, so the
-- migration stops with the constraint's name if a stored row breaks a rule; nothing is half-applied.

-- ------------------------------------------------------------------ values

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
  ADD CONSTRAINT "Order_totalMinor_nonnegative" CHECK ("totalMinor" >= 0);

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_sellerStatus_check" CHECK ("sellerStatus" IN ('', 'ACCEPTED', 'READY', 'SHIPPED', 'CANCELLED')),
  ADD CONSTRAINT "OrderLine_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "OrderLine_money_nonnegative" CHECK ("unitPriceMinor" >= 0 AND "listPriceMinor" >= 0 AND "totalMinor" >= 0 AND "commissionMinor" >= 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('DRAFT', 'UNPAID', 'PAID', 'VOID', 'REFUNDED')),
  ADD CONSTRAINT "Invoice_kind_check" CHECK ("kind" IN ('BILLING', 'WALLET_TOPUP')),
  ADD CONSTRAINT "Invoice_money_nonnegative" CHECK ("subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0 AND "walletAppliedMinor" >= 0 AND "paidAmountMinor" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_status_check" CHECK ("status" IN ('PENDING', 'PROCESSED', 'CONFIRMED', 'FAILED', 'REFUNDED')),
  ADD CONSTRAINT "Payment_feeMinor_nonnegative" CHECK ("feeMinor" >= 0),
  -- Money received is never negative; money given back is never positive.
  ADD CONSTRAINT "Payment_amount_sign" CHECK (("status" <> 'CONFIRMED' OR "amountMinor" >= 0) AND ("status" <> 'REFUNDED' OR "amountMinor" <= 0));

ALTER TABLE "PaymentReceipt"
  ADD CONSTRAINT "PaymentReceipt_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD CONSTRAINT "PaymentReceipt_amountMinor_nonnegative" CHECK ("amountMinor" >= 0);

ALTER TABLE "WalletAccount"
  ADD CONSTRAINT "WalletAccount_balanceMinor_nonnegative" CHECK ("balanceMinor" >= 0);

ALTER TABLE "WalletTx"
  ADD CONSTRAINT "WalletTx_status_check" CHECK ("status" IN ('DONE', 'PENDING', 'PROCESSING', 'FAILED')),
  ADD CONSTRAINT "WalletTx_type_check" CHECK ("type" IN ('TOPUP', 'PURCHASE', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'RENEWAL', 'REFERRAL', 'GIFT_CARD', 'LOYALTY')),
  ADD CONSTRAINT "WalletTx_balanceAfterMinor_nonnegative" CHECK ("balanceAfterMinor" >= 0);

ALTER TABLE "FulfillmentJob"
  ADD CONSTRAINT "FulfillmentJob_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  ADD CONSTRAINT "FulfillmentJob_attempts_nonnegative" CHECK ("attempts" >= 0);

ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_status_check" CHECK ("status" IN ('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'WITHDRAWN')),
  ADD CONSTRAINT "ReturnRequest_kind_check" CHECK ("kind" IN ('CANCEL', 'RETURN')),
  ADD CONSTRAINT "ReturnRequest_money_nonnegative" CHECK ("requestedMinor" >= 0 AND "refundMinor" >= 0);

-- ------------------------------------------------------------------ transitions

-- One message shape for every refusal; SQLSTATE 23514 (check_violation), like the constraints above.
CREATE FUNCTION "mobocom_refuse_transition"(what text, detail text) RETURNS void AS $$
BEGIN
  RAISE EXCEPTION 'state rule: % (%)', what, detail USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

-- Invoice: a paid invoice is only ever refunded; a refunded one is closed; an invoice is paid from
-- open (DRAFT, UNPAID) and never from VOID, and only a paid one is refunded. Once paid, what was
-- charged does not change.
CREATE FUNCTION "mobocom_invoice_rules"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'REFUNDED' THEN PERFORM "mobocom_refuse_transition"('a refunded invoice is closed', 'Invoice ' || OLD."id" || ': REFUNDED -> ' || NEW."status"); END IF;
    IF OLD."status" = 'PAID' AND NEW."status" <> 'REFUNDED' THEN PERFORM "mobocom_refuse_transition"('a paid invoice can only be refunded', 'Invoice ' || OLD."id" || ': PAID -> ' || NEW."status"); END IF;
    IF NEW."status" = 'PAID' AND OLD."status" NOT IN ('DRAFT', 'UNPAID') THEN PERFORM "mobocom_refuse_transition"('only an open invoice is paid', 'Invoice ' || OLD."id" || ': ' || OLD."status" || ' -> PAID'); END IF;
    IF NEW."status" = 'REFUNDED' AND OLD."status" <> 'PAID' THEN PERFORM "mobocom_refuse_transition"('only a paid invoice is refunded', 'Invoice ' || OLD."id" || ': ' || OLD."status" || ' -> REFUNDED'); END IF;
  END IF;
  IF OLD."status" IN ('PAID', 'REFUNDED') AND (NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW."paidAmountMinor" IS DISTINCT FROM OLD."paidAmountMinor" OR NEW."currency" IS DISTINCT FROM OLD."currency") THEN
    PERFORM "mobocom_refuse_transition"('the amounts of a paid invoice do not change', 'Invoice ' || OLD."id");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Invoice_state_rules" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "mobocom_invoice_rules"();

-- Order: a paid order does not go back to unpaid states (it may be cancelled or refunded); a
-- refunded order is closed.
CREATE FUNCTION "mobocom_order_rules"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'REFUNDED' THEN PERFORM "mobocom_refuse_transition"('a refunded order is closed', 'Order ' || OLD."id" || ': REFUNDED -> ' || NEW."status"); END IF;
    IF OLD."status" = 'PAID' AND NEW."status" NOT IN ('CANCELLED', 'REFUNDED') THEN PERFORM "mobocom_refuse_transition"('a paid order does not become unpaid', 'Order ' || OLD."id" || ': PAID -> ' || NEW."status"); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Order_state_rules" BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION "mobocom_order_rules"();

-- Payment: a confirmed or refunded payment is a fact; its state, amount and currency stay.
CREATE FUNCTION "mobocom_payment_rules"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('CONFIRMED', 'REFUNDED') AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."currency" IS DISTINCT FROM OLD."currency") THEN
    PERFORM "mobocom_refuse_transition"('a settled payment does not change', 'Payment ' || OLD."id" || ': ' || OLD."status");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_state_rules" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "mobocom_payment_rules"();

-- Wallet ledger: a row that moved money (DONE) is a fact; its state, type, amount, balance and currency stay.
CREATE FUNCTION "mobocom_wallet_tx_rules"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'DONE' AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."type" IS DISTINCT FROM OLD."type" OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."balanceAfterMinor" IS DISTINCT FROM OLD."balanceAfterMinor" OR NEW."currency" IS DISTINCT FROM OLD."currency") THEN
    PERFORM "mobocom_refuse_transition"('a wallet row that moved money does not change', 'WalletTx ' || OLD."id");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "WalletTx_state_rules" BEFORE UPDATE ON "WalletTx" FOR EACH ROW EXECUTE FUNCTION "mobocom_wallet_tx_rules"();

-- Fulfilment job: a finished job does not run again.
CREATE FUNCTION "mobocom_fulfillment_job_rules"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'DONE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "mobocom_refuse_transition"('a finished job does not run again', 'FulfillmentJob ' || OLD."id" || ': DONE -> ' || NEW."status");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FulfillmentJob_state_rules" BEFORE UPDATE ON "FulfillmentJob" FOR EACH ROW EXECUTE FUNCTION "mobocom_fulfillment_job_rules"();

-- Receipt: a rejected receipt is closed (an approved one goes back to the queue when its settlement is refused).
CREATE FUNCTION "mobocom_payment_receipt_rules"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'REJECTED' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "mobocom_refuse_transition"('a rejected receipt is closed', 'PaymentReceipt ' || OLD."id" || ': REJECTED -> ' || NEW."status");
  END IF;
  IF NEW."status" = 'REJECTED' AND OLD."status" <> 'PENDING' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "mobocom_refuse_transition"('only a waiting receipt is rejected', 'PaymentReceipt ' || OLD."id" || ': ' || OLD."status" || ' -> REJECTED');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentReceipt_state_rules" BEFORE UPDATE ON "PaymentReceipt" FOR EACH ROW EXECUTE FUNCTION "mobocom_payment_receipt_rules"();

-- Return: a rejected or withdrawn request is closed. A refund is taken back only while no wallet row
-- records it (the credit failed); once the money is recorded, the request and its amount stay.
CREATE FUNCTION "mobocom_return_request_rules"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" IN ('REJECTED', 'WITHDRAWN') THEN PERFORM "mobocom_refuse_transition"('a decided request is closed', 'ReturnRequest ' || OLD."id" || ': ' || OLD."status" || ' -> ' || NEW."status"); END IF;
    IF OLD."status" = 'REFUNDED' AND OLD."walletTxId" IS NOT NULL THEN PERFORM "mobocom_refuse_transition"('a refund that was paid is not taken back', 'ReturnRequest ' || OLD."id" || ': REFUNDED -> ' || NEW."status"); END IF;
  END IF;
  IF OLD."status" = 'REFUNDED' AND OLD."walletTxId" IS NOT NULL AND (NEW."refundMinor" IS DISTINCT FROM OLD."refundMinor" OR NEW."walletTxId" IS DISTINCT FROM OLD."walletTxId") THEN
    PERFORM "mobocom_refuse_transition"('the amount of a paid refund does not change', 'ReturnRequest ' || OLD."id");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ReturnRequest_state_rules" BEFORE UPDATE ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION "mobocom_return_request_rules"();
