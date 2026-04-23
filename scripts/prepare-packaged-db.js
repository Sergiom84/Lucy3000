const fsp = require('node:fs/promises')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

const projectRoot = path.resolve(__dirname, '..')
require('ts-node').register({
  transpileOnly: true,
  project: path.join(projectRoot, 'tsconfig.backend.json')
})

const { ensureAppointmentGuestSupport } = require('../src/backend/db/compat/appointments')
const { createSqliteCompatibilityRuntime } = require('../src/backend/db/compat/helpers')
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

  const sqliteCompatibilityRuntime = createSqliteCompatibilityRuntime({
    prisma,
    databaseUrl: packagedDbUrl
  })

  await ensureAppointmentGuestSupport(sqliteCompatibilityRuntime)
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
