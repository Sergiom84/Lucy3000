import './config/loadEnv'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not configured. Set it in .env or as an environment variable (e.g. DATABASE_URL="file:./prisma/lucy3000.db")'
  )
}

const globalForPrisma = globalThis as typeof globalThis & {
  __lucyPrisma?: PrismaClient
}

const createPrismaClient = () =>
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
  })

export const prisma = globalForPrisma.__lucyPrisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__lucyPrisma = prisma
}

const isSqliteDatabase = () => String(process.env.DATABASE_URL || '').startsWith('file:')

type SqliteTableInfoRow = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

const DEFAULT_APPOINTMENT_LEGENDS = [
  { id: '5f4a529f-c55d-4e91-9a6f-2cc3a8a87ad1', name: 'Cejas y pestañas', color: '#7C3AED', sortOrder: 0 },
  { id: 'cef13ecf-36ca-4f1a-a7d5-5405a65f6d59', name: 'Cera hombre', color: '#92400E', sortOrder: 1 },
  { id: '0b3b6602-0f3d-44a4-b79b-8f341ec5c846', name: 'Cera mujer', color: '#BE123C', sortOrder: 2 },
  { id: '19144c05-aadf-4b80-9fbe-af6a3036a8df', name: 'Corporal', color: '#0F766E', sortOrder: 3 },
  { id: 'b963ca48-b1cf-43a7-94fe-b3cfaec1d5fc', name: 'Dep. electrica', color: '#1D4ED8', sortOrder: 4 },
  { id: '7e17fe9e-8946-4f12-ad1c-d22beecde106', name: 'Facial', color: '#15803D', sortOrder: 5 },
  { id: 'fa4a0d75-8ba1-4827-bcc6-727799d51506', name: 'Medicina', color: '#475569', sortOrder: 6 },
  { id: '1d5f50bd-f4f5-4ef3-ae97-89df56d11bc0', name: 'Micropigmentacion', color: '#C026D3', sortOrder: 7 },
  { id: '4c577eb3-4475-4304-a938-b3cfab8a6920', name: 'SHR', color: '#EA580C', sortOrder: 8 },
  { id: '9b3d422b-e1e7-45cc-971e-3d9f4e1c8086', name: 'Venta', color: '#0284C7', sortOrder: 9 }
] as const

const tableExists = async (tableName: string) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}' LIMIT 1`
  )

  return rows.length > 0
}

const indexExists = async (indexName: string) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}' LIMIT 1`
  )

  return rows.length > 0
}

const getTableColumns = async (tableName: string) => {
  return prisma.$queryRawUnsafe<Array<SqliteTableInfoRow>>(`PRAGMA table_info("${tableName}")`)
}

const ensureUsersUsernameColumn = async () => {
  if (!(await tableExists('users'))) {
    return
  }

  const userColumns = await getTableColumns('users')
  const hasUsername = userColumns.some((column) => column.name === 'username')

  if (!hasUsername) {
    await prisma.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN "username" TEXT')
  }

  if (!(await indexExists('users_username_key'))) {
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "users_username_key" ON "users"("username")')
  }
}

const ensureAccountBalancePaymentMethodColumn = async () => {
  if (!(await tableExists('account_balance_movements'))) {
    return
  }

  const accountBalanceColumns = await getTableColumns('account_balance_movements')
  const hasPaymentMethod = accountBalanceColumns.some((column) => column.name === 'paymentMethod')

  if (!hasPaymentMethod) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "account_balance_movements" ADD COLUMN "paymentMethod" TEXT'
    )
  }
}

