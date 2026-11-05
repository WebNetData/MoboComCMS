-- Additive snapshot for deferred transfers; existing transfers keep their behavior.
ALTER TABLE "MediaTransfer" ADD COLUMN "musicMetadata" TEXT NOT NULL DEFAULT '{}';
