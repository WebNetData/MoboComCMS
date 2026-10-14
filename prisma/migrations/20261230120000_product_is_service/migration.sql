-- A virtual product may be marked as a service (work done by staff); additive, every product stays as it was.
ALTER TABLE "Product" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Product_isService_idx" ON "Product"("isService");
