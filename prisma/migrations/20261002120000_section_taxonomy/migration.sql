-- CreateTable
CREATE TABLE "TaxonomyTerm" (
    "id" SERIAL NOT NULL,
    "taxonomy" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "inMenu" BOOLEAN NOT NULL DEFAULT true,
    "count" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxonomyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyAssignment" (
    "termId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "taxonomy" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaxonomyAssignment_pkey" PRIMARY KEY ("termId","ownerId")
);

-- CreateIndex
CREATE INDEX "TaxonomyTerm_taxonomy_parentId_sortOrder_idx" ON "TaxonomyTerm"("taxonomy", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyTerm_taxonomy_slug_key" ON "TaxonomyTerm"("taxonomy", "slug");

-- CreateIndex
CREATE INDEX "TaxonomyAssignment_taxonomy_ownerId_idx" ON "TaxonomyAssignment"("taxonomy", "ownerId");

-- AddForeignKey
ALTER TABLE "TaxonomyTerm" ADD CONSTRAINT "TaxonomyTerm_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaxonomyTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyAssignment" ADD CONSTRAINT "TaxonomyAssignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "TaxonomyTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

