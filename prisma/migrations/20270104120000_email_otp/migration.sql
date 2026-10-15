-- Preserve every existing SMS challenge; email uses the same canonical challenge store.
ALTER TABLE "OtpCode" ADD COLUMN "email" TEXT;
CREATE INDEX "OtpCode_email_purpose_createdAt_idx" ON "OtpCode"("email", "purpose", "createdAt");
