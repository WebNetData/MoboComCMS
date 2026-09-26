CREATE TABLE "PostComment" (
  "id" SERIAL NOT NULL,
  "postId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "parentId" INTEGER,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostComment_postId_status_createdAt_idx" ON "PostComment"("postId", "status", "createdAt");
CREATE INDEX "PostComment_parentId_idx" ON "PostComment"("parentId");
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
