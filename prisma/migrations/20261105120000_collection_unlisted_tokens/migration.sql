ALTER TABLE "UserCollection" ADD COLUMN "shareToken" TEXT;
UPDATE "UserCollection" SET "shareToken" = gen_random_uuid()::text WHERE "visibility" = 'UNLISTED';
CREATE UNIQUE INDEX "UserCollection_shareToken_key" ON "UserCollection"("shareToken");
