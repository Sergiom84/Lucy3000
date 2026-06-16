import type { SqliteCompatibilityRuntime } from './helpers'

const LOCAL_TENANT_ID = 'local'
const LOCAL_TENANT_NAME = 'Lucy3000 Local'

const TENANT_SCOPED_TABLES = [
  'users',
  'clients',
  'client_history',
  'services',
  'appointments',
  'appointment_services',
  'appointment_legends',
  'agenda_blocks',
  'agenda_day_notes',
  'dashboard_reminders',
  'products',
  'stock_movements',
  'sales',
  'pending_payments',
  'pending_payment_collections',
  'sale_items',
  'cash_registers',
  'cash_counts',
  'cash_movements',
  'account_balance_movements',
  'notifications',
  'settings',
  'google_calendar_config',
  'bono_packs',
  'bono_sessions',
  'quotes',
  'quote_items'
]

export const ensureLocalTenantSupport = async ({
  prisma,
  tableExists,
  addColumnIfMissing
}: SqliteCompatibilityRuntime) => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tenants" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "tenantCode" INTEGER NOT NULL DEFAULT 1,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "commercialReplyStatus" TEXT NOT NULL DEFAULT 'EMAIL_RECEIVED',
      "commercialProcessStatus" TEXT NOT NULL DEFAULT 'PENDING_TRIAL',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tenant_licenses" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "plan" TEXT NOT NULL DEFAULT 'local',
      "trialStartedAt" DATETIME,
      "trialEndsAt" DATETIME NOT NULL,
      "activatedAt" DATETIME,
      "blockedAt" DATETIME,
      "cancelledAt" DATETIME,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug")'
  )
  await addColumnIfMissing(
    'tenants',
    'tenantCode',
    'ALTER TABLE "tenants" ADD COLUMN "tenantCode" INTEGER NOT NULL DEFAULT 1'
  )
  await addColumnIfMissing(
    'tenants',
    'commercialReplyStatus',
    'ALTER TABLE "tenants" ADD COLUMN "commercialReplyStatus" TEXT NOT NULL DEFAULT \'EMAIL_RECEIVED\''
  )
  await addColumnIfMissing(
    'tenants',
    'commercialProcessStatus',
    'ALTER TABLE "tenants" ADD COLUMN "commercialProcessStatus" TEXT NOT NULL DEFAULT \'PENDING_TRIAL\''
  )
  await addColumnIfMissing(
    'tenant_licenses',
    'trialStartedAt',
    'ALTER TABLE "tenant_licenses" ADD COLUMN "trialStartedAt" DATETIME'
  )
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "tenants_tenantCode_key" ON "tenants"("tenantCode")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "tenant_licenses_tenantId_key" ON "tenant_licenses"("tenantId")'
  )

  await prisma.$executeRawUnsafe(`
    INSERT OR IGNORE INTO "tenants" ("id", "name", "slug", "status", "createdAt", "updatedAt")
    VALUES ('${LOCAL_TENANT_ID}', '${LOCAL_TENANT_NAME}', 'local', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)

  await prisma.$executeRawUnsafe(`
    INSERT OR IGNORE INTO "tenant_licenses" (
      "id",
      "tenantId",
      "status",
      "plan",
      "trialEndsAt",
      "activatedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      'local-license',
      '${LOCAL_TENANT_ID}',
      'ACTIVE',
      'local',
      '2099-12-31T23:59:59.000Z',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)

  for (const tableName of TENANT_SCOPED_TABLES) {
    await addColumnIfMissing(
      tableName,
      'tenantId',
      `ALTER TABLE "${tableName}" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '${LOCAL_TENANT_ID}'`
    )
  }

  if (await tableExists('users')) {
    await addColumnIfMissing(
      'users',
      'isPlatformAdmin',
      'ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false'
    )

    await addColumnIfMissing('users', 'phone', 'ALTER TABLE "users" ADD COLUMN "phone" TEXT')

    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "users_id_tenantId_key" ON "users"("id", "tenantId")'
    )

    await prisma.$executeRawUnsafe(`
      UPDATE "users"
      SET "tenantId" = '${LOCAL_TENANT_ID}'
      WHERE "tenantId" IS NULL OR "tenantId" = ''
    `)

    await prisma.$executeRawUnsafe(`
      UPDATE "users"
      SET "isPlatformAdmin" = true
      WHERE "role" = 'ADMIN'
    `)
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "usedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId", "tenantId") REFERENCES "users"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "password_reset_tokens_tenantId_userId_createdAt_idx" ON "password_reset_tokens"("tenantId", "userId", "createdAt")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt")'
  )

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "trial_requests" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "normalizedEmail" TEXT NOT NULL,
      "phone" TEXT,
      "normalizedPhone" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING_REPLY',
      "replyStatus" TEXT NOT NULL DEFAULT 'PENDING_REPLY',
      "commercialProcessStatus" TEXT NOT NULL DEFAULT 'REQUEST_RECEIVED',
      "ownerEmailDeliveredAt" DATETIME,
      "requesterEmailDeliveredAt" DATETIME,
      "ownerEmailId" TEXT,
      "requesterEmailId" TEXT,
      "lastDeliveryError" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "trial_requests_normalizedEmail_key" ON "trial_requests"("normalizedEmail")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "trial_requests_normalizedPhone_key" ON "trial_requests"("normalizedPhone")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "trial_requests_status_createdAt_idx" ON "trial_requests"("status", "createdAt")'
  )
  await addColumnIfMissing(
    'trial_requests',
    'replyStatus',
    'ALTER TABLE "trial_requests" ADD COLUMN "replyStatus" TEXT NOT NULL DEFAULT \'PENDING_REPLY\''
  )
  await addColumnIfMissing(
    'trial_requests',
    'commercialProcessStatus',
    'ALTER TABLE "trial_requests" ADD COLUMN "commercialProcessStatus" TEXT NOT NULL DEFAULT \'REQUEST_RECEIVED\''
  )
}
