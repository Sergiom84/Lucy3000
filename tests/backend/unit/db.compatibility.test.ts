import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryRow = Record<string, unknown>

describe('ensureSqliteCompatibilityMigrations', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as typeof globalThis & { __lucyPrisma?: unknown }).__lucyPrisma
    process.env.DATABASE_URL = 'file:./compatibility-test.db'
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl
    vi.restoreAllMocks()
  })

  const loadDbModule = async (queryResponses: Record<string, QueryRow[]>) => {
    const queryRawUnsafe = vi.fn(async (sql: string) => {
      for (const [pattern, response] of Object.entries(queryResponses)) {
        if (sql.includes(pattern)) {
          return response
        }
      }

      return []
    })
    const executeRawUnsafe = vi.fn(async () => undefined)

    function PrismaClientMock() {
      return {
        $queryRawUnsafe: queryRawUnsafe,
        $executeRawUnsafe: executeRawUnsafe
      }
    }

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn(PrismaClientMock)
    }))

    const module = await import('../../../src/backend/db')

    return {
      ensureSqliteCompatibilityMigrations: module.ensureSqliteCompatibilityMigrations,
      queryRawUnsafe,
      executeRawUnsafe
    }
  }

  it('rebuilds appointments table when clientId is still required', async () => {
    const { ensureSqliteCompatibilityMigrations, executeRawUnsafe } = await loadDbModule({
      "name='account_balance_movements'": [],
      "name='appointments'": [{ name: 'appointments' }],
      'PRAGMA table_info("appointments")': [
        { name: 'id', notnull: 1 },
        { name: 'clientId', notnull: 1 },
        { name: 'userId', notnull: 1 },
        { name: 'serviceId', notnull: 1 }
      ]
    })

    await ensureSqliteCompatibilityMigrations()

    const executedSql = executeRawUnsafe.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(executedSql).toContain('CREATE TABLE "appointments__compat"')
    expect(executedSql).toContain('NULL AS "guestName"')
    expect(executedSql).toContain('NULL AS "guestPhone"')
    expect(executedSql).toContain('DROP TABLE "appointments"')
    expect(executedSql).toContain('ALTER TABLE "appointments__compat" RENAME TO "appointments"')
  })

  it('adds guest columns when appointments table is already nullable', async () => {
    const { ensureSqliteCompatibilityMigrations, executeRawUnsafe } = await loadDbModule({
      "name='account_balance_movements'": [],
      "name='appointments'": [{ name: 'appointments' }],
      'PRAGMA table_info("appointments")': [
        { name: 'id', notnull: 1 },
        { name: 'clientId', notnull: 0 },
        { name: 'userId', notnull: 1 },
        { name: 'serviceId', notnull: 1 }
      ]
    })

    await ensureSqliteCompatibilityMigrations()

    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "appointments" ADD COLUMN "guestName" TEXT'
    )
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "appointments" ADD COLUMN "guestPhone" TEXT'
    )
  })
})
