import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryRow = Record<string, unknown>

describe('ensureSqliteCompatibilityMigrations', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  type LoadDbModuleOptions = {
    queryResponses: Record<string, QueryRow[]>
    settingValue?: string | null
    bonoPacks?: Array<{
      id: string
      serviceId: string | null
      name: string
      totalSessions: number
    }>
    appointmentLegendCount?: number
  }

  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as typeof globalThis & { __lucyPrisma?: unknown }).__lucyPrisma
    process.env.DATABASE_URL = 'file:./compatibility-test.db'
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl
    vi.restoreAllMocks()
  })

  const loadDbModule = async ({
    queryResponses,
    settingValue = null,
    bonoPacks = [],
    appointmentLegendCount = 1
  }: LoadDbModuleOptions) => {
    const queryRawUnsafe = vi.fn(async (sql: string) => {
      for (const [pattern, response] of Object.entries(queryResponses)) {
        if (sql.includes(pattern)) {
          return response
        }
      }

      return []
    })
    const executeRawUnsafe = vi.fn(async () => undefined)
    const settingFindUnique = vi.fn(async () =>
      settingValue === null ? null : { value: settingValue }
    )
    const bonoPackFindMany = vi.fn(async () => bonoPacks)
    const bonoPackUpdate = vi.fn(async () => undefined)
    const appointmentLegendCountMock = vi.fn(async () => appointmentLegendCount)
    const appointmentLegendCreateMany = vi.fn(async () => undefined)

    function PrismaClientMock() {
      return {
        $queryRawUnsafe: queryRawUnsafe,
        $executeRawUnsafe: executeRawUnsafe,
        setting: {
          findUnique: settingFindUnique
        },
        bonoPack: {
          findMany: bonoPackFindMany,
          update: bonoPackUpdate
        },
        appointmentLegend: {
          count: appointmentLegendCountMock,
          createMany: appointmentLegendCreateMany
        }
      }
    }

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn(PrismaClientMock)
    }))

    const module = await import('../../../src/backend/db')

    return {
      ensureSqliteCompatibilityMigrations: module.ensureSqliteCompatibilityMigrations,
      queryRawUnsafe,
      executeRawUnsafe,
      settingFindUnique,
      bonoPackFindMany,
      bonoPackUpdate,
      appointmentLegendCountMock,
      appointmentLegendCreateMany
    }
  }

  it('does nothing for non-SQLite database urls', async () => {
    const queryRawUnsafe = vi.fn(async () => [])
    const executeRawUnsafe = vi.fn(async () => undefined)
    const settingFindUnique = vi.fn(async () => null)
    const bonoPackFindMany = vi.fn(async () => [])
    const bonoPackUpdate = vi.fn(async () => undefined)
    const appointmentLegendCountMock = vi.fn(async () => 0)
    const appointmentLegendCreateMany = vi.fn(async () => undefined)
    const compatModule = await import('../../../src/backend/db/compat')

    await compatModule.ensureSqliteCompatibilityMigrations({
      databaseUrl: 'postgresql://localhost/lucy3000',
      prisma: {
        $queryRawUnsafe: queryRawUnsafe,
        $executeRawUnsafe: executeRawUnsafe,
        setting: {
          findUnique: settingFindUnique
        },
        bonoPack: {
          findMany: bonoPackFindMany,
          update: bonoPackUpdate
        },
        appointmentLegend: {
          count: appointmentLegendCountMock,
          createMany: appointmentLegendCreateMany
        }
      } as any
    })

    expect(queryRawUnsafe).not.toHaveBeenCalled()
    expect(executeRawUnsafe).not.toHaveBeenCalled()
    expect(settingFindUnique).not.toHaveBeenCalled()
    expect(bonoPackFindMany).not.toHaveBeenCalled()
    expect(appointmentLegendCountMock).not.toHaveBeenCalled()
    expect(appointmentLegendCreateMany).not.toHaveBeenCalled()
  })

  it('rebuilds appointments table when clientId is still required', async () => {
    const { ensureSqliteCompatibilityMigrations, executeRawUnsafe } = await loadDbModule({
      queryResponses: {
        "name='account_balance_movements'": [],
        "name='appointments'": [{ name: 'appointments' }],
        'PRAGMA table_info("appointments")': [
          { name: 'id', notnull: 1 },
          { name: 'clientId', notnull: 1 },
          { name: 'userId', notnull: 1 },
          { name: 'serviceId', notnull: 1 }
        ]
      }
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
      queryResponses: {
        "name='account_balance_movements'": [],
        "name='appointments'": [{ name: 'appointments' }],
        'PRAGMA table_info("appointments")': [
          { name: 'id', notnull: 1 },
          { name: 'clientId', notnull: 0 },
          { name: 'userId', notnull: 1 },
          { name: 'serviceId', notnull: 1 }
        ]
      }
    })

    await ensureSqliteCompatibilityMigrations()

    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "appointments" ADD COLUMN "guestName" TEXT'
    )
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "appointments" ADD COLUMN "guestPhone" TEXT'
    )
  })

  it('creates agenda helper tables when they do not exist yet', async () => {
    const { ensureSqliteCompatibilityMigrations, executeRawUnsafe } = await loadDbModule({
      queryResponses: {
        "name='account_balance_movements'": [],
        "name='appointments'": [],
        "name='appointment_legends'": [],
        "name='agenda_blocks'": [],
        "name='agenda_day_notes'": [],
        "name='dashboard_reminders'": [],
        "name='pending_payments'": []
      }
    })

    await ensureSqliteCompatibilityMigrations()

    const executedSql = executeRawUnsafe.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(executedSql).toContain('CREATE TABLE "agenda_day_notes"')
    expect(executedSql).toContain('CREATE INDEX "agenda_day_notes_dayKey_createdAt_idx"')
    expect(executedSql).toContain('CREATE TABLE "dashboard_reminders"')
    expect(executedSql).toContain('CREATE INDEX "dashboard_reminders_isCompleted_createdAt_idx"')
    expect(executedSql).toContain('CREATE TABLE "pending_payments"')
    expect(executedSql).toContain('CREATE UNIQUE INDEX "pending_payments_saleId_key"')
  })

  it('adds the new cash register closure columns when upgrading an existing SQLite database', async () => {
    const { ensureSqliteCompatibilityMigrations, executeRawUnsafe } = await loadDbModule({
      queryResponses: {
        "name='account_balance_movements'": [],
        "name='cash_registers'": [{ name: 'cash_registers' }],
        'PRAGMA table_info("cash_registers")': [
          { name: 'id', notnull: 1 },
          { name: 'openingBalance', notnull: 1 },
          { name: 'closingBalance', notnull: 0 }
        ]
      }
    })

    await ensureSqliteCompatibilityMigrations()

    const executedSql = executeRawUnsafe.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "openingDenominations" TEXT')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "countedTotal" DECIMAL')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "countedDenominations" TEXT')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "arqueoDifference" DECIMAL')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloat" DECIMAL')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloatDenominations" TEXT')
    expect(executedSql).toContain('ALTER TABLE "cash_registers" ADD COLUMN "withdrawalAmount" DECIMAL')
  })

  it('backfills bono pack template ids using the stored catalog after adding legacy import columns', async () => {
    const { ensureSqliteCompatibilityMigrations, bonoPackUpdate, settingFindUnique, bonoPackFindMany } =
      await loadDbModule({
        queryResponses: {
          "name='account_balance_movements'": [],
          "name='bono_packs'": [{ name: 'bono_packs' }],
          'PRAGMA table_info("bono_packs")': [
            { name: 'id', notnull: 1 },
            { name: 'clientId', notnull: 1 },
            { name: 'serviceId', notnull: 0 },
            { name: 'name', notnull: 1 },
            { name: 'totalSessions', notnull: 1 }
          ]
        },
        settingValue: JSON.stringify([
          {
            id: 'template-1',
            serviceId: 'service-1',
            description: 'Bono facial',
            serviceName: 'Facial',
            totalSessions: 5
          }
        ]),
        bonoPacks: [
          {
            id: 'pack-1',
            serviceId: 'service-1',
            name: 'Bono facial 5 sesiones',
            totalSessions: 5
          }
        ]
      })

    await ensureSqliteCompatibilityMigrations()

    expect(settingFindUnique).toHaveBeenCalledWith({
      where: { key: 'bono_templates_catalog' }
    })
    expect(bonoPackFindMany).toHaveBeenCalledWith({
      where: { bonoTemplateId: null },
      select: {
        id: true,
        serviceId: true,
        name: true,
        totalSessions: true
      }
    })
    expect(bonoPackUpdate).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { bonoTemplateId: 'template-1' }
    })
  })

  it('seeds default appointment legends when the table exists and is empty', async () => {
    const { ensureSqliteCompatibilityMigrations, appointmentLegendCreateMany, appointmentLegendCountMock } =
      await loadDbModule({
        queryResponses: {
          "name='account_balance_movements'": [],
          "name='appointment_legends'": [{ name: 'appointment_legends' }]
        },
        appointmentLegendCount: 0
      })

    await ensureSqliteCompatibilityMigrations()

    expect(appointmentLegendCountMock).toHaveBeenCalledTimes(1)
    expect(appointmentLegendCreateMany).toHaveBeenCalledTimes(1)
    const [createManyArgs] = appointmentLegendCreateMany.mock.calls[0]
    expect(createManyArgs.data).toHaveLength(10)
    expect(createManyArgs.data[0]).toMatchObject({
      id: '5f4a529f-c55d-4e91-9a6f-2cc3a8a87ad1',
      name: 'Cejas y pestañas',
      sortOrder: 0
    })
  })
})
