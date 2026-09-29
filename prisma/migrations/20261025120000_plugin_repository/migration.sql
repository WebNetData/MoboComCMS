-- CreateTable
CREATE TABLE "RepoProduct" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PLUGIN',
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "siteLimit" INTEGER NOT NULL DEFAULT 1,
    "supportDays" INTEGER NOT NULL DEFAULT 365,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoRelease" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "requiresCore" TEXT NOT NULL DEFAULT '',
    "runtime" TEXT NOT NULL DEFAULT 'declarative',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoLicense" (
    "id" SERIAL NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "userId" INTEGER,
    "email" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'PURCHASE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "siteLimit" INTEGER NOT NULL DEFAULT 1,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatesUntil" TIMESTAMP(3),

    CONSTRAINT "RepoLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoActivation" (
    "id" SERIAL NOT NULL,
    "licenseId" INTEGER NOT NULL,
    "site" TEXT NOT NULL,
    "coreVersion" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ipHash" TEXT NOT NULL DEFAULT '',
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepoProduct_slug_key" ON "RepoProduct"("slug");

-- CreateIndex
CREATE INDEX "RepoProduct_active_kind_idx" ON "RepoProduct"("active", "kind");

-- CreateIndex
CREATE INDEX "RepoRelease_productId_createdAt_idx" ON "RepoRelease"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepoRelease_productId_version_key" ON "RepoRelease"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RepoLicense_keyHash_key" ON "RepoLicense"("keyHash");

-- CreateIndex
CREATE INDEX "RepoLicense_productId_status_idx" ON "RepoLicense"("productId", "status");

-- CreateIndex
CREATE INDEX "RepoLicense_userId_idx" ON "RepoLicense"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoActivation_licenseId_site_key" ON "RepoActivation"("licenseId", "site");

-- AddForeignKey
ALTER TABLE "RepoRelease" ADD CONSTRAINT "RepoRelease_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RepoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoLicense" ADD CONSTRAINT "RepoLicense_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RepoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoActivation" ADD CONSTRAINT "RepoActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "RepoLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

