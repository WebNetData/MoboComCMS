-- Software becomes specialised: platforms and app stores are the owner's managed lists, a platform has a family
-- (desktop, mobile, web) that decides which of a title's fields apply, and a mobile app keeps its package id, the
-- oldest system it runs on and its pages on app stores. Additive; existing titles keep their platform names.
ALTER TABLE "Vocabulary" ADD COLUMN "family" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_family_check" CHECK ("family" ~ '^[A-Z_]{0,20}$');
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('media', 'QUALITY'), ('software', 'PLATFORM'), ('software', 'APP_STORE')) OR "code" ~ '^[A-Z0-9_]+$'));

ALTER TABLE "SoftwareTitle" ADD COLUMN "packageId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareTitle" ADD COLUMN "minOs" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareTitle" ADD COLUMN "appStores" TEXT NOT NULL DEFAULT '[]';

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "family", "sortOrder", "updatedAt") VALUES
    ('software', 'PLATFORM', 'Windows', 'Windows', 'Windows', '🪟', 'DESKTOP', 0, now()),
    ('software', 'PLATFORM', 'macOS', 'macOS', 'macOS', '🍎', 'DESKTOP', 1, now()),
    ('software', 'PLATFORM', 'Linux', 'Linux', 'Linux', '🐧', 'DESKTOP', 2, now()),
    ('software', 'PLATFORM', 'Android', 'Android', 'Android', '🤖', 'MOBILE', 3, now()),
    ('software', 'PLATFORM', 'iOS', 'iOS', 'iOS', '📱', 'MOBILE', 4, now()),
    ('software', 'APP_STORE', 'Google Play', 'گوگل‌پلی', 'Google Play', '▶️', '', 0, now()),
    ('software', 'APP_STORE', 'App Store', 'اپ‌استور', 'App Store', '', '', 1, now()),
    ('software', 'APP_STORE', 'Cafe Bazaar', 'کافه‌بازار', 'Cafe Bazaar', '🛍️', '', 2, now()),
    ('software', 'APP_STORE', 'Myket', 'مایکت', 'Myket', '', '', 3, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;

-- Platform names the titles already use join the list (without a family until the owner sets one), so nothing a
-- title has is unmanaged.
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT 'software', 'PLATFORM', name, name, name, 100, now()
FROM (SELECT DISTINCT btrim(part) AS name FROM "SoftwareTitle", regexp_split_to_table("platforms", ',') AS part) AS used
WHERE length(name) BETWEEN 1 AND 40
ON CONFLICT ("section", "list", "code") DO NOTHING;
