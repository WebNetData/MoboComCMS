-- User groups of the whole site, their prices, and which groups may see an item. Additive: every stored item stays public.
CREATE TABLE "UserGroup" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#4b45ee',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "vipBenefits" BOOLEAN NOT NULL DEFAULT false,
  "hideAds" BOOLEAN NOT NULL DEFAULT false,
  "discountPercent" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserGroup_discount_range" CHECK ("discountPercent" BETWEEN 0 AND 90)
);
CREATE TABLE "UserGroupMember" (
  "id" SERIAL NOT NULL,
  "groupId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "note" TEXT NOT NULL DEFAULT '',
  "addedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserGroupMember_groupId_userId_key" ON "UserGroupMember"("groupId", "userId");
CREATE INDEX "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ProductGroupPrice" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "variantId" INTEGER NOT NULL DEFAULT 0,
  "groupId" INTEGER NOT NULL,
  "priceMinor" BIGINT NOT NULL,
  CONSTRAINT "ProductGroupPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductGroupPrice_positive" CHECK ("priceMinor" > 0)
);
CREATE UNIQUE INDEX "ProductGroupPrice_productId_variantId_groupId_key" ON "ProductGroupPrice"("productId", "variantId", "groupId");
CREATE INDEX "ProductGroupPrice_groupId_idx" ON "ProductGroupPrice"("groupId");
ALTER TABLE "ProductGroupPrice" ADD CONSTRAINT "ProductGroupPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductGroupPrice" ADD CONSTRAINT "ProductGroupPrice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CinemaTitle" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GameTitle" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareTitle" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MusicTrack" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MusicAlbum" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PromptTemplate" ADD COLUMN "audienceGroups" TEXT NOT NULL DEFAULT '';
