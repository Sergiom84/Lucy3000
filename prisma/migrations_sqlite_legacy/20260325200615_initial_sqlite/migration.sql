-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "birthDate" DATETIME,
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
    "registrationDate" DATETIME,
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
    "lastVisit" DATETIME,
    "serviceCount" INTEGER,
    "activeTreatmentCount" INTEGER,
    "activeTreatmentNames" TEXT,
    "bondCount" INTEGER,
    "giftVoucher" TEXT,
    "billedAmount" DECIMAL,
    "pendingAmount" DECIMAL,
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
    "totalSpent" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountBalance" DECIMAL,
    CONSTRAINT "clients_linkedClientId_fkey" FOREIGN KEY ("linkedClientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "client_history_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL NOT NULL,
    "duration" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "serviceCode" TEXT,
    "taxRate" DECIMAL,
    "requiresProduct" BOOLEAN,
    "commission" TEXT,
    "promo" TEXT,
    "legacyRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cabin" TEXT NOT NULL DEFAULT 'LUCY',
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "reminder" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "googleCalendarSyncError" TEXT,
    "googleCalendarSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "price" DECIMAL NOT NULL,
    "cost" DECIMAL NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 5,
    "maxStock" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "userId" TEXT NOT NULL,
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "saleNumber" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL NOT NULL,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "tax" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    CONSTRAINT "sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sales_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sale_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingBalance" DECIMAL NOT NULL,
    "closingBalance" DECIMAL,
    "expectedBalance" DECIMAL,
    "difference" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "amount" DECIMAL NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account_balance_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "operationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "referenceItem" TEXT,
    "amount" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_balance_movements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "account_balance_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "google_calendar_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refreshToken" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendClientInvites" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bono_packs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bono_packs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bono_packs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bono_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bonoPackId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "consumedAt" DATETIME,
    "appointmentId" TEXT,
    "notes" TEXT,
    CONSTRAINT "bono_sessions_bonoPackId_fkey" FOREIGN KEY ("bonoPackId") REFERENCES "bono_packs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bono_sessions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "quote_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_googleCalendarEventId_key" ON "appointments"("googleCalendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointmentId_key" ON "sales"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_saleNumber_key" ON "sales"("saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_saleId_key" ON "cash_movements"("saleId");

-- CreateIndex
CREATE INDEX "account_balance_movements_clientId_operationDate_idx" ON "account_balance_movements"("clientId", "operationDate");

-- CreateIndex
CREATE INDEX "account_balance_movements_saleId_idx" ON "account_balance_movements"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "bono_sessions_appointmentId_key" ON "bono_sessions"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");
