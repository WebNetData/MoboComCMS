-- The games lists become the shared managed lists of every section (additive rename; the games rows are kept).
-- Software licences join as the first list of another section, seeded with the values the code had fixed.
ALTER TABLE "GameVocabulary" RENAME TO "Vocabulary";
ALTER SEQUENCE "GameVocabulary_id_seq" RENAME TO "Vocabulary_id_seq";
ALTER TABLE "Vocabulary" RENAME CONSTRAINT "GameVocabulary_pkey" TO "Vocabulary_pkey";
ALTER TABLE "Vocabulary" ADD COLUMN "section" TEXT NOT NULL DEFAULT 'games';
ALTER TABLE "Vocabulary" ALTER COLUMN "section" DROP DEFAULT;

DROP INDEX "GameVocabulary_list_code_key";
DROP INDEX "GameVocabulary_list_active_sortOrder_idx";
CREATE UNIQUE INDEX "Vocabulary_section_list_code_key" ON "Vocabulary"("section", "list", "code");
CREATE INDEX "Vocabulary_section_list_active_sortOrder_idx" ON "Vocabulary"("section", "list", "active", "sortOrder");

-- Which lists exist is declared in code; the database keeps the shape: a section and list name, and a code with no
-- comma (items keep codes in comma lists), upper case with underscores except for name lists (platforms, stores).
ALTER TABLE "Vocabulary" DROP CONSTRAINT "GameVocabulary_list_check";
ALTER TABLE "Vocabulary" DROP CONSTRAINT "GameVocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_section_check" CHECK ("section" ~ '^[a-z]{1,30}$' AND "list" ~ '^[A-Z_]{1,30}$');
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE')) OR "code" ~ '^[A-Z0-9_]+$'));

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder") VALUES
    ('software', 'LICENSE', 'FREE', 'رایگان', 'Free', 0),
    ('software', 'LICENSE', 'FREEMIUM', 'رایگان با امکانات پولی', 'Freemium', 1),
    ('software', 'LICENSE', 'TRIAL', 'نسخهٔ آزمایشی', 'Trial', 2),
    ('software', 'LICENSE', 'PAID', 'پولی', 'Paid', 3),
    ('software', 'LICENSE', 'OPEN_SOURCE', 'متن‌باز', 'Open source', 4);
