-- How a virtual product's deliveries look (owner 2026-11-12): the rows of the specialist's form, a default note, notices
-- for the buyer and whether the delivery is shown as a card. JSON read by store/domain/delivery-details. Additive.
ALTER TABLE "Product" ADD COLUMN "deliveryTemplate" TEXT NOT NULL DEFAULT '{}';
