-- Additive: the language of a separate subtitle or audio file. Existing links keep '' and are unchanged.
ALTER TABLE "MediaLink" ADD COLUMN "language" TEXT NOT NULL DEFAULT '';
