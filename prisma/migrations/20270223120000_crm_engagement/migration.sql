-- Additive CRM consent and bounded notification delivery metadata; all prior rows retain legacy delivery.
ALTER TABLE "User" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
CREATE INDEX "User_marketingOptIn_status_id_idx" ON "User"("marketingOptIn", "status", "id");
ALTER TABLE "UserNotification" ADD COLUMN "deliveryChannels" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserNotification" ADD COLUMN "marketingSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserNotification" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "UserNotification_kind_createdAt_idx" ON "UserNotification"("kind", "createdAt");
