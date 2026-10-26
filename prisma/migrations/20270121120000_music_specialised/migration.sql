-- Music becomes specialised: genres, release types and credit roles are the owner's managed lists, an album has a
-- release type, and a song lists who else made it (artist profiles in a role). Additive; existing genres are adopted.
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('media', 'QUALITY'), ('software', 'PLATFORM'), ('software', 'APP_STORE'), ('music', 'GENRE')) OR "code" ~ '^[A-Z0-9_]+$'));

ALTER TABLE "MusicAlbum" ADD COLUMN "albumType" TEXT NOT NULL DEFAULT 'ALBUM';

CREATE TABLE "MusicCredit" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MusicCredit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MusicCredit_role_check" CHECK ("role" ~ '^[A-Z0-9_]{1,40}$')
);
CREATE UNIQUE INDEX "MusicCredit_trackId_artistId_role_key" ON "MusicCredit"("trackId", "artistId", "role");
CREATE INDEX "MusicCredit_artistId_role_idx" ON "MusicCredit"("artistId", "role");
ALTER TABLE "MusicCredit" ADD CONSTRAINT "MusicCredit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicCredit" ADD CONSTRAINT "MusicCredit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "sortOrder", "updatedAt") VALUES
    ('music', 'GENRE', 'پاپ', 'پاپ', 'Pop', '', 0, now()),
    ('music', 'GENRE', 'رپ فارسی', 'رپ فارسی', 'Persian rap', '', 1, now()),
    ('music', 'GENRE', 'هیپ هاپ', 'هیپ هاپ', 'Hip hop', '', 2, now()),
    ('music', 'GENRE', 'سنتی', 'سنتی', 'Traditional', '', 3, now()),
    ('music', 'GENRE', 'راک', 'راک', 'Rock', '', 4, now()),
    ('music', 'GENRE', 'تلفیقی', 'تلفیقی', 'Fusion', '', 5, now()),
    ('music', 'ALBUM_TYPE', 'ALBUM', 'آلبوم', 'Album', '💿', 0, now()),
    ('music', 'ALBUM_TYPE', 'EP', 'ای‌پی', 'EP', '', 1, now()),
    ('music', 'ALBUM_TYPE', 'SINGLE', 'تک‌آهنگ', 'Single', '', 2, now()),
    ('music', 'ALBUM_TYPE', 'COMPILATION', 'مجموعه', 'Compilation', '', 3, now()),
    ('music', 'ALBUM_TYPE', 'LIVE', 'اجرای زنده', 'Live', '🎤', 4, now()),
    ('music', 'ALBUM_TYPE', 'SOUNDTRACK', 'موسیقی متن', 'Soundtrack', '🎬', 5, now()),
    ('music', 'CREDIT_ROLE', 'FEATURED', 'با همراهی', 'Featuring', '', 0, now()),
    ('music', 'CREDIT_ROLE', 'COMPOSER', 'آهنگساز', 'Composer', '', 1, now()),
    ('music', 'CREDIT_ROLE', 'LYRICIST', 'ترانه‌سرا', 'Lyricist', '', 2, now()),
    ('music', 'CREDIT_ROLE', 'ARRANGER', 'تنظیم‌کننده', 'Arranger', '', 3, now()),
    ('music', 'CREDIT_ROLE', 'MIXING', 'میکس و مستر', 'Mixing & mastering', '', 4, now()),
    ('music', 'CREDIT_ROLE', 'PRODUCER', 'تهیه‌کننده', 'Producer', '', 5, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;

-- Genre names songs and albums already use join the list, so nothing an item has is unmanaged.
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "sortOrder", "updatedAt")
SELECT 'music', 'GENRE', name, name, '', 100, now()
FROM (SELECT DISTINCT btrim(part) AS name FROM (SELECT "genre" FROM "MusicTrack" UNION ALL SELECT "genre" FROM "MusicAlbum") AS items, regexp_split_to_table("genre", '[,،|]') AS part) AS used
WHERE length(name) BETWEEN 1 AND 40
ON CONFLICT ("section", "list", "code") DO NOTHING;