const ensureLegacyAccountBalanceImportColumns = async () => {
  if (!(await tableExists('account_balance_movements'))) {
    return
  }

  const accountBalanceColumns = await getTableColumns('account_balance_movements')
  const hasLegacyRef = accountBalanceColumns.some((column) => column.name === 'legacyRef')
  const hasImportSource = accountBalanceColumns.some((column) => column.name === 'importSource')

  if (!hasLegacyRef) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "account_balance_movements" ADD COLUMN "legacyRef" TEXT'
    )
  }

  if (!hasImportSource) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "account_balance_movements" ADD COLUMN "importSource" TEXT'
    )
  }

  if (!(await indexExists('account_balance_movements_clientId_legacyRef_importSource_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "account_balance_movements_clientId_legacyRef_importSource_key" ON "account_balance_movements"("clientId", "legacyRef", "importSource")'
    )
  }
}

const ensureLegacyBonoImportColumns = async () => {
  if (!(await tableExists('bono_packs'))) {
    return
  }

  const bonoPackColumns = await getTableColumns('bono_packs')
  const hasLegacyRef = bonoPackColumns.some((column) => column.name === 'legacyRef')
  const hasImportSource = bonoPackColumns.some((column) => column.name === 'importSource')

  if (!hasLegacyRef) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "bono_packs" ADD COLUMN "legacyRef" TEXT'
    )
  }

  if (!hasImportSource) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "bono_packs" ADD COLUMN "importSource" TEXT'
    )
  }

  if (!(await indexExists('bono_packs_clientId_legacyRef_importSource_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "bono_packs_clientId_legacyRef_importSource_key" ON "bono_packs"("clientId", "legacyRef", "importSource")'
    )
  }
}

const rebuildAppointmentsTableForGuestSupport = async (options: {
  hasGuestName: boolean
  hasGuestPhone: boolean
}) => {
  const guestNameSelect = options.hasGuestName ? '"guestName"' : 'NULL AS "guestName"'
  const guestPhoneSelect = options.hasGuestPhone ? '"guestPhone"' : 'NULL AS "guestPhone"'

  await prisma.$executeRawUnsafe('PRAGMA defer_foreign_keys=ON')
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF')

  try {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "appointments__compat"')
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "appointments__compat" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "clientId" TEXT,
        "guestName" TEXT,
        "guestPhone" TEXT,
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
        CONSTRAINT "appointments__compat_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "appointments__compat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "appointments__compat_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "appointments__compat" (
        "id",
        "clientId",
        "guestName",
        "guestPhone",
        "userId",
        "serviceId",
        "cabin",
        "professional",
        "date",
        "startTime",
        "endTime",
        "status",
        "notes",
        "reminder",
        "googleCalendarEventId",
        "googleCalendarSyncStatus",
        "googleCalendarSyncError",
        "googleCalendarSyncedAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "clientId",
        ${guestNameSelect},
        ${guestPhoneSelect},
        "userId",
        "serviceId",
        "cabin",
        "professional",
        "date",
        "startTime",
        "endTime",
        "status",
        "notes",
        "reminder",
        "googleCalendarEventId",
        "googleCalendarSyncStatus",
        "googleCalendarSyncError",
        "googleCalendarSyncedAt",
        "createdAt",
        "updatedAt"
      FROM "appointments"
    `)
    await prisma.$executeRawUnsafe('DROP TABLE "appointments"')
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments__compat" RENAME TO "appointments"')
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "appointments_googleCalendarEventId_key" ON "appointments"("googleCalendarEventId")'
    )
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON')
    await prisma.$executeRawUnsafe('PRAGMA defer_foreign_keys=OFF')
  }
}

const ensureAppointmentGuestSupport = async () => {
  if (!(await tableExists('appointments'))) {
    return
  }

  const appointmentColumns = await getTableColumns('appointments')
  const hasGuestName = appointmentColumns.some((column) => column.name === 'guestName')
  const hasGuestPhone = appointmentColumns.some((column) => column.name === 'guestPhone')
  const clientIdColumn = appointmentColumns.find((column) => column.name === 'clientId')
  const clientIdIsRequired = Boolean(clientIdColumn?.notnull)

  if (clientIdIsRequired) {
    await rebuildAppointmentsTableForGuestSupport({
      hasGuestName,
      hasGuestPhone
    })
    return
  }

  if (!hasGuestName) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestName" TEXT')
  }

  if (!hasGuestPhone) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestPhone" TEXT')
  }
}

const ensureAppointmentServicesTable = async () => {
  if (!(await tableExists('appointments'))) {
    return
  }

  if (!(await tableExists('appointment_services'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "appointment_services" (
        "appointmentId" TEXT NOT NULL,
        "serviceId" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL,
        CONSTRAINT "appointment_services_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "appointment_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        PRIMARY KEY ("appointmentId", "serviceId")
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "appointment_services_appointmentId_sortOrder_key" ON "appointment_services"("appointmentId", "sortOrder")'
    )
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO "appointment_services" ("appointmentId", "serviceId", "sortOrder")
    SELECT "id", "serviceId", 0
    FROM "appointments" AS "appointments"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "appointment_services" AS "appointment_services"
      WHERE "appointment_services"."appointmentId" = "appointments"."id"
        AND "appointment_services"."sortOrder" = 0
    )
  `)
}

