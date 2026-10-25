-- An author's proposed change to a published article, waiting for the magazine manager (additive; no rows are made).
CREATE TABLE "PostEditProposal" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "changes" TEXT NOT NULL,
    "baseUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostEditProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostEditProposal_postId_key" ON "PostEditProposal"("postId");
ALTER TABLE "PostEditProposal" ADD CONSTRAINT "PostEditProposal_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
