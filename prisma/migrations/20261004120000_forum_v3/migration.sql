-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN     "reviewReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "wiki" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ForumThread" ADD COLUMN     "closeAt" TIMESTAMP(3),
ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ForumPoll" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'poll',
    "title" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'regular',
    "options" TEXT NOT NULL DEFAULT '[]',
    "minChoices" INTEGER NOT NULL DEFAULT 1,
    "maxChoices" INTEGER NOT NULL DEFAULT 1,
    "results" TEXT NOT NULL DEFAULT 'on_vote',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "voterCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPollVote" (
    "pollId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPollVote_pkey" PRIMARY KEY ("pollId","userId","optionId")
);

-- CreateTable
CREATE TABLE "ForumCategoryUser" (
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "ForumCategoryUser_pkey" PRIMARY KEY ("userId","categoryId")
);

-- CreateTable
CREATE TABLE "ForumConversation" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPostUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumConversationUser" (
    "conversationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastRead" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "left" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumConversationUser_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ForumMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumPoll_postId_name_key" ON "ForumPoll"("postId", "name");

-- CreateIndex
CREATE INDEX "ForumPollVote_userId_idx" ON "ForumPollVote"("userId");

-- CreateIndex
CREATE INDEX "ForumCategoryUser_categoryId_level_idx" ON "ForumCategoryUser"("categoryId", "level");

-- CreateIndex
CREATE INDEX "ForumConversation_lastPostAt_idx" ON "ForumConversation"("lastPostAt");

-- CreateIndex
CREATE INDEX "ForumConversationUser_userId_archived_idx" ON "ForumConversationUser"("userId", "archived");

-- CreateIndex
CREATE INDEX "ForumMessage_userId_createdAt_idx" ON "ForumMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumMessage_conversationId_number_key" ON "ForumMessage"("conversationId", "number");

-- AddForeignKey
ALTER TABLE "ForumPoll" ADD CONSTRAINT "ForumPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPollVote" ADD CONSTRAINT "ForumPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPollVote" ADD CONSTRAINT "ForumPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCategoryUser" ADD CONSTRAINT "ForumCategoryUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCategoryUser" ADD CONSTRAINT "ForumCategoryUser_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumConversationUser" ADD CONSTRAINT "ForumConversationUser_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ForumConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumConversationUser" ADD CONSTRAINT "ForumConversationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMessage" ADD CONSTRAINT "ForumMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ForumConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMessage" ADD CONSTRAINT "ForumMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