const ensureAppointmentLegendTable = async () => {
  if (await tableExists('appointment_legends')) {
    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "appointment_legends" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "color" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)
}

const ensureAgendaBlocksTable = async () => {
  if (await tableExists('agenda_blocks')) {
    const agendaBlockColumns = await getTableColumns('agenda_blocks')
    const hasCalendarInviteEmail = agendaBlockColumns.some((column) => column.name === 'calendarInviteEmail')

    if (!hasCalendarInviteEmail) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "agenda_blocks" ADD COLUMN "calendarInviteEmail" TEXT'
      )
    }

    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "agenda_blocks" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "professional" TEXT NOT NULL,
      "calendarInviteEmail" TEXT,
      "cabin" TEXT NOT NULL DEFAULT 'LUCY',
      "date" DATETIME NOT NULL,
      "startTime" TEXT NOT NULL,
      "endTime" TEXT NOT NULL,
      "notes" TEXT,
      "googleCalendarEventId" TEXT,
      "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
      "googleCalendarSyncError" TEXT,
      "googleCalendarSyncedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX "agenda_blocks_googleCalendarEventId_key" ON "agenda_blocks"("googleCalendarEventId")'
  )
}

const ensureAgendaDayNotesTable = async () => {
  if (await tableExists('agenda_day_notes')) {
    const agendaDayNoteColumns = await getTableColumns('agenda_day_notes')
    const hasIsCompleted = agendaDayNoteColumns.some((column) => column.name === 'isCompleted')
    const hasCompletedAt = agendaDayNoteColumns.some((column) => column.name === 'completedAt')

    if (!hasIsCompleted) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "agenda_day_notes" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false'
      )
    }

    if (!hasCompletedAt) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "agenda_day_notes" ADD COLUMN "completedAt" DATETIME'
      )
    }

    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "agenda_day_notes" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "dayKey" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "isCompleted" BOOLEAN NOT NULL DEFAULT false,
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "agenda_day_notes_dayKey_createdAt_idx" ON "agenda_day_notes"("dayKey", "createdAt")'
  )
}

const ensureDashboardRemindersTable = async () => {
  if (await tableExists('dashboard_reminders')) {
    const dashboardReminderColumns = await getTableColumns('dashboard_reminders')
    const hasIsCompleted = dashboardReminderColumns.some((column) => column.name === 'isCompleted')
    const hasCompletedAt = dashboardReminderColumns.some((column) => column.name === 'completedAt')

    if (!hasIsCompleted) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "dashboard_reminders" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false'
      )
    }

    if (!hasCompletedAt) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "dashboard_reminders" ADD COLUMN "completedAt" DATETIME'
      )
    }

    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "dashboard_reminders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "text" TEXT NOT NULL,
      "isCompleted" BOOLEAN NOT NULL DEFAULT false,
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "dashboard_reminders_isCompleted_createdAt_idx" ON "dashboard_reminders"("isCompleted", "createdAt")'
  )
}

