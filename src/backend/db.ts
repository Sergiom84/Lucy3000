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

const ensureAppointmentGuestColumns = async () => {
  if (!(await tableExists('appointments'))) {
    return
  }

  const appointmentColumns = await getTableColumns('appointments')
  const hasGuestName = appointmentColumns.some((column) => column.name === 'guestName')
  const hasGuestPhone = appointmentColumns.some((column) => column.name === 'guestPhone')

  if (!hasGuestName) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestName" TEXT')
  }

  if (!hasGuestPhone) {
    await prisma.$executeRawUnsafe('ALTER TABLE "appointments" ADD COLUMN "guestPhone" TEXT')
  }
}

export const ensureSqliteCompatibilityMigrations = async () => {
  if (!isSqliteDatabase()) return

  await ensureAccountBalancePaymentMethodColumn()
  await ensureAppointmentGuestColumns()
}
