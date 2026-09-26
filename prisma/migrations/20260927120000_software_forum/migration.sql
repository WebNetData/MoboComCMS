-- MoboCom: software downloads and forum.

-- CreateTable
CREATE TABLE "SoftwareTitle" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "developer" TEXT NOT NULL DEFAULT '',
    "license" TEXT NOT NULL DEFAULT 'FREE',
    "platforms" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "requirements" TEXT NOT NULL DEFAULT '',
    "screenshots" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "changelog" TEXT NOT NULL DEFAULT '',
    "access" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftwareTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumCategory" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "access" TEXT NOT NULL DEFAULT 'PUBLIC',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "threadCount" INTEGER NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumThread" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "views" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPostUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoftwareTitle_slug_key" ON "SoftwareTitle"("slug");

-- CreateIndex
CREATE INDEX "SoftwareTitle_status_publishedAt_idx" ON "SoftwareTitle"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumCategory_slug_key" ON "ForumCategory"("slug");

-- CreateIndex
CREATE INDEX "ForumThread_categoryId_status_pinned_lastPostAt_idx" ON "ForumThread"("categoryId", "status", "pinned", "lastPostAt");

-- CreateIndex
CREATE INDEX "ForumThread_userId_idx" ON "ForumThread"("userId");

-- CreateIndex
CREATE INDEX "ForumPost_threadId_status_createdAt_idx" ON "ForumPost"("threadId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_userId_createdAt_idx" ON "ForumPost"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Default forum boards (the table was created empty above).
INSERT INTO "ForumCategory" ("slug", "title", "description", "icon", "access", "locked", "sortOrder", "updatedAt") VALUES
  ('announcements', 'اطلاعیه‌های موبوکام', 'خبرها و اطلاعیه‌های رسمی تیم موبوکام', '📣', 'PUBLIC', true, 0, CURRENT_TIMESTAMP),
  ('general', 'گفت‌وگوی آزاد', 'هر چیزی که دوست دارید دربارهٔ آن حرف بزنید', '💬', 'PUBLIC', false, 10, CURRENT_TIMESTAMP),
  ('help', 'پرسش و پاسخ فنی', 'مشکلات نرم‌افزار، سخت‌افزار و گوشی را اینجا بپرسید', '🛠️', 'PUBLIC', false, 20, CURRENT_TIMESTAMP),
  ('shop', 'فروشگاه و سفارش‌ها', 'پیش از خرید بپرسید و تجربهٔ خریدتان را بگویید', '🛒', 'PUBLIC', false, 30, CURRENT_TIMESTAMP),
  ('entertainment', 'فیلم، موزیک و بازی', 'پیشنهاد، نقد و گفت‌وگو دربارهٔ سرگرمی', '🎬', 'PUBLIC', false, 40, CURRENT_TIMESTAMP),
  ('vip-lounge', 'سالن اعضای ویژه', 'گفت‌وگوی اختصاصی اعضای VIP', '♛', 'MEMBERS', false, 50, CURRENT_TIMESTAMP);

-- MoboCom sells physical and digital products out of the box (an explicit admin choice is kept).
INSERT INTO "Setting" ("key", "value") VALUES ('storeEnabled', 'true') ON CONFLICT ("key") DO NOTHING;

-- Super Admin may apply code packages (extensions.code) like a fresh seed.
UPDATE "Role" SET "permissions" = "permissions" || ',extensions.code' WHERE "name" = 'admin' AND "permissions" NOT LIKE '%extensions.code%';
