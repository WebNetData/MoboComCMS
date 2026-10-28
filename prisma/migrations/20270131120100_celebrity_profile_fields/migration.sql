-- The artists' profile fields start with country, born and died (the owner adds, renames, orders or switches off more).
INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "family", "sortOrder", "updatedAt") VALUES
    ('celebrities', 'PROFILE_FIELD', 'COUNTRY', 'کشور', 'Country', '🌍', 'COUNTRY', 0, now()),
    ('celebrities', 'PROFILE_FIELD', 'BIRTH_DATE', 'زادروز', 'Born', '🎂', 'BIRTH', 1, now()),
    ('celebrities', 'PROFILE_FIELD', 'DEATH_DATE', 'درگذشت', 'Died', '🕯️', 'DEATH', 2, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;
