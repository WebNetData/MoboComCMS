-- A magazine article can be written as a MoboCom document (blocks). Additive: every existing article stays "legacy"
-- and renders from its HTML exactly as before.
ALTER TABLE "Post" ADD COLUMN "editorFormat" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Post" ADD COLUMN "contentDocument" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD CONSTRAINT "Post_editorFormat_check" CHECK ("editorFormat" IN ('legacy', 'blocks-v1'));
ALTER TABLE "Post" ADD CONSTRAINT "Post_document_matches_format" CHECK (("editorFormat" <> 'legacy' OR "contentDocument" = '') AND ("editorFormat" <> 'blocks-v1' OR "contentDocument" <> ''));
