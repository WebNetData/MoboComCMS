-- AlterTable
ALTER TABLE "ForumCategory" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#6366f1',
ADD COLUMN     "parentId" INTEGER;

-- AlterTable
ALTER TABLE "ForumThread" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "solvedPostId" INTEGER;

-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replyToId" INTEGER;

-- CreateTable
CREATE TABLE "ForumProfile" (
    "userId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "primaryGroupId" INTEGER,
    "trustLevel" INTEGER NOT NULL DEFAULT 0,
    "trustLocked" BOOLEAN NOT NULL DEFAULT false,
    "topicCount" INTEGER NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "likesGiven" INTEGER NOT NULL DEFAULT 0,
    "likesReceived" INTEGER NOT NULL DEFAULT 0,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "topicsEntered" INTEGER NOT NULL DEFAULT 0,
    "daysVisited" INTEGER NOT NULL DEFAULT 0,
    "lastVisitDay" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3),
    "silencedUntil" TIMESTAMP(3),
    "suspendedUntil" TIMESTAMP(3),
    "moderationNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ForumGroup" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "title" TEXT NOT NULL DEFAULT '',
    "automatic" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "joinMode" TEXT NOT NULL DEFAULT 'CLOSED',
    "moderator" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumGroupMember" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumCategoryPermission" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'CREATE',

    CONSTRAINT "ForumCategoryPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "topicCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumThreadTag" (
    "threadId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ForumThreadTag_pkey" PRIMARY KEY ("threadId","tagId")
);

-- CreateTable
CREATE TABLE "ForumReaction" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT 'heart',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumBookmark" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumFlag" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'OTHER',
    "note" TEXT NOT NULL DEFAULT '',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "handledBy" INTEGER,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPostRevision" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumTopicUser" (
    "userId" INTEGER NOT NULL,
    "threadId" INTEGER NOT NULL,
    "lastRead" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT 'NORMAL',
    "firstVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumTopicUser_pkey" PRIMARY KEY ("userId","threadId")
);

-- CreateTable
CREATE TABLE "ForumBadge" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '🏅',
    "tier" TEXT NOT NULL DEFAULT 'BRONZE',
    "rule" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "grantCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumUserBadge" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "badgeId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "grantedBy" INTEGER,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumUserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumProfile_username_key" ON "ForumProfile"("username");

-- CreateIndex
CREATE INDEX "ForumProfile_trustLevel_idx" ON "ForumProfile"("trustLevel");

-- CreateIndex
CREATE INDEX "ForumProfile_postCount_idx" ON "ForumProfile"("postCount");

-- CreateIndex
CREATE UNIQUE INDEX "ForumGroup_slug_key" ON "ForumGroup"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ForumGroup_automatic_key" ON "ForumGroup"("automatic");

