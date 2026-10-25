-- The owner's lists for games (platforms, stores, play modes, Persian localisations), seeded with the values the code
-- had fixed so far. A game keeps storing the code; nothing on GameTitle changes (additive).
CREATE TABLE "GameVocabulary" (
    "id" SERIAL NOT NULL,
    "list" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameVocabulary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameVocabulary_list_check" CHECK ("list" IN ('PLATFORM', 'STORE', 'MODE', 'LOCALIZATION')),
    -- Mode and localisation codes are stored in a comma list; platform and store names must not hold a comma either.
    CONSTRAINT "GameVocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
        AND ("list" IN ('PLATFORM', 'STORE') OR "code" ~ '^[A-Z0-9_]+$'))
);
CREATE UNIQUE INDEX "GameVocabulary_list_code_key" ON "GameVocabulary"("list", "code");
CREATE INDEX "GameVocabulary_list_active_sortOrder_idx" ON "GameVocabulary"("list", "active", "sortOrder");

INSERT INTO "GameVocabulary" ("list", "code", "name", "nameEn", "sortOrder") VALUES
    ('PLATFORM', 'PC', 'PC', 'PC', 0),
    ('PLATFORM', 'PS5', 'PS5', 'PS5', 1),
    ('PLATFORM', 'PS4', 'PS4', 'PS4', 2),
    ('PLATFORM', 'Xbox Series', 'Xbox Series', 'Xbox Series', 3),
    ('PLATFORM', 'Xbox One', 'Xbox One', 'Xbox One', 4),
    ('PLATFORM', 'Switch', 'Switch', 'Switch', 5),
    ('PLATFORM', 'Android', 'Android', 'Android', 6),
    ('PLATFORM', 'iOS', 'iOS', 'iOS', 7),
    ('PLATFORM', 'Mac', 'Mac', 'Mac', 8),
    ('PLATFORM', 'Linux', 'Linux', 'Linux', 9),
    ('STORE', 'Steam', 'Steam', 'Steam', 0),
    ('STORE', 'Epic Games', 'Epic Games', 'Epic Games', 1),
    ('STORE', 'PlayStation Store', 'PlayStation Store', 'PlayStation Store', 2),
    ('STORE', 'Xbox Store', 'Xbox Store', 'Xbox Store', 3),
    ('STORE', 'Nintendo eShop', 'Nintendo eShop', 'Nintendo eShop', 4),
    ('STORE', 'GOG', 'GOG', 'GOG', 5),
    ('STORE', 'Google Play', 'Google Play', 'Google Play', 6),
    ('STORE', 'App Store', 'App Store', 'App Store', 7),
    ('STORE', 'سایت رسمی', 'سایت رسمی', 'Official site', 8),
    ('MODE', 'SINGLE', 'تک‌نفره', 'Single-player', 0),
    ('MODE', 'MULTI', 'چندنفره', 'Multiplayer', 1),
    ('MODE', 'COOP', 'همکاری (Co-op)', 'Co-op', 2),
    ('MODE', 'ONLINE', 'آنلاین', 'Online', 3),
    ('LOCALIZATION', 'FA_SUB', 'زیرنویس فارسی', 'Persian subtitles', 0),
    ('LOCALIZATION', 'FA_DUB', 'دوبله فارسی', 'Persian dub', 1),
    ('LOCALIZATION', 'FA_UI', 'منوی فارسی', 'Persian menus', 2);
