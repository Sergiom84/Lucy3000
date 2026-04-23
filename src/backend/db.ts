import './config/loadEnv'
import { PrismaClient } from '@prisma/client'
import { ensureSqliteCompatibilityMigrations as runSqliteCompatibilityMigrations } from './db/compat'

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

export const ensureSqliteCompatibilityMigrations = async () => {
  await runSqliteCompatibilityMigrations({
    prisma,
    databaseUrl: process.env.DATABASE_URL
  })
}
