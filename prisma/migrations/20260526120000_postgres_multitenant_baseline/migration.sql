-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_licenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "province" TEXT,
    "landlinePhone" TEXT,
    "mobilePhone" TEXT,
    "fullName" TEXT,
    "externalCode" TEXT,
    "dni" TEXT,
    "gender" TEXT,
    "registrationDate" TIMESTAMP(3),
    "esthetician" TEXT,
    "clientBrand" TEXT,
    "appliedTariff" TEXT,
    "text9A" TEXT,
    "text9B" TEXT,
    "text15" TEXT,
    "text25" TEXT,
    "text100" TEXT,
    "integer1" INTEGER,
    "integer2" INTEGER,
    "gifts" TEXT,
    "birthDay" INTEGER,
    "birthMonthNumber" INTEGER,
    "birthMonthName" TEXT,
    "birthYear" INTEGER,
    "lastVisit" TIMESTAMP(3),
    "serviceCount" INTEGER,
    "activeTreatmentCount" INTEGER,
    "activeTreatmentNames" TEXT,
    "bondCount" INTEGER,
    "giftVoucher" TEXT,
    "billedAmount" DECIMAL(65,30),
    "pendingAmount" DECIMAL(65,30),
    "debtAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "linkedClientReference" TEXT,
    "relationshipType" TEXT,
    "linkedClientId" TEXT,
    "discountProfile" TEXT,
    "webKey" TEXT,
    "notes" TEXT,
    "allergies" TEXT,
    "photoUrl" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cancelledAppointmentCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountBalance" DECIMAL(65,30),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "client_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(65,30) NOT NULL,
    "duration" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "serviceCode" TEXT,
    "taxRate" DECIMAL(65,30),
    "requiresProduct" BOOLEAN,
    "commission" TEXT,
    "promo" TEXT,
    "legacyRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cabin" TEXT NOT NULL DEFAULT 'LUCY',
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "reminder" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "googleCalendarSyncError" TEXT,
    "googleCalendarSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("tenantId","appointmentId","serviceId")
);

-- CreateTable
CREATE TABLE "appointment_legends" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_legends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_blocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "professional" TEXT NOT NULL,
    "calendarInviteEmail" TEXT,
    "cabin" TEXT NOT NULL DEFAULT 'LUCY',
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "googleCalendarSyncError" TEXT,
    "googleCalendarSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_day_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "dayKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_day_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "text" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "price" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 5,
    "maxStock" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT,
    "appointmentId" TEXT,
    "userId" TEXT NOT NULL,
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "saleNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentBreakdown" TEXT,
    "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "saleId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "settledPaymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_payment_collections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "pendingPaymentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true,
    "operationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_payment_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingBalance" DECIMAL(65,30) NOT NULL,
    "openingDenominations" TEXT,
    "closingBalance" DECIMAL(65,30),
    "expectedBalance" DECIMAL(65,30),
    "difference" DECIMAL(65,30),
    "countedTotal" DECIMAL(65,30),
    "countedDenominations" TEXT,
    "arqueoDifference" DECIMAL(65,30),
    "nextDayFloat" DECIMAL(65,30),
    "nextDayFloatDenominations" TEXT,
    "withdrawalAmount" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_counts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expectedTotal" DECIMAL(65,30) NOT NULL,
    "countedTotal" DECIMAL(65,30) NOT NULL,
    "difference" DECIMAL(65,30) NOT NULL,
    "denominations" TEXT NOT NULL,
    "isBlind" BOOLEAN NOT NULL DEFAULT false,
    "appliedAsClose" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balance_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "operationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "referenceItem" TEXT,
    "legacyRef" TEXT,
    "importSource" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_balance_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "refreshToken" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendClientInvites" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bono_packs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "bonoTemplateId" TEXT,
    "legacyRef" TEXT,
    "importSource" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bono_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bono_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "bonoPackId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "consumedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "notes" TEXT,

    CONSTRAINT "bono_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "quoteNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_licenses_tenantId_key" ON "tenant_licenses"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_licenses_status_trialEndsAt_idx" ON "tenant_licenses"("status", "trialEndsAt");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_tenantId_key" ON "users"("id", "tenantId");

