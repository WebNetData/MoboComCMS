CREATE TABLE "UserCollection" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCollection_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'UNLISTED', 'PUBLIC', 'EDITORIAL'))
);
CREATE INDEX "UserCollection_ownerId_updatedAt_idx" ON "UserCollection"("ownerId", "updatedAt");
CREATE INDEX "UserCollection_visibility_updatedAt_idx" ON "UserCollection"("visibility", "updatedAt");

CREATE TABLE "UserCollectionItem" (
  "id" SERIAL NOT NULL,
  "collectionId" INTEGER NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserCollectionItem_collectionId_itemType_itemId_key" ON "UserCollectionItem"("collectionId", "itemType", "itemId");
CREATE UNIQUE INDEX "UserCollectionItem_collectionId_position_key" ON "UserCollectionItem"("collectionId", "position");

CREATE TABLE "UserCollectionCollaborator" (
  "collectionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionCollaborator_pkey" PRIMARY KEY ("collectionId", "userId"),
  CONSTRAINT "UserCollectionCollaborator_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCollectionCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserCollectionCollaborator_userId_idx" ON "UserCollectionCollaborator"("userId");

CREATE TABLE "UserCollectionFollow" (
  "collectionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionFollow_pkey" PRIMARY KEY ("collectionId", "userId"),
  CONSTRAINT "UserCollectionFollow_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCollectionFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserCollectionFollow_userId_idx" ON "UserCollectionFollow"("userId");
