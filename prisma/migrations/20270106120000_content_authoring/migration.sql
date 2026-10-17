-- Additive metadata only. Existing terms, files, links and queued transfers keep their behavior.
ALTER TABLE "TaxonomyTerm" ADD COLUMN "facet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaTransfer" ADD COLUMN "destination" TEXT NOT NULL DEFAULT '';
