import type { PrismaClient } from '@prisma/client'

export type SqliteTableInfoRow = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export type SqliteCompatibilityContext = {
  prisma: PrismaClient
  databaseUrl?: string | null
}

export type SqliteCompatibilityRuntime = SqliteCompatibilityContext & {
  tableExists: (tableName: string) => Promise<boolean>
  indexExists: (indexName: string) => Promise<boolean>
  getTableColumns: (tableName: string) => Promise<SqliteTableInfoRow[]>
  addColumnIfMissing: (tableName: string, columnName: string, statement: string) => Promise<boolean>
}

const escapeSqliteString = (value: string) => value.replace(/'/g, "''")

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`

export const isSqliteDatabase = ({ databaseUrl }: SqliteCompatibilityContext) =>
  String(databaseUrl || '').startsWith('file:')

export const createSqliteCompatibilityRuntime = (
  context: SqliteCompatibilityContext
): SqliteCompatibilityRuntime => {
  const { prisma } = context

  const tableExists = async (tableName: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${escapeSqliteString(tableName)}' LIMIT 1`
    )

    return rows.length > 0
  }

  const indexExists = async (indexName: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${escapeSqliteString(indexName)}' LIMIT 1`
    )

    return rows.length > 0
  }

  const getTableColumns = async (tableName: string) =>
    prisma.$queryRawUnsafe<Array<SqliteTableInfoRow>>(
      `PRAGMA table_info(${quoteIdentifier(tableName)})`
    )

  const addColumnIfMissing = async (
    tableName: string,
    columnName: string,
    statement: string
  ) => {
    if (!(await tableExists(tableName))) {
      return false
    }

    const columns = await getTableColumns(tableName)
    const hasColumn = columns.some((column) => column.name === columnName)

    if (hasColumn) {
      return false
    }

    await prisma.$executeRawUnsafe(statement)
    return true
  }

  return {
    ...context,
    tableExists,
    indexExists,
    getTableColumns,
    addColumnIfMissing
  }
}
