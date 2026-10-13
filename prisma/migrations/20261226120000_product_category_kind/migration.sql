-- The shop has two halves: goods that are shipped and products delivered online. A category belongs to one of them.
-- A root category decides; its descendants carry the same value, so a listing can filter on the column alone.
ALTER TABLE "ProductCategory" ADD COLUMN "kind" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_kind_check" CHECK ("kind" IN ('', 'PHYSICAL', 'VIRTUAL'));

-- What is stored already is sorted once: a root whose products (anywhere under it) are all of one kind takes that kind,
-- and so do its descendants. A root that holds both kinds, or none, stays undecided ('') for the staff to settle;
-- nothing is moved and no product changes.
WITH RECURSIVE tree AS (
  SELECT "id", "id" AS root FROM "ProductCategory" WHERE "parentId" IS NULL
  UNION
  SELECT c."id", t.root FROM "ProductCategory" c JOIN tree t ON c."parentId" = t."id"
), agreed AS (
  SELECT t.root, MIN(p."kind") AS kind
  FROM tree t JOIN "Product" p ON p."categoryId" = t."id"
  GROUP BY t.root
  HAVING COUNT(DISTINCT p."kind") = 1 AND MIN(p."kind") IN ('PHYSICAL', 'VIRTUAL')
)
UPDATE "ProductCategory" c SET "kind" = a.kind FROM tree t JOIN agreed a ON a.root = t.root WHERE c."id" = t."id";