-- CreateIndex
CREATE INDEX "clients_tenantId_isActive_createdAt_idx" ON "clients"("tenantId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "clients_tenantId_lastVisit_idx" ON "clients"("tenantId", "lastVisit");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenantId_email_key" ON "clients"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_id_tenantId_key" ON "clients"("id", "tenantId");

-- CreateIndex
CREATE INDEX "client_history_tenantId_clientId_date_idx" ON "client_history"("tenantId", "clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "client_history_id_tenantId_key" ON "client_history"("id", "tenantId");

-- CreateIndex
CREATE INDEX "services_tenantId_category_isActive_idx" ON "services"("tenantId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "services_id_tenantId_key" ON "services"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_googleCalendarEventId_key" ON "appointments"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "appointments_tenantId_date_startTime_idx" ON "appointments"("tenantId", "date", "startTime");

-- CreateIndex
CREATE INDEX "appointments_tenantId_status_date_idx" ON "appointments"("tenantId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_tenantId_key" ON "appointments"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenantId_googleCalendarEventId_key" ON "appointments"("tenantId", "googleCalendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_services_tenantId_appointmentId_sortOrder_key" ON "appointment_services"("tenantId", "appointmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "appointment_legends_tenantId_sortOrder_idx" ON "appointment_legends"("tenantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_legends_id_tenantId_key" ON "appointment_legends"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_blocks_googleCalendarEventId_key" ON "agenda_blocks"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "agenda_blocks_tenantId_date_startTime_idx" ON "agenda_blocks"("tenantId", "date", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_blocks_id_tenantId_key" ON "agenda_blocks"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_blocks_tenantId_googleCalendarEventId_key" ON "agenda_blocks"("tenantId", "googleCalendarEventId");

-- CreateIndex
CREATE INDEX "agenda_day_notes_tenantId_dayKey_createdAt_idx" ON "agenda_day_notes"("tenantId", "dayKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_day_notes_id_tenantId_key" ON "agenda_day_notes"("id", "tenantId");

-- CreateIndex
CREATE INDEX "dashboard_reminders_tenantId_isCompleted_createdAt_idx" ON "dashboard_reminders"("tenantId", "isCompleted", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_reminders_id_tenantId_key" ON "dashboard_reminders"("id", "tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_category_isActive_idx" ON "products"("tenantId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_tenantId_key" ON "products"("id", "tenantId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_productId_date_idx" ON "stock_movements"("tenantId", "productId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_id_tenantId_key" ON "stock_movements"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointmentId_key" ON "sales"("appointmentId");

-- CreateIndex
CREATE INDEX "sales_tenantId_date_idx" ON "sales"("tenantId", "date");

-- CreateIndex
CREATE INDEX "sales_tenantId_clientId_date_idx" ON "sales"("tenantId", "clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenantId_saleNumber_key" ON "sales"("tenantId", "saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_id_tenantId_key" ON "sales"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_saleId_key" ON "pending_payments"("saleId");

-- CreateIndex
CREATE INDEX "pending_payments_tenantId_clientId_status_createdAt_idx" ON "pending_payments"("tenantId", "clientId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_id_tenantId_key" ON "pending_payments"("id", "tenantId");

-- CreateIndex
CREATE INDEX "pending_payment_collections_tenantId_pendingPaymentId_opera_idx" ON "pending_payment_collections"("tenantId", "pendingPaymentId", "operationDate");

-- CreateIndex
CREATE INDEX "pending_payment_collections_tenantId_saleId_operationDate_idx" ON "pending_payment_collections"("tenantId", "saleId", "operationDate");

-- CreateIndex
CREATE INDEX "pending_payment_collections_tenantId_clientId_operationDate_idx" ON "pending_payment_collections"("tenantId", "clientId", "operationDate");

-- CreateIndex
CREATE UNIQUE INDEX "pending_payment_collections_id_tenantId_key" ON "pending_payment_collections"("id", "tenantId");

-- CreateIndex
CREATE INDEX "sale_items_tenantId_saleId_idx" ON "sale_items"("tenantId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_id_tenantId_key" ON "sale_items"("id", "tenantId");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_status_date_idx" ON "cash_registers"("tenantId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_id_tenantId_key" ON "cash_registers"("id", "tenantId");

-- CreateIndex
CREATE INDEX "cash_counts_tenantId_cashRegisterId_createdAt_idx" ON "cash_counts"("tenantId", "cashRegisterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_counts_id_tenantId_key" ON "cash_counts"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_saleId_key" ON "cash_movements"("saleId");

-- CreateIndex
CREATE INDEX "cash_movements_tenantId_cashRegisterId_date_idx" ON "cash_movements"("tenantId", "cashRegisterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_id_tenantId_key" ON "cash_movements"("id", "tenantId");

-- CreateIndex
CREATE INDEX "account_balance_movements_tenantId_clientId_operationDate_idx" ON "account_balance_movements"("tenantId", "clientId", "operationDate");

-- CreateIndex
CREATE INDEX "account_balance_movements_tenantId_saleId_idx" ON "account_balance_movements"("tenantId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "account_balance_movements_id_tenantId_key" ON "account_balance_movements"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "account_balance_movements_tenantId_clientId_legacyRef_impor_key" ON "account_balance_movements"("tenantId", "clientId", "legacyRef", "importSource");

-- CreateIndex
CREATE INDEX "notifications_tenantId_isRead_createdAt_idx" ON "notifications"("tenantId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_id_tenantId_key" ON "notifications"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_tenantId_key_key" ON "settings"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_id_tenantId_key" ON "settings"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_config_tenantId_key" ON "google_calendar_config"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_config_id_tenantId_key" ON "google_calendar_config"("id", "tenantId");

-- CreateIndex
CREATE INDEX "bono_packs_tenantId_clientId_status_idx" ON "bono_packs"("tenantId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bono_packs_id_tenantId_key" ON "bono_packs"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "bono_packs_tenantId_clientId_legacyRef_importSource_key" ON "bono_packs"("tenantId", "clientId", "legacyRef", "importSource");

-- CreateIndex
CREATE INDEX "bono_sessions_tenantId_bonoPackId_sessionNumber_idx" ON "bono_sessions"("tenantId", "bonoPackId", "sessionNumber");

-- CreateIndex
CREATE INDEX "bono_sessions_tenantId_appointmentId_idx" ON "bono_sessions"("tenantId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "bono_sessions_id_tenantId_key" ON "bono_sessions"("id", "tenantId");

-- CreateIndex
CREATE INDEX "quotes_tenantId_clientId_date_idx" ON "quotes"("tenantId", "clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenantId_quoteNumber_key" ON "quotes"("tenantId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_id_tenantId_key" ON "quotes"("id", "tenantId");

-- CreateIndex
CREATE INDEX "quote_items_tenantId_quoteId_idx" ON "quote_items"("tenantId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_items_id_tenantId_key" ON "quote_items"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_linkedClientId_fkey" FOREIGN KEY ("linkedClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_history" ADD CONSTRAINT "client_history_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_history" ADD CONSTRAINT "client_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_legends" ADD CONSTRAINT "appointment_legends_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_blocks" ADD CONSTRAINT "agenda_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_day_notes" ADD CONSTRAINT "agenda_day_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_reminders" ADD CONSTRAINT "dashboard_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payment_collections" ADD CONSTRAINT "pending_payment_collections_pendingPaymentId_fkey" FOREIGN KEY ("pendingPaymentId") REFERENCES "pending_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payment_collections" ADD CONSTRAINT "pending_payment_collections_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payment_collections" ADD CONSTRAINT "pending_payment_collections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payment_collections" ADD CONSTRAINT "pending_payment_collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payment_collections" ADD CONSTRAINT "pending_payment_collections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance_movements" ADD CONSTRAINT "account_balance_movements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance_movements" ADD CONSTRAINT "account_balance_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance_movements" ADD CONSTRAINT "account_balance_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_config" ADD CONSTRAINT "google_calendar_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_packs" ADD CONSTRAINT "bono_packs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_packs" ADD CONSTRAINT "bono_packs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_packs" ADD CONSTRAINT "bono_packs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_sessions" ADD CONSTRAINT "bono_sessions_bonoPackId_fkey" FOREIGN KEY ("bonoPackId") REFERENCES "bono_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_sessions" ADD CONSTRAINT "bono_sessions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_sessions" ADD CONSTRAINT "bono_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
