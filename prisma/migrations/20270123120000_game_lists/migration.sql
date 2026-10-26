-- Games pick their genres and engine from the owner's managed lists (name lists, as games already store them). The
-- genre and engine names games already use are adopted. Additive.
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('games', 'GENRE'), ('games', 'ENGINE'), ('media', 'QUALITY'), ('software', 'PLATFORM'), ('software', 'APP_STORE'), ('music', 'GENRE')) OR "code" ~ '^[A-Z0-9_]+$'));

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt") VALUES
    ('games', 'GENRE', 'اکشن', 'اکشن', 'Action', 0, now()),
    ('games', 'GENRE', 'ماجرایی', 'ماجرایی', 'Adventure', 1, now()),
    ('games', 'GENRE', 'نقش‌آفرینی', 'نقش‌آفرینی', 'RPG', 2, now()),
    ('games', 'GENRE', 'شوتر', 'شوتر', 'Shooter', 3, now()),
    ('games', 'GENRE', 'جهان‌باز', 'جهان‌باز', 'Open world', 4, now()),
    ('games', 'GENRE', 'ورزشی', 'ورزشی', 'Sports', 5, now()),
    ('games', 'GENRE', 'مسابقه‌ای', 'مسابقه‌ای', 'Racing', 6, now()),
    ('games', 'GENRE', 'استراتژی', 'استراتژی', 'Strategy', 7, now()),
    ('games', 'GENRE', 'ترسناک', 'ترسناک', 'Horror', 8, now()),
    ('games', 'GENRE', 'مبارزه‌ای', 'مبارزه‌ای', 'Fighting', 9, now()),
    ('games', 'GENRE', 'شبیه‌سازی', 'شبیه‌سازی', 'Simulation', 10, now()),
    ('games', 'GENRE', 'پلتفرمر', 'پلتفرمر', 'Platformer', 11, now()),
    ('games', 'ENGINE', 'Unreal Engine 5', 'Unreal Engine 5', 'Unreal Engine 5', 0, now()),
    ('games', 'ENGINE', 'Unreal Engine 4', 'Unreal Engine 4', 'Unreal Engine 4', 1, now()),
    ('games', 'ENGINE', 'Unity', 'Unity', 'Unity', 2, now()),
    ('games', 'ENGINE', 'RE Engine', 'RE Engine', 'RE Engine', 3, now()),
    ('games', 'ENGINE', 'AnvilNext', 'AnvilNext', 'AnvilNext', 4, now()),
    ('games', 'ENGINE', 'Frostbite', 'Frostbite', 'Frostbite', 5, now()),
    ('games', 'ENGINE', 'Decima', 'Decima', 'Decima', 6, now()),
    ('games', 'ENGINE', 'proprietary', 'موتور اختصاصی', 'Proprietary', 7, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT 'games', 'GENRE', name, name, '', 100, now()
FROM (SELECT DISTINCT btrim(part) AS name FROM "GameTitle", regexp_split_to_table("genres", '[,،]') AS part) AS used
WHERE length(name) BETWEEN 1 AND 40
ON CONFLICT ("section", "list", "code") DO NOTHING;
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT DISTINCT 'games', 'ENGINE', btrim("engine"), btrim("engine"), '', 100, now() FROM "GameTitle"
WHERE length(btrim("engine")) BETWEEN 1 AND 40 AND position(',' in "engine") = 0
ON CONFLICT ("section", "list", "code") DO NOTHING;