-- CreateIndex
CREATE INDEX "ForumGroupMember_userId_status_idx" ON "ForumGroupMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ForumGroupMember_groupId_userId_key" ON "ForumGroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumCategoryPermission_categoryId_groupId_key" ON "ForumCategoryPermission"("categoryId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumTag_name_key" ON "ForumTag"("name");

-- CreateIndex
CREATE INDEX "ForumThreadTag_tagId_idx" ON "ForumThreadTag"("tagId");

-- CreateIndex
CREATE INDEX "ForumReaction_userId_createdAt_idx" ON "ForumReaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReaction_postId_userId_emoji_key" ON "ForumReaction"("postId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "ForumBookmark_userId_postId_key" ON "ForumBookmark"("userId", "postId");

-- CreateIndex
CREATE INDEX "ForumFlag_status_createdAt_idx" ON "ForumFlag"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumFlag_postId_userId_key" ON "ForumFlag"("postId", "userId");

-- CreateIndex
CREATE INDEX "ForumPostRevision_postId_createdAt_idx" ON "ForumPostRevision"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumTopicUser_threadId_level_idx" ON "ForumTopicUser"("threadId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ForumBadge_slug_key" ON "ForumBadge"("slug");

-- CreateIndex
CREATE INDEX "ForumUserBadge_badgeId_grantedAt_idx" ON "ForumUserBadge"("badgeId", "grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumUserBadge_userId_badgeId_key" ON "ForumUserBadge"("userId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumThread_solvedPostId_key" ON "ForumThread"("solvedPostId");

-- CreateIndex
CREATE INDEX "ForumThread_status_lastPostAt_idx" ON "ForumThread"("status", "lastPostAt");

-- CreateIndex
CREATE INDEX "ForumPost_threadId_postNumber_idx" ON "ForumPost"("threadId", "postNumber");

-- AddForeignKey
ALTER TABLE "ForumCategory" ADD CONSTRAINT "ForumCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ForumCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_solvedPostId_fkey" FOREIGN KEY ("solvedPostId") REFERENCES "ForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumProfile" ADD CONSTRAINT "ForumProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumGroupMember" ADD CONSTRAINT "ForumGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ForumGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumGroupMember" ADD CONSTRAINT "ForumGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCategoryPermission" ADD CONSTRAINT "ForumCategoryPermission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCategoryPermission" ADD CONSTRAINT "ForumCategoryPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ForumGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThreadTag" ADD CONSTRAINT "ForumThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThreadTag" ADD CONSTRAINT "ForumThreadTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ForumTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReaction" ADD CONSTRAINT "ForumReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReaction" ADD CONSTRAINT "ForumReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumBookmark" ADD CONSTRAINT "ForumBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumBookmark" ADD CONSTRAINT "ForumBookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumFlag" ADD CONSTRAINT "ForumFlag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumFlag" ADD CONSTRAINT "ForumFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPostRevision" ADD CONSTRAINT "ForumPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumTopicUser" ADD CONSTRAINT "ForumTopicUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumTopicUser" ADD CONSTRAINT "ForumTopicUser_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumUserBadge" ADD CONSTRAINT "ForumUserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumUserBadge" ADD CONSTRAINT "ForumUserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "ForumBadge"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Number existing posts per topic (1 = the opening post) and backfill topic counters.
UPDATE "ForumPost" AS p SET "postNumber" = numbered.n
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "threadId" ORDER BY "createdAt", "id") AS n FROM "ForumPost") AS numbered
WHERE p."id" = numbered."id";

UPDATE "ForumThread" AS t SET "postCount" = COALESCE((SELECT MAX(p."postNumber") FROM "ForumPost" p WHERE p."threadId" = t."id"), 0);

-- Automatic groups used by category permissions.
INSERT INTO "ForumGroup" ("slug", "name", "description", "icon", "color", "automatic", "visibility", "joinMode", "moderator", "updatedAt") VALUES
  ('everyone', 'همه', 'همهٔ بازدیدکنندگان، حتی مهمان‌ها', '🌐', '#64748b', 'everyone', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('vip', 'اعضای ویژه', 'کاربران با اشتراک فعال VIP', '♛', '#d97706', 'vip', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('staff', 'تیم موبوکام', 'مدیران و ناظران تالار', '🛡', '#0f766e', 'staff', 'PUBLIC', 'CLOSED', true, CURRENT_TIMESTAMP),
  ('trust_level_0', 'سطح اعتماد ۰', 'کاربران تازه‌وارد', '🌱', '#94a3b8', 'trust_level_0', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('trust_level_1', 'سطح اعتماد ۱', 'کاربران پایه', '🌿', '#22c55e', 'trust_level_1', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('trust_level_2', 'سطح اعتماد ۲', 'اعضای فعال', '🌳', '#0ea5e9', 'trust_level_2', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('trust_level_3', 'سطح اعتماد ۳', 'کاربران همیشگی', '⭐', '#8b5cf6', 'trust_level_3', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP),
  ('trust_level_4', 'سطح اعتماد ۴', 'رهبران جامعه', '👑', '#e11d48', 'trust_level_4', 'PUBLIC', 'CLOSED', false, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Default badges (rules are evaluated by the forum service).
INSERT INTO "ForumBadge" ("slug", "name", "description", "icon", "tier", "rule") VALUES
  ('first-topic', 'اولین موضوع', 'اولین موضوع خود را در تالار ساخت', '✍️', 'BRONZE', 'first_topic'),
  ('first-reply', 'اولین پاسخ', 'به یک موضوع پاسخ داد', '💬', 'BRONZE', 'first_reply'),
  ('first-like', 'قدردان', 'اولین پسند خود را داد', '❤️', 'BRONZE', 'first_like'),
  ('welcome', 'خوش‌آمد', 'اولین پسند را دریافت کرد', '👋', 'BRONZE', 'first_like_received'),
  ('autobiographer', 'خودنوشت', 'پروفایل خود را با تصویر و معرفی کامل کرد', '🪪', 'BRONZE', 'autobiographer'),
  ('nice-post', 'پیام خوب', 'پیامی با ۱۰ پسند', '👍', 'BRONZE', 'nice_post'),
  ('good-post', 'پیام عالی', 'پیامی با ۲۵ پسند', '🔥', 'SILVER', 'good_post'),
  ('great-post', 'پیام درخشان', 'پیامی با ۵۰ پسند', '🌟', 'GOLD', 'great_post'),
  ('solved', 'گره‌گشا', 'پاسخش به‌عنوان راه‌حل انتخاب شد', '✅', 'BRONZE', 'first_solution'),
  ('solver', 'حلّال مشکلات', '۱۰ پاسخ او راه‌حل انتخاب شد', '🧠', 'SILVER', 'solver'),
  ('basic', 'کاربر پایه', 'به سطح اعتماد ۱ رسید', '🌿', 'BRONZE', 'trust_level_1'),
  ('member', 'عضو فعال', 'به سطح اعتماد ۲ رسید', '🌳', 'BRONZE', 'trust_level_2'),
  ('regular', 'کاربر همیشگی', 'به سطح اعتماد ۳ رسید', '⭐', 'SILVER', 'trust_level_3'),
  ('leader', 'رهبر جامعه', 'به سطح اعتماد ۴ رسید', '👑', 'GOLD', 'trust_level_4'),
  ('anniversary', 'یک‌ساله', 'یک سال عضو فعال تالار بود', '🎂', 'SILVER', 'anniversary')
ON CONFLICT ("slug") DO NOTHING;
