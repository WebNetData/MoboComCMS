-- Data only. A popup's groups are now the site's user groups, named by key; the forum groups it already chose keep their members.
UPDATE "SitePopup" AS p
SET "groupIds" = (SELECT COALESCE(jsonb_agg('forum:' || value)::text, '[]') FROM jsonb_array_elements_text(p."groupIds"::jsonb) AS value)
WHERE p."groupIds" <> '[]' AND p."groupIds" !~ '[a-z]';
