-- VIP plans pick their perk lines from the owner's managed PERK list (codes; a plan's perk JSON keeps the code and a
-- snapshot of the text). Seeds only: existing free perk lines stay as they are.
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "sortOrder", "updatedAt") VALUES
    ('membership', 'PERK', 'VIP_POSTS', 'مطالب ویژهٔ مجله', 'Members-only magazine articles', '📰', 0, now()),
    ('membership', 'PERK', 'VIP_CINEMA', 'فیلم و سریال ویژهٔ اعضا', 'Members-only films and series', '🎬', 1, now()),
    ('membership', 'PERK', 'VIP_LINKS', 'لینک‌های دانلود و پخش ویژه', 'Members-only download and stream links', '⬇️', 2, now()),
    ('membership', 'PERK', 'VIP_MUSIC', 'آهنگ و آلبوم ویژهٔ اعضا', 'Members-only songs and albums', '🎵', 3, now()),
    ('membership', 'PERK', 'HQ_MUSIC', 'موسیقی با کیفیت ۳۲۰', '320 kbps music', '🎧', 4, now()),
    ('membership', 'PERK', 'MUSIC_DOWNLOAD', 'دانلود آهنگ', 'Song downloads', '💾', 5, now()),
    ('membership', 'PERK', 'VIP_SOFTWARE', 'نرم‌افزار ویژهٔ اعضا', 'Members-only software', '💻', 6, now()),
    ('membership', 'PERK', 'VIP_GAMES', 'دانلود بازی‌های ویژه', 'Members-only game downloads', '🎮', 7, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;
