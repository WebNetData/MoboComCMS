-- Additive: a group may own one forum, which makes it a club. Existing groups keep NULL and are unchanged.
ALTER TABLE "ForumGroup" ADD COLUMN "clubCategoryId" INTEGER;
CREATE UNIQUE INDEX "ForumGroup_clubCategoryId_key" ON "ForumGroup"("clubCategoryId");
ALTER TABLE "ForumGroup" ADD CONSTRAINT "ForumGroup_clubCategoryId_fkey" FOREIGN KEY ("clubCategoryId") REFERENCES "ForumCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
