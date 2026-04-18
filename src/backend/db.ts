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

const getTableColumns = async (tableName: string) => {
  return prisma.$queryRawUnsafe<Array<SqliteTableInfoRow>>(`PRAGMA table_info("${tableName}")`)
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

  await ensureAccountBalancePaymentMethodColumn()
  await ensureAppointmentGuestSupport()
  await ensureAppointmentLegendTable()
  await ensureDefaultAppointmentLegends()
}
