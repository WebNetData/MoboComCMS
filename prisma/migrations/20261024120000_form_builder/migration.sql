-- AlterTable
ALTER TABLE "SiteForm" ADD COLUMN     "settings" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "ipHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "userId" INTEGER;

-- CreateTable
CREATE TABLE "FormUpload" (
    "id" TEXT NOT NULL,
    "formId" INTEGER NOT NULL,
    "submissionId" INTEGER,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormUpload_formId_idx" ON "FormUpload"("formId");

-- CreateIndex
CREATE INDEX "FormUpload_submissionId_idx" ON "FormUpload"("submissionId");

-- CreateIndex
CREATE INDEX "FormUpload_createdAt_idx" ON "FormUpload"("createdAt");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_status_idx" ON "FormSubmission"("formId", "status");

-- CreateIndex
CREATE INDEX "FormSubmission_userId_idx" ON "FormSubmission"("userId");

-- AddForeignKey
ALTER TABLE "FormUpload" ADD CONSTRAINT "FormUpload_formId_fkey" FOREIGN KEY ("formId") REFERENCES "SiteForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormUpload" ADD CONSTRAINT "FormUpload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

