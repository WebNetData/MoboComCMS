-- Data only. Music gets a second way of filing, beside its categories: the language or dialect of a song
-- (taxonomy "music-language", stored in the existing TaxonomyTerm / TaxonomyAssignment tables). These are the
-- four the owner named; more are added from the admin. A term that already exists is left as it is.
INSERT INTO "TaxonomyTerm" ("taxonomy", "slug", "name", "sortOrder", "color", "updatedAt") VALUES ('music-language', 'farsi', 'فارسی', 0, '#6366f1', CURRENT_TIMESTAMP) ON CONFLICT ("taxonomy", "slug") DO NOTHING;
INSERT INTO "TaxonomyTerm" ("taxonomy", "slug", "name", "sortOrder", "color", "updatedAt") VALUES ('music-language', 'torki', 'ترکی', 10, '#0ea5e9', CURRENT_TIMESTAMP) ON CONFLICT ("taxonomy", "slug") DO NOTHING;
INSERT INTO "TaxonomyTerm" ("taxonomy", "slug", "name", "sortOrder", "color", "updatedAt") VALUES ('music-language', 'lori', 'لری', 20, '#f59e0b', CURRENT_TIMESTAMP) ON CONFLICT ("taxonomy", "slug") DO NOTHING;
INSERT INTO "TaxonomyTerm" ("taxonomy", "slug", "name", "sortOrder", "color", "updatedAt") VALUES ('music-language', 'mazandarani', 'مازندرانی', 30, '#10b981', CURRENT_TIMESTAMP) ON CONFLICT ("taxonomy", "slug") DO NOTHING;
