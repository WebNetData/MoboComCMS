-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "storeWarrantyDeviceId" INTEGER;

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "storeWarrantyDeviceId" INTEGER;

-- CreateTable
CREATE TABLE "StoreQuotation" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "lines" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreWarrantyDevice" (
    "id" SERIAL NOT NULL,
    "orderLineId" INTEGER NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "serial" TEXT NOT NULL DEFAULT '',
    "imei" TEXT NOT NULL DEFAULT '',
    "warrantyStartsAt" TIMESTAMP(3) NOT NULL,
    "warrantyEndsAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreWarrantyDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnCustodyResolution" (
    "id" SERIAL NOT NULL,
    "returnRequestId" INTEGER NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "formSubmissionId" INTEGER,
    "destinationLocationId" INTEGER,
    "note" TEXT NOT NULL,
    "confirmedById" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnCustodyResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCanonicalAlias" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "productSourceId" INTEGER,
    "productTargetId" INTEGER,
    "cinemaSourceId" INTEGER,
    "cinemaTargetId" INTEGER,
    "gameSourceId" INTEGER,
    "gameTargetId" INTEGER,
    "softwareSourceId" INTEGER,
    "softwareTargetId" INTEGER,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "sourceVersion" TIMESTAMP(3) NOT NULL,
    "targetVersion" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContentCanonicalAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreQuotation_token_key" ON "StoreQuotation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "StoreQuotation_orderId_key" ON "StoreQuotation"("orderId");

-- CreateIndex
CREATE INDEX "StoreQuotation_userId_createdAt_idx" ON "StoreQuotation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreQuotation_status_expiresAt_idx" ON "StoreQuotation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreWarrantyDevice_warrantyEndsAt_idx" ON "StoreWarrantyDevice"("warrantyEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreWarrantyDevice_orderLineId_unitIndex_key" ON "StoreWarrantyDevice"("orderLineId", "unitIndex");

-- CreateIndex
CREATE INDEX "ReturnCustodyResolution_status_confirmedAt_idx" ON "ReturnCustodyResolution"("status", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCustodyResolution_returnRequestId_segmentIndex_key" ON "ReturnCustodyResolution"("returnRequestId", "segmentIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCanonicalAlias_productSourceId_key" ON "ContentCanonicalAlias"("productSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCanonicalAlias_cinemaSourceId_key" ON "ContentCanonicalAlias"("cinemaSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCanonicalAlias_gameSourceId_key" ON "ContentCanonicalAlias"("gameSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCanonicalAlias_softwareSourceId_key" ON "ContentCanonicalAlias"("softwareSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCanonicalAlias_sourcePath_key" ON "ContentCanonicalAlias"("sourcePath");

-- CreateIndex
CREATE INDEX "ContentCanonicalAlias_kind_active_idx" ON "ContentCanonicalAlias"("kind", "active");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_storeWarrantyDeviceId_fkey" FOREIGN KEY ("storeWarrantyDeviceId") REFERENCES "StoreWarrantyDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_storeWarrantyDeviceId_fkey" FOREIGN KEY ("storeWarrantyDeviceId") REFERENCES "StoreWarrantyDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreWarrantyDevice" ADD CONSTRAINT "StoreWarrantyDevice_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreWarrantyDevice" ADD CONSTRAINT "StoreWarrantyDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreWarrantyDevice" ADD CONSTRAINT "StoreWarrantyDevice_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_formSubmissionId_fkey" FOREIGN KEY ("formSubmissionId") REFERENCES "FormSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_productSourceId_fkey" FOREIGN KEY ("productSourceId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_productTargetId_fkey" FOREIGN KEY ("productTargetId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_cinemaSourceId_fkey" FOREIGN KEY ("cinemaSourceId") REFERENCES "CinemaTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_cinemaTargetId_fkey" FOREIGN KEY ("cinemaTargetId") REFERENCES "CinemaTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_gameSourceId_fkey" FOREIGN KEY ("gameSourceId") REFERENCES "GameTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_gameTargetId_fkey" FOREIGN KEY ("gameTargetId") REFERENCES "GameTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_softwareSourceId_fkey" FOREIGN KEY ("softwareSourceId") REFERENCES "SoftwareTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_softwareTargetId_fkey" FOREIGN KEY ("softwareTargetId") REFERENCES "SoftwareTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Workflow invariants; all existing financial rows and historical references stay intact.
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_state" CHECK ("status" IN ('OPEN','CANCELLED','CONVERTED') AND (("status"='CONVERTED' AND "orderId" IS NOT NULL AND "convertedAt" IS NOT NULL) OR ("status"<>'CONVERTED' AND "orderId" IS NULL AND "convertedAt" IS NULL)));
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_money" CHECK ("subtotalMinor">0 AND "discountMinor">=0 AND "discountMinor"<"subtotalMinor");
ALTER TABLE "StoreQuotation" ADD CONSTRAINT "StoreQuotation_lines" CHECK (jsonb_typeof("lines"::jsonb)='array' AND jsonb_array_length("lines"::jsonb) BETWEEN 1 AND 50);
ALTER TABLE "StoreWarrantyDevice" ADD CONSTRAINT "StoreWarrantyDevice_range" CHECK ("unitIndex">=0 AND "warrantyEndsAt">="warrantyStartsAt");
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_quantity" CHECK ("segmentIndex">=0 AND "quantity">0);
ALTER TABLE "ReturnCustodyResolution" ADD CONSTRAINT "ReturnCustodyResolution_state" CHECK (("status"='REPAIR' AND "resolution"='REPAIR' AND "formSubmissionId" IS NOT NULL AND "releasedAt" IS NULL AND "destinationLocationId" IS NULL) OR ("status"='RESTOCKED' AND "resolution"='RESTOCK' AND "destinationLocationId" IS NOT NULL AND "releasedAt" IS NOT NULL) OR ("status" IN ('SUPPLIER_RETURN','SCRAP') AND "resolution"="status" AND "destinationLocationId" IS NULL AND "releasedAt" IS NOT NULL));
ALTER TABLE "ContentCanonicalAlias" ADD CONSTRAINT "ContentCanonicalAlias_typed_pair" CHECK (("kind"='PRODUCT' AND "productSourceId" IS NOT NULL AND "productTargetId" IS NOT NULL AND "productSourceId"<>"productTargetId" AND "cinemaSourceId" IS NULL AND "cinemaTargetId" IS NULL AND "gameSourceId" IS NULL AND "gameTargetId" IS NULL AND "softwareSourceId" IS NULL AND "softwareTargetId" IS NULL) OR ("kind"='CINEMA' AND "productSourceId" IS NULL AND "productTargetId" IS NULL AND "cinemaSourceId" IS NOT NULL AND "cinemaTargetId" IS NOT NULL AND "cinemaSourceId"<>"cinemaTargetId" AND "gameSourceId" IS NULL AND "gameTargetId" IS NULL AND "softwareSourceId" IS NULL AND "softwareTargetId" IS NULL) OR ("kind"='GAME' AND "productSourceId" IS NULL AND "productTargetId" IS NULL AND "cinemaSourceId" IS NULL AND "cinemaTargetId" IS NULL AND "gameSourceId" IS NOT NULL AND "gameTargetId" IS NOT NULL AND "gameSourceId"<>"gameTargetId" AND "softwareSourceId" IS NULL AND "softwareTargetId" IS NULL) OR ("kind"='SOFTWARE' AND "productSourceId" IS NULL AND "productTargetId" IS NULL AND "cinemaSourceId" IS NULL AND "cinemaTargetId" IS NULL AND "gameSourceId" IS NULL AND "gameTargetId" IS NULL AND "softwareSourceId" IS NOT NULL AND "softwareTargetId" IS NOT NULL AND "softwareSourceId"<>"softwareTargetId"));
