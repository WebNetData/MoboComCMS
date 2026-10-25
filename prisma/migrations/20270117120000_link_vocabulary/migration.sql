-- Lists shared by every section's links: the audio of a release (seeded with the dub and the original audio the code
-- had fixed) and the suggested qualities. A quality is a name list (stored as it is written), so the code check allows it.
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_code_check";
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_code_check" CHECK (length("code") BETWEEN 1 AND 40 AND position(',' in "code") = 0
    AND (("section", "list") IN (('games', 'PLATFORM'), ('games', 'STORE'), ('media', 'QUALITY')) OR "code" ~ '^[A-Z0-9_]+$'));

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "sortOrder") VALUES
    ('media', 'AUDIO', 'DUBBED', 'دوبله فارسی', 'Persian dub', '🎙', 0),
    ('media', 'AUDIO', 'ORIGINAL', 'زبان اصلی', 'Original audio', '🌐', 1),
    ('media', 'QUALITY', '4K', '4K', '4K', '', 0),
    ('media', 'QUALITY', '1080p', '1080p', '1080p', '', 1),
    ('media', 'QUALITY', '720p', '720p', '720p', '', 2),
    ('media', 'QUALITY', '480p', '480p', '480p', '', 3);
