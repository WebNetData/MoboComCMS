-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'BOT',
    "assignedTo" INTEGER,
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "botReplies" INTEGER NOT NULL DEFAULT 0,
    "unreadForAgent" INTEGER NOT NULL DEFAULT 0,
    "unreadForVisitor" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "agentId" INTEGER,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTag" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_token_key" ON "ChatConversation"("token");

-- CreateIndex
CREATE INDEX "ChatConversation_status_lastMessageAt_idx" ON "ChatConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_idx" ON "ChatConversation"("userId");

-- CreateIndex
CREATE INDEX "ChatConversation_assignedTo_status_idx" ON "ChatConversation"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_id_idx" ON "ChatMessage"("conversationId", "id");

-- CreateIndex
CREATE INDEX "CrmTag_tag_idx" ON "CrmTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTag_userId_tag_key" ON "CrmTag"("userId", "tag");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

