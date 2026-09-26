CREATE TABLE "TicketDepartment" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "nameFa" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "descriptionFa" TEXT NOT NULL DEFAULT '',
  "descriptionEn" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "requiresSubscription" BOOLEAN NOT NULL DEFAULT false,
  "requiresProduct" BOOLEAN NOT NULL DEFAULT false,
  "fields" TEXT NOT NULL DEFAULT '[]',
  "roleIds" TEXT NOT NULL DEFAULT '[]',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketDepartment_slug_key" ON "TicketDepartment"("slug");
ALTER TABLE "Ticket" ADD COLUMN "customFields" TEXT NOT NULL DEFAULT '{}';
UPDATE "Role" SET "permissions" = CASE WHEN "permissions" = '' THEN 'tickets.departments.manage' ELSE "permissions" || ',tickets.departments.manage' END
WHERE "name" = 'admin' AND "permissions" NOT LIKE '%tickets.departments.manage%';
INSERT INTO "TicketDepartment" ("slug","nameFa","nameEn","descriptionFa","descriptionEn","requiresSubscription","requiresProduct","sortOrder") VALUES
('GENERAL','پشتیبانی عمومی','General support','سؤالات عمومی','General questions',false,false,30),
('SALES','فروش و پیش از خرید','Sales & pre-purchase','راهنمای خرید','Questions before purchase',false,false,10),
('SUBSCRIPTION','پشتیبانی اشتراک','Subscription support','پشتیبانی اشتراک فعال','Help with an active subscription',true,false,20),
('PRODUCT','پشتیبانی محصول','Product support','پشتیبانی محصول خریداری‌شده','Help with a purchased product',false,true,25);
-- Preserve existing support staff access until the owner configures each team.
UPDATE "TicketDepartment" SET "roleIds" = COALESCE((SELECT json_agg("id")::text FROM "Role" WHERE "permissions" LIKE '%tickets.handle%'), '[]');
