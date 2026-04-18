const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

const projectRoot = path.resolve(__dirname, '..')
const packagedDbPath = path.join(projectRoot, 'prisma', 'packaged', 'lucy3000.db')
const packagedDbUrl = `file:${packagedDbPath.replace(/\\/g, '/')}`
const migrationsDir = path.join(projectRoot, 'prisma', 'migrations')

const defaultServices = [
  {
    id: 'service-default-cera',
    name: 'Cera',
    description: 'Depilacion con cera',
    category: 'Depilacion',
    price: 25,
    duration: 30
  },
  {
    id: 'service-default-laser',
    name: 'Laser',
    description: 'Depilacion laser',
    category: 'Depilacion',
    price: 60,
    duration: 45
  },
  {
    id: 'service-default-limpieza-facial',
    name: 'Limpieza de cara',
    description: 'Limpieza facial profunda',
    category: 'Tratamientos Faciales',
    price: 45,
    duration: 60
  }
]

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: packagedDbUrl
    }
  }
})

const splitSqlStatements = (sql) =>
  sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)

const tableExists = async (tableName) => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}' LIMIT 1`
  )

  return rows.length > 0
}

const getTableColumns = async (tableName) => prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`)

const createDatabaseFromMigrations = async () => {
  const migrationEntries = await fsp.readdir(migrationsDir, { withFileTypes: true })
  const migrationFolders = migrationEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const folderName of migrationFolders) {
    const migrationPath = path.join(migrationsDir, folderName, 'migration.sql')
    const sql = await fsp.readFile(migrationPath, 'utf8')
    const statements = splitSqlStatements(sql)

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement)
    }
  }
}

const rebuildAppointmentsTableForGuestSupport = async ({ hasGuestName, hasGuestPhone }) => {
  const guestNameSelect = hasGuestName ? '"guestName"' : 'NULL AS "guestName"'
  const guestPhoneSelect = hasGuestPhone ? '"guestPhone"' : 'NULL AS "guestPhone"'

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

  if (clientIdColumn?.notnull) {
    await rebuildAppointmentsTableForGuestSupport({ hasGuestName, hasGuestPhone })
    return
  }

  if (!hasGuestName) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestName" TEXT')
  }

  if (!hasGuestPhone) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestPhone" TEXT')
  }
}

const ensureDefaultServices = async () => {
  const existingServices = await prisma.service.count()
  if (existingServices > 0) {
    return
  }

  for (const service of defaultServices) {
    await prisma.service.create({
      data: {
        ...service
      }
    })
  }
}

const main = async () => {
  await fsp.mkdir(path.dirname(packagedDbPath), { recursive: true })
  await fsp.rm(packagedDbPath, { force: true })
  await createDatabaseFromMigrations()

  await ensureAppointmentGuestSupport()
  await ensureDefaultServices()

  console.log(`Created packaged SQLite database at ${packagedDbPath}`)
}

main()
  .catch((error) => {
    console.error('Failed to prepare packaged SQLite database:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
