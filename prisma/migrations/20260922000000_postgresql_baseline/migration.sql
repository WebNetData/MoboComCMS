-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "roleId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "avatarColor" TEXT NOT NULL DEFAULT '#4b45ee',
    "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "telegramId" TEXT,
    "telegramUsername" TEXT NOT NULL DEFAULT '',
    "telegramName" TEXT NOT NULL DEFAULT '',
    "telegramPhoto" TEXT NOT NULL DEFAULT '',
    "telegramLinkedAt" TIMESTAMP(3),
    "subscriptionAlerts" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL DEFAULT '',
    "nameEn" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT '',
    "inbounds" TEXT NOT NULL DEFAULT '',
    "internalSquads" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "trafficGB" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL DEFAULT 2,
    "price" DOUBLE PRECISION NOT NULL,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "panelId" INTEGER,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" INTEGER,
    "productId" INTEGER,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'plisio',
    "providerTxnId" TEXT NOT NULL DEFAULT '',
    "paymentUrl" TEXT NOT NULL DEFAULT '',
    "paidCrypto" TEXT NOT NULL DEFAULT '',
    "paidAmount" TEXT NOT NULL DEFAULT '',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayId" INTEGER,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "panelId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "username" TEXT NOT NULL,
    "email" TEXT,
    "trafficLimit" INTEGER NOT NULL DEFAULT 0,
    "trafficUsed" INTEGER NOT NULL DEFAULT 0,
    "deviceLimit" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "subToken" TEXT NOT NULL,
    "panelSubUrl" TEXT NOT NULL DEFAULT '',
    "configLinks" TEXT NOT NULL DEFAULT '[]',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resellerId" INTEGER,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reseller" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priceMode" TEXT NOT NULL DEFAULT 'DISCOUNT',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxAccounts" INTEGER NOT NULL DEFAULT 0,
    "maxActiveAccounts" INTEGER NOT NULL DEFAULT 0,
    "trafficQuotaGB" INTEGER NOT NULL DEFAULT 0,
    "maxTrafficPerAccountGB" INTEGER NOT NULL DEFAULT 0,
    "allowUnlimitedTraffic" BOOLEAN NOT NULL DEFAULT false,
    "maxDaysPerAccount" INTEGER NOT NULL DEFAULT 0,
    "allowUnlimitedDays" BOOLEAN NOT NULL DEFAULT false,
    "maxDevicesPerAccount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerPrice" (
    "id" SERIAL NOT NULL,
    "resellerId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ResellerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "subscriptionId" INTEGER,
    "device" TEXT,
    "issueType" TEXT,
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'plisio',
    "payload" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "contentEn" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "showInNav" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostCategory" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" INTEGER,

    CONSTRAINT "PostCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "excerptEn" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "contentEn" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "authorId" INTEGER,
    "categoryId" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostCategoryAssignment" (
    "postId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "PostCategoryAssignment_pkey" PRIMARY KEY ("postId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "image" TEXT NOT NULL DEFAULT '',
    "stock" INTEGER NOT NULL DEFAULT -1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gateway" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PLISIO',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "secretKey" TEXT NOT NULL DEFAULT '',
    "fiat" TEXT NOT NULL DEFAULT 'USD',
    "currencies" TEXT NOT NULL DEFAULT '',
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeBps" INTEGER NOT NULL DEFAULT 0,
    "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "instructions" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "planId" INTEGER,
    "productId" INTEGER,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "walletApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walletAppliedMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "gatewayId" INTEGER,
    "providerTxnId" TEXT NOT NULL DEFAULT '',
    "paymentUrl" TEXT NOT NULL DEFAULT '',
    "paidCrypto" TEXT NOT NULL DEFAULT '',
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'BILLING',
    "createdBy" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "orderId" INTEGER,
    "invoiceId" INTEGER,
    "gatewayId" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'PLISIO',
    "providerTxnId" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "cryptoCurrency" TEXT NOT NULL DEFAULT '',
    "cryptoAmount" TEXT NOT NULL DEFAULT '',
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "eventKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "raw" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTx" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfterMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TOPUP',
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "description" TEXT NOT NULL DEFAULT '',
    "orderId" INTEGER,
    "invoiceId" INTEGER,
    "adminId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "prefix" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SERVER',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentJob" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "orderId" INTEGER,
    "invoiceId" INTEGER,
    "subscriptionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "finite" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapLocation" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL,
    "countryFa" TEXT NOT NULL DEFAULT '',
    "flag" TEXT NOT NULL DEFAULT '🏳️',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteForm" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fields" TEXT NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "successText" TEXT NOT NULL DEFAULT 'پیام شما با موفقیت ثبت شد.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionReminder" (
    "id" TEXT NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "retryAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceIncident" (
    "id" SERIAL NOT NULL,
    "panelId" INTEGER,
    "titleFa" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "messageFa" TEXT NOT NULL,
    "messageEn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subToken_key" ON "Subscription"("subToken");

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_userId_key" ON "Reseller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerPrice_resellerId_planId_key" ON "ResellerPrice"("resellerId", "planId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PostCategory_slug_key" ON "PostCategory"("slug");

-- CreateIndex
CREATE INDEX "PostCategory_parentId_idx" ON "PostCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "PostCategoryAssignment_categoryId_idx" ON "PostCategoryAssignment"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_eventKey_key" ON "Payment"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTx_idempotencyKey_key" ON "WalletTx"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_token_key" ON "ApiKey"("token");

-- CreateIndex
CREATE INDEX "WalletAccount_currency_idx" ON "WalletAccount"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_currency_key" ON "WalletAccount"("userId", "currency");

-- CreateIndex
CREATE INDEX "WebhookInbox_status_lockedAt_idx" ON "WebhookInbox"("status", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_provider_eventKey_key" ON "WebhookInbox"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentJob_dedupeKey_key" ON "FulfillmentJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "FulfillmentJob_status_availableAt_idx" ON "FulfillmentJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "FulfillmentJob_orderId_idx" ON "FulfillmentJob"("orderId");

-- CreateIndex
CREATE INDEX "FulfillmentJob_invoiceId_idx" ON "FulfillmentJob"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderId_key" ON "InventoryReservation"("orderId");

-- CreateIndex
CREATE INDEX "InventoryReservation_productId_status_idx" ON "InventoryReservation"("productId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_status_idx" ON "InventoryReservation"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteForm_slug_key" ON "SiteForm"("slug");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_createdAt_idx" ON "FormSubmission"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionReminder_status_retryAt_idx" ON "SubscriptionReminder"("status", "retryAt");

-- CreateIndex
CREATE INDEX "SubscriptionReminder_subscriptionId_idx" ON "SubscriptionReminder"("subscriptionId");

-- CreateIndex
CREATE INDEX "ServiceIncident_panelId_status_idx" ON "ServiceIncident"("panelId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerPrice" ADD CONSTRAINT "ResellerPrice_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerPrice" ADD CONSTRAINT "ResellerPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCategory" ADD CONSTRAINT "PostCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostCategory"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PostCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCategoryAssignment" ADD CONSTRAINT "PostCategoryAssignment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCategoryAssignment" ADD CONSTRAINT "PostCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PostCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "SiteForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
