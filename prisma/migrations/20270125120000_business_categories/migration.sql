-- Businesses take their category (field of activity) from the owner's managed list, a name list as profiles already
-- store it. The categories profiles and requests already use are adopted. Additive.
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('games', 'GENRE'), ('games', 'ENGINE'), ('media', 'QUALITY'), ('software', 'PLATFORM'), ('software', 'APP_STORE'), ('music', 'GENRE'), ('cinema', 'GENRE'), ('cinema', 'COUNTRY'), ('cinema', 'LANGUAGE'), ('businesses', 'CATEGORY')) OR "code" ~ '^[A-Z0-9_]+$'));

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt") VALUES
    ('businesses', 'CATEGORY', 'فروشگاه اینترنتی', 'فروشگاه اینترنتی', 'Online shop', 0, now()),
    ('businesses', 'CATEGORY', 'موبایل و لوازم دیجیتال', 'موبایل و لوازم دیجیتال', 'Mobile & electronics', 1, now()),
    ('businesses', 'CATEGORY', 'پوشاک و مد', 'پوشاک و مد', 'Fashion', 2, now()),
    ('businesses', 'CATEGORY', 'خدمات اینترنت و میزبانی', 'خدمات اینترنت و میزبانی', 'Internet & hosting', 3, now()),
    ('businesses', 'CATEGORY', 'نرم‌افزار و اپلیکیشن', 'نرم‌افزار و اپلیکیشن', 'Software & apps', 4, now()),
    ('businesses', 'CATEGORY', 'خدمات مالی و پرداخت', 'خدمات مالی و پرداخت', 'Finance & payments', 5, now()),
    ('businesses', 'CATEGORY', 'آموزش', 'آموزش', 'Education', 6, now()),
    ('businesses', 'CATEGORY', 'سفر و گردشگری', 'سفر و گردشگری', 'Travel', 7, now()),
    ('businesses', 'CATEGORY', 'غذا و رستوران', 'غذا و رستوران', 'Food & restaurants', 8, now()),
    ('businesses', 'CATEGORY', 'سلامت و زیبایی', 'سلامت و زیبایی', 'Health & beauty', 9, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT DISTINCT 'businesses', 'CATEGORY', btrim(category), btrim(category), '', 100, now()
FROM (SELECT "category" FROM "BusinessProfile" UNION ALL SELECT "category" FROM "BusinessRequest") AS used
WHERE length(btrim(category)) BETWEEN 1 AND 40 AND position(',' in category) = 0
ON CONFLICT ("section", "list", "code") DO NOTHING;
