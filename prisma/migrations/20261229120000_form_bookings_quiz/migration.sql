-- Appointment turns with capacity, and quiz scores on form answers. Additive only.
ALTER TABLE "FormSubmission" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FormSubmission" ADD COLUMN "scoreMax" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "FormBooking" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "fieldId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormBooking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FormBooking_seat_check" CHECK ("seat" >= 1)
);
CREATE UNIQUE INDEX "FormBooking_formId_fieldId_slot_seat_key" ON "FormBooking"("formId", "fieldId", "slot", "seat");
CREATE INDEX "FormBooking_submissionId_idx" ON "FormBooking"("submissionId");
ALTER TABLE "FormBooking" ADD CONSTRAINT "FormBooking_formId_fkey" FOREIGN KEY ("formId") REFERENCES "SiteForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormBooking" ADD CONSTRAINT "FormBooking_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
