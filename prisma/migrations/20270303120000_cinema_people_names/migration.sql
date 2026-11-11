-- Film people keep two names: the Persian display name (`name`) and the Latin one IMDb gives (`nameEn`), with the IMDb
-- person ID as their identity. Additive; every existing person stays as it was.
ALTER TABLE "CinemaPerson" ADD COLUMN "nameEn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CinemaPerson" ADD COLUMN "normalizedNameEn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CinemaPerson" ADD COLUMN "imdbId" TEXT;
ALTER TABLE "CinemaPerson" ADD CONSTRAINT "CinemaPerson_imdbId_check" CHECK ("imdbId" IS NULL OR "imdbId" ~ '^nm[0-9]{7,12}$');
ALTER TABLE "CinemaPerson" ADD CONSTRAINT "CinemaPerson_nameEn_check" CHECK (length("nameEn") <= 120);
CREATE UNIQUE INDEX "CinemaPerson_imdbId_key" ON "CinemaPerson"("imdbId");
CREATE INDEX "CinemaPerson_normalizedNameEn_idx" ON "CinemaPerson"("normalizedNameEn");
CREATE INDEX "CinemaPerson_displayNameKey_idx" ON "CinemaPerson"("displayNameKey");

-- The film lists adopted every name titles used (20270124120000), English ones included, although a seeded entry already
-- carried that English name ("United States" beside "آمریکا" whose English name is United States). Titles move to the
-- entry that names it and the adopted copy goes, so a filter offers each country, genre and language once.
CREATE TEMP TABLE "cinema_list_copy" ON COMMIT DROP AS
SELECT DISTINCT ON (copy."list", copy."code") copy."list", copy."code" AS "copy", entry."code" AS "entry"
FROM "Vocabulary" copy
JOIN "Vocabulary" entry ON entry."section" = 'cinema' AND entry."list" = copy."list" AND entry."code" <> copy."code"
    AND entry."nameEn" <> '' AND lower(btrim(entry."nameEn")) = lower(btrim(copy."code"))
WHERE copy."section" = 'cinema' AND copy."list" IN ('GENRE', 'COUNTRY', 'LANGUAGE') AND copy."nameEn" = ''
ORDER BY copy."list", copy."code", entry."sortOrder", entry."code";

UPDATE "CinemaTitle" title SET "genres" = fixed.value
FROM (
    SELECT t."id", string_agg(item."name", ', ' ORDER BY item."first") AS value
    FROM "CinemaTitle" t, LATERAL (
        SELECT coalesce(c."entry", btrim(part)) AS "name", min(position) AS "first"
        FROM regexp_split_to_table(t."genres", ',') WITH ORDINALITY AS split(part, position)
        LEFT JOIN "cinema_list_copy" c ON c."list" = 'GENRE' AND c."copy" = btrim(part)
        WHERE btrim(part) <> '' GROUP BY 1
    ) item
    WHERE EXISTS (SELECT 1 FROM regexp_split_to_table(t."genres", ',') part JOIN "cinema_list_copy" c ON c."list" = 'GENRE' AND c."copy" = btrim(part))
    GROUP BY t."id"
) fixed WHERE fixed."id" = title."id";

UPDATE "CinemaTitle" title SET "countries" = fixed.value
FROM (
    SELECT t."id", string_agg(item."name", ', ' ORDER BY item."first") AS value
    FROM "CinemaTitle" t, LATERAL (
        SELECT coalesce(c."entry", btrim(part)) AS "name", min(position) AS "first"
        FROM regexp_split_to_table(t."countries", ',') WITH ORDINALITY AS split(part, position)
        LEFT JOIN "cinema_list_copy" c ON c."list" = 'COUNTRY' AND c."copy" = btrim(part)
        WHERE btrim(part) <> '' GROUP BY 1
    ) item
    WHERE EXISTS (SELECT 1 FROM regexp_split_to_table(t."countries", ',') part JOIN "cinema_list_copy" c ON c."list" = 'COUNTRY' AND c."copy" = btrim(part))
    GROUP BY t."id"
) fixed WHERE fixed."id" = title."id";

UPDATE "CinemaTitle" title SET "languages" = fixed.value
FROM (
    SELECT t."id", string_agg(item."name", ', ' ORDER BY item."first") AS value
    FROM "CinemaTitle" t, LATERAL (
        SELECT coalesce(c."entry", btrim(part)) AS "name", min(position) AS "first"
        FROM regexp_split_to_table(t."languages", ',') WITH ORDINALITY AS split(part, position)
        LEFT JOIN "cinema_list_copy" c ON c."list" = 'LANGUAGE' AND c."copy" = btrim(part)
        WHERE btrim(part) <> '' GROUP BY 1
    ) item
    WHERE EXISTS (SELECT 1 FROM regexp_split_to_table(t."languages", ',') part JOIN "cinema_list_copy" c ON c."list" = 'LANGUAGE' AND c."copy" = btrim(part))
    GROUP BY t."id"
) fixed WHERE fixed."id" = title."id";

DELETE FROM "Vocabulary" v USING "cinema_list_copy" c WHERE v."section" = 'cinema' AND v."list" = c."list" AND v."code" = c."copy";
