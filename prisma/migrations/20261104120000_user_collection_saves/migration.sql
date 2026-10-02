CREATE TABLE "UserCollectionSave" (
  "collectionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionSave_pkey" PRIMARY KEY ("collectionId", "userId"),
  CONSTRAINT "UserCollectionSave_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCollectionSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserCollectionSave_userId_createdAt_idx" ON "UserCollectionSave"("userId", "createdAt");
