CREATE TABLE "PostItemLink" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostItemLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostItemLink_postId_itemType_itemId_key" ON "PostItemLink"("postId", "itemType", "itemId");
CREATE INDEX "PostItemLink_itemType_itemId_position_idx" ON "PostItemLink"("itemType", "itemId", "position");
ALTER TABLE "PostItemLink" ADD CONSTRAINT "PostItemLink_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
