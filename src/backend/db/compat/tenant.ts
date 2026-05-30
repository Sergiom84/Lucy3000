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
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
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
}
