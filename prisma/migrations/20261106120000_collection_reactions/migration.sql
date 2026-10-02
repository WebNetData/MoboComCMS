CREATE TABLE "UserCollectionReaction" (
  "collectionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionReaction_pkey" PRIMARY KEY ("collectionId", "userId"),
  CONSTRAINT "UserCollectionReaction_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCollectionReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserCollectionReaction_userId_idx" ON "UserCollectionReaction"("userId");
