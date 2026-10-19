-- Synced patterns: a third kind of editor pattern, referenced live by documents instead of copied into them.
ALTER TABLE "EditorPattern" DROP CONSTRAINT IF EXISTS "EditorPattern_kind_check";
ALTER TABLE "EditorPattern" ADD CONSTRAINT "EditorPattern_kind_check" CHECK ("kind" IN ('pattern', 'template', 'synced'));
