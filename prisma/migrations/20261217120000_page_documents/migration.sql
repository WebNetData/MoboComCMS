-- A page can be written as a MoboCom document (blocks). Additive: every existing page stays "legacy" and
-- renders from its HTML exactly as before.
ALTER TABLE "Page" ADD COLUMN "editorFormat" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Page" ADD COLUMN "contentDocument" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Page" ADD CONSTRAINT "Page_editorFormat_check" CHECK ("editorFormat" IN ('legacy', 'blocks-v1'));
-- A page written in blocks has its document; a legacy page has none.
ALTER TABLE "Page" ADD CONSTRAINT "Page_document_matches_format" CHECK (("editorFormat" <> 'legacy' OR "contentDocument" = '') AND ("editorFormat" <> 'blocks-v1' OR "contentDocument" <> ''));
