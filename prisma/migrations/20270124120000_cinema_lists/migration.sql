-- Films and series pick their genres, countries and languages from the owner's managed lists (name lists, as titles
-- already store them; each entry's English name is how imports name it). The names titles already use are adopted.
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('games', 'GENRE'), ('games', 'ENGINE'), ('media', 'QUALITY'), ('software', 'PLATFORM'), ('software', 'APP_STORE'), ('music', 'GENRE'), ('cinema', 'GENRE'), ('cinema', 'COUNTRY'), ('cinema', 'LANGUAGE')) OR "code" ~ '^[A-Z0-9_]+$'));

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt") VALUES
    ('cinema', 'GENRE', 'درام', 'درام', 'Drama', 0, now()),
    ('cinema', 'GENRE', 'جنایی', 'جنایی', 'Crime', 1, now()),
    ('cinema', 'GENRE', 'اکشن', 'اکشن', 'Action', 2, now()),
    ('cinema', 'GENRE', 'کمدی', 'کمدی', 'Comedy', 3, now()),
    ('cinema', 'GENRE', 'هیجان‌انگیز', 'هیجان‌انگیز', 'Thriller', 4, now()),
    ('cinema', 'GENRE', 'علمی تخیلی', 'علمی تخیلی', 'Sci-Fi', 5, now()),
    ('cinema', 'GENRE', 'عاشقانه', 'عاشقانه', 'Romance', 6, now()),
    ('cinema', 'GENRE', 'ترسناک', 'ترسناک', 'Horror', 7, now()),
    ('cinema', 'GENRE', 'انیمیشن', 'انیمیشن', 'Animation', 8, now()),
    ('cinema', 'GENRE', 'ماجرایی', 'ماجرایی', 'Adventure', 9, now()),
    ('cinema', 'GENRE', 'فانتزی', 'فانتزی', 'Fantasy', 10, now()),
    ('cinema', 'GENRE', 'معمایی', 'معمایی', 'Mystery', 11, now()),
    ('cinema', 'GENRE', 'تاریخی', 'تاریخی', 'History', 12, now()),
    ('cinema', 'GENRE', 'زندگی‌نامه', 'زندگی‌نامه', 'Biography', 13, now()),
    ('cinema', 'GENRE', 'جنگی', 'جنگی', 'War', 14, now()),
    ('cinema', 'GENRE', 'خانوادگی', 'خانوادگی', 'Family', 15, now()),
    ('cinema', 'GENRE', 'مستند', 'مستند', 'Documentary', 16, now()),
    ('cinema', 'GENRE', 'موزیکال', 'موزیکال', 'Musical', 17, now()),
    ('cinema', 'GENRE', 'ورزشی', 'ورزشی', 'Sport', 18, now()),
    ('cinema', 'GENRE', 'وسترن', 'وسترن', 'Western', 19, now()),
    ('cinema', 'COUNTRY', 'ایران', 'ایران', 'Iran', 0, now()),
    ('cinema', 'COUNTRY', 'آمریکا', 'آمریکا', 'United States', 1, now()),
    ('cinema', 'COUNTRY', 'انگلیس', 'انگلیس', 'United Kingdom', 2, now()),
    ('cinema', 'COUNTRY', 'فرانسه', 'فرانسه', 'France', 3, now()),
    ('cinema', 'COUNTRY', 'آلمان', 'آلمان', 'Germany', 4, now()),
    ('cinema', 'COUNTRY', 'ایتالیا', 'ایتالیا', 'Italy', 5, now()),
    ('cinema', 'COUNTRY', 'اسپانیا', 'اسپانیا', 'Spain', 6, now()),
    ('cinema', 'COUNTRY', 'کره جنوبی', 'کره جنوبی', 'South Korea', 7, now()),
    ('cinema', 'COUNTRY', 'ژاپن', 'ژاپن', 'Japan', 8, now()),
    ('cinema', 'COUNTRY', 'چین', 'چین', 'China', 9, now()),
    ('cinema', 'COUNTRY', 'هند', 'هند', 'India', 10, now()),
    ('cinema', 'COUNTRY', 'ترکیه', 'ترکیه', 'Turkey', 11, now()),
    ('cinema', 'COUNTRY', 'کانادا', 'کانادا', 'Canada', 12, now()),
    ('cinema', 'COUNTRY', 'استرالیا', 'استرالیا', 'Australia', 13, now()),
    ('cinema', 'COUNTRY', 'روسیه', 'روسیه', 'Russia', 14, now()),
    ('cinema', 'COUNTRY', 'مکزیک', 'مکزیک', 'Mexico', 15, now()),
    ('cinema', 'LANGUAGE', 'فارسی', 'فارسی', 'Persian', 0, now()),
    ('cinema', 'LANGUAGE', 'انگلیسی', 'انگلیسی', 'English', 1, now()),
    ('cinema', 'LANGUAGE', 'فرانسوی', 'فرانسوی', 'French', 2, now()),
    ('cinema', 'LANGUAGE', 'آلمانی', 'آلمانی', 'German', 3, now()),
    ('cinema', 'LANGUAGE', 'اسپانیایی', 'اسپانیایی', 'Spanish', 4, now()),
    ('cinema', 'LANGUAGE', 'ایتالیایی', 'ایتالیایی', 'Italian', 5, now()),
    ('cinema', 'LANGUAGE', 'کره‌ای', 'کره‌ای', 'Korean', 6, now()),
    ('cinema', 'LANGUAGE', 'ژاپنی', 'ژاپنی', 'Japanese', 7, now()),
    ('cinema', 'LANGUAGE', 'چینی', 'چینی', 'Mandarin', 8, now()),
    ('cinema', 'LANGUAGE', 'هندی', 'هندی', 'Hindi', 9, now()),
    ('cinema', 'LANGUAGE', 'ترکی', 'ترکی', 'Turkish', 10, now()),
    ('cinema', 'LANGUAGE', 'عربی', 'عربی', 'Arabic', 11, now()),
    ('cinema', 'LANGUAGE', 'روسی', 'روسی', 'Russian', 12, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;

-- Names titles already use join their lists, so nothing a title has is unmanaged.
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT DISTINCT 'cinema', list, name, name, '', 100, now()
FROM (
    SELECT 'GENRE' AS list, btrim(part) AS name FROM "CinemaTitle", regexp_split_to_table("genres", '[,،|]') AS part
    UNION ALL SELECT 'COUNTRY', btrim(part) FROM "CinemaTitle", regexp_split_to_table("countries", '[,،|]') AS part
    UNION ALL SELECT 'LANGUAGE', btrim(part) FROM "CinemaTitle", regexp_split_to_table("languages", '[,،|]') AS part
) AS used
WHERE length(name) BETWEEN 1 AND 40
ON CONFLICT ("section", "list", "code") DO NOTHING;
