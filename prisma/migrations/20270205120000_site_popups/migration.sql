-- Announcement popups and how often each member has seen one. Additive.
CREATE TABLE "SitePopup" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'NOTICE',
  "design" TEXT NOT NULL DEFAULT 'seal',
  "effect" TEXT NOT NULL DEFAULT 'rise',
  "position" TEXT NOT NULL DEFAULT 'center',
  "image" TEXT NOT NULL DEFAULT '',
  "actionLabel" TEXT NOT NULL DEFAULT '',
  "actionUrl" TEXT NOT NULL DEFAULT '',
  "closeLabel" TEXT NOT NULL DEFAULT '',
  "mustConfirm" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "groupIds" TEXT NOT NULL DEFAULT '[]',
  "sections" TEXT NOT NULL DEFAULT '[]',
  "repeatHours" INTEGER NOT NULL DEFAULT 24,
  "maxViews" INTEGER NOT NULL DEFAULT 0,
  "delaySeconds" INTEGER NOT NULL DEFAULT 2,
  "pages" TEXT NOT NULL DEFAULT '',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "guestViews" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SitePopup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SitePopup_status_idx" ON "SitePopup"("status");

CREATE TABLE "SitePopupSeen" (
  "id" SERIAL NOT NULL,
  "popupId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 1,
  "clicked" BOOLEAN NOT NULL DEFAULT false,
  "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SitePopupSeen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SitePopupSeen_popupId_userId_key" ON "SitePopupSeen"("popupId", "userId");
CREATE INDEX "SitePopupSeen_userId_idx" ON "SitePopupSeen"("userId");
ALTER TABLE "SitePopupSeen" ADD CONSTRAINT "SitePopupSeen_popupId_fkey" FOREIGN KEY ("popupId") REFERENCES "SitePopup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePopupSeen" ADD CONSTRAINT "SitePopupSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
