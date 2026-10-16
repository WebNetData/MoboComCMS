ALTER TABLE "MediaTransfer" ADD COLUMN "authority" TEXT NOT NULL DEFAULT 'media';
ALTER TABLE "MediaTransfer" ADD CONSTRAINT "MediaTransfer_authority" CHECK ("authority" IN ('media','import'));
