-- Additive: members who moderate one forum and everything under it. No existing row changes; until someone
-- is assigned, moderation works exactly as before (staff and moderator groups, everywhere).
CREATE TABLE "ForumCategoryModerator" (
  "id" SERIAL NOT NULL,
  "categoryId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumCategoryModerator_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ForumCategoryModerator_categoryId_userId_key" ON "ForumCategoryModerator"("categoryId", "userId");
CREATE INDEX "ForumCategoryModerator_userId_idx" ON "ForumCategoryModerator"("userId");
ALTER TABLE "ForumCategoryModerator" ADD CONSTRAINT "ForumCategoryModerator_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumCategoryModerator" ADD CONSTRAINT "ForumCategoryModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
