-- A popup may show a saved builder template instead of its built-in design.
ALTER TABLE "SitePopup" ADD COLUMN "templateId" TEXT NOT NULL DEFAULT '';