const ensurePendingPaymentsTable = async () => {
  if (!(await tableExists('pending_payments'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "pending_payments" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "settledAt" DATETIME,
        "settledPaymentMethod" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "pending_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "pending_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
  } else {
    const pendingPaymentColumns = await getTableColumns('pending_payments')
    const hasSettledPaymentMethod = pendingPaymentColumns.some(
      (column) => column.name === 'settledPaymentMethod'
    )

    if (!hasSettledPaymentMethod) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "pending_payments" ADD COLUMN "settledPaymentMethod" TEXT'
      )
    }
  }

  if (!(await indexExists('pending_payments_saleId_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "pending_payments_saleId_key" ON "pending_payments"("saleId")'
    )
  }

  if (!(await indexExists('pending_payments_clientId_status_createdAt_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payments_clientId_status_createdAt_idx" ON "pending_payments"("clientId", "status", "createdAt")'
    )
  }
}

const ensureSalesPaymentBreakdownColumn = async () => {
  if (!(await tableExists('sales'))) {
    return
  }

  const saleColumns = await getTableColumns('sales')
  const hasPaymentBreakdown = saleColumns.some((column) => column.name === 'paymentBreakdown')

  if (!hasPaymentBreakdown) {
    await prisma.$executeRawUnsafe('ALTER TABLE "sales" ADD COLUMN "paymentBreakdown" TEXT')
  }
}

const ensurePendingPaymentCollectionsTable = async () => {
  if (!(await tableExists('pending_payment_collections'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "pending_payment_collections" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "pendingPaymentId" TEXT NOT NULL,
        "saleId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "paymentMethod" TEXT NOT NULL,
        "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true,
        "operationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pending_payment_collections_pendingPaymentId_fkey" FOREIGN KEY ("pendingPaymentId") REFERENCES "pending_payments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "pending_payment_collections_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "pending_payment_collections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "pending_payment_collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `)
  }

  if (!(await indexExists('pending_payment_collections_pendingPaymentId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_pendingPaymentId_operationDate_idx" ON "pending_payment_collections"("pendingPaymentId", "operationDate")'
    )
  }

  if (!(await indexExists('pending_payment_collections_saleId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_saleId_operationDate_idx" ON "pending_payment_collections"("saleId", "operationDate")'
    )
  }

  if (!(await indexExists('pending_payment_collections_clientId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_clientId_operationDate_idx" ON "pending_payment_collections"("clientId", "operationDate")'
    )
  }
}

const ensureDefaultAppointmentLegends = async () => {
  if (!(await tableExists('appointment_legends'))) {
    return
  }

  const legendCount = await prisma.appointmentLegend.count()
  if (legendCount > 0) {
    return
  }

  const now = new Date()

  await prisma.appointmentLegend.createMany({
    data: DEFAULT_APPOINTMENT_LEGENDS.map((legend) => ({
      ...legend,
      createdAt: now,
      updatedAt: now
    }))
  })
}

export const ensureSqliteCompatibilityMigrations = async () => {
  if (!isSqliteDatabase()) return

  await ensureUsersUsernameColumn()
  await ensureAccountBalancePaymentMethodColumn()
  await ensureSalesPaymentBreakdownColumn()
  await ensureLegacyAccountBalanceImportColumns()
  await ensureLegacyBonoImportColumns()
  await ensureAppointmentGuestSupport()
  await ensureAppointmentServicesTable()
  await ensureAppointmentLegendTable()
  await ensureAgendaBlocksTable()
  await ensureAgendaDayNotesTable()
  await ensureDashboardRemindersTable()
  await ensurePendingPaymentsTable()
  await ensurePendingPaymentCollectionsTable()
  await ensureDefaultAppointmentLegends()
}
