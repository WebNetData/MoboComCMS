CREATE TABLE "FormWebhookDelivery" (
  "id" SERIAL PRIMARY KEY,
  "formId" INTEGER NOT NULL REFERENCES "SiteForm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "submissionId" INTEGER REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "endpointKey" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "cycleAttempts" INTEGER NOT NULL DEFAULT 0,
  "httpStatus" INTEGER,
  "durationMs" INTEGER,
  "failure" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "nextAttemptAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormWebhookDelivery_event_check"
    CHECK (("event" = 'test' AND "submissionId" IS NULL)
      OR ("event" IN ('submitted', 'paid', 'stage') AND "submissionId" IS NOT NULL)),
  CONSTRAINT "FormWebhookDelivery_status_check"
    CHECK ("status" IN ('PENDING', 'RETRY', 'IN_FLIGHT', 'DELIVERED', 'FAILED', 'UNKNOWN', 'CANCELLED')),
  CONSTRAINT "FormWebhookDelivery_schedule_check"
    CHECK (("status" IN ('PENDING', 'RETRY', 'IN_FLIGHT')) = ("nextAttemptAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "FormWebhookDelivery_eventId_key" ON "FormWebhookDelivery" ("eventId");
CREATE UNIQUE INDEX "FormWebhookDelivery_formId_sourceKey_endpointKey_key" ON "FormWebhookDelivery" ("formId", "sourceKey", "endpointKey");
CREATE INDEX "FormWebhookDelivery_formId_id_idx" ON "FormWebhookDelivery" ("formId", "id");
CREATE INDEX "FormWebhookDelivery_formId_status_id_idx" ON "FormWebhookDelivery" ("formId", "status", "id");
CREATE INDEX "FormWebhookDelivery_submissionId_idx" ON "FormWebhookDelivery" ("submissionId");
CREATE INDEX "FormWebhookDelivery_status_nextAttemptAt_idx" ON "FormWebhookDelivery" ("status", "nextAttemptAt");
CREATE INDEX "FormWebhookDelivery_expiresAt_idx" ON "FormWebhookDelivery" ("expiresAt");
