import './config/loadEnv'
import { Prisma, PrismaClient } from '@prisma/client'
import { ensureSqliteCompatibilityMigrations as runSqliteCompatibilityMigrations } from './db/compat'
import { getTenantContext } from './tenant/context'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not configured. Set it in .env or as an environment variable (e.g. DATABASE_URL="postgresql://user:password@host:5432/lucy3000")'
  )
}

const globalForPrisma = globalThis as typeof globalThis & {
  __lucyPrisma?: PrismaClient
}

const isSqliteDatabaseUrl = (databaseUrl?: string | null) =>
  String(databaseUrl || '').trim().startsWith('file:')

const loadRuntimePrismaClient = () => {
  if (
    !isSqliteDatabaseUrl(process.env.DATABASE_URL) ||
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST
  ) {
    return PrismaClient
  }

  const sqlitePrisma = require('../../node_modules/.prisma/client-sqlite') as {
    PrismaClient: typeof PrismaClient
  }

  return sqlitePrisma.PrismaClient
}

const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Client',
  'ClientHistory',
  'Service',
  'Appointment',
  'AppointmentService',
  'AppointmentLegend',
  'AgendaBlock',
  'AgendaDayNote',
  'DashboardReminder',
  'Product',
  'StockMovement',
  'Sale',
  'PendingPayment',
  'PendingPaymentCollection',
  'SaleItem',
  'CashRegister',
  'CashCount',
  'CashMovement',
  'AccountBalanceMovement',
  'Notification',
  'Setting',
  'GoogleCalendarConfig',
  'BonoPack',
  'BonoSession',
  'Quote',
  'QuoteItem'
])

const TENANT_ID_UNIQUE_MODELS = new Set(
  [...TENANT_SCOPED_MODELS].filter((model) => model !== 'AppointmentService')
)

const TENANT_UNIQUE_FIELDS: Record<string, Record<string, string>> = {
  Setting: { key: 'tenantId_key' },
  User: { email: 'tenantId_email', username: 'tenantId_username' },
  Product: { sku: 'tenantId_sku' },
  Sale: { saleNumber: 'tenantId_saleNumber' },
  Quote: { quoteNumber: 'tenantId_quoteNumber' }
}

const mergeTenantWhere = (where: unknown, tenantId: string) => {
  if (!where || (typeof where === 'object' && Object.keys(where as Record<string, unknown>).length === 0)) {
    return { tenantId }
  }

  return {
    AND: [where, { tenantId }]
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)

const addTenantIdToCreateData = (value: unknown, tenantId: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => addTenantIdToCreateData(item, tenantId))
  }

  if (!isPlainObject(value)) {
    return value
  }

  const next: Record<string, unknown> = { ...value }

  if (!('tenantId' in next)) {
    next.tenantId = tenantId
  }

  for (const [key, nestedValue] of Object.entries(next)) {
    if (key === 'create') {
      next[key] = addTenantIdToCreateData(nestedValue, tenantId)
      continue
    }

    if (key === 'createMany' && isPlainObject(nestedValue) && 'data' in nestedValue) {
      next[key] = {
        ...nestedValue,
        data: addTenantIdToCreateData(nestedValue.data, tenantId)
      }
      continue
    }

    if (key === 'connectOrCreate' && isPlainObject(nestedValue) && 'create' in nestedValue) {
      next[key] = {
        ...nestedValue,
        create: addTenantIdToCreateData(nestedValue.create, tenantId)
      }
      continue
    }

    if (key === 'upsert' && isPlainObject(nestedValue) && 'create' in nestedValue) {
      next[key] = {
        ...nestedValue,
        create: addTenantIdToCreateData(nestedValue.create, tenantId)
      }
      continue
    }

    if (isPlainObject(nestedValue) || Array.isArray(nestedValue)) {
      next[key] = addTenantIdToNestedCreateData(nestedValue, tenantId)
    }
  }

  return next
}

const addTenantIdToNestedCreateData = (value: unknown, tenantId: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => addTenantIdToNestedCreateData(item, tenantId))
  }

  if (!isPlainObject(value)) {
    return value
  }

  const next: Record<string, unknown> = { ...value }

  for (const [key, nestedValue] of Object.entries(next)) {
    if (key === 'create') {
      next[key] = addTenantIdToCreateData(nestedValue, tenantId)
      continue
    }

    if (key === 'createMany' && isPlainObject(nestedValue) && 'data' in nestedValue) {
      next[key] = {
        ...nestedValue,
        data: addTenantIdToCreateData(nestedValue.data, tenantId)
      }
      continue
    }

    if (key === 'connectOrCreate' && isPlainObject(nestedValue) && 'create' in nestedValue) {
      next[key] = {
        ...nestedValue,
        create: addTenantIdToCreateData(nestedValue.create, tenantId)
      }
      continue
    }

    if (key === 'upsert' && isPlainObject(nestedValue) && 'create' in nestedValue) {
      next[key] = {
        ...nestedValue,
        create: addTenantIdToCreateData(nestedValue.create, tenantId)
      }
      continue
    }

    if (isPlainObject(nestedValue) || Array.isArray(nestedValue)) {
      next[key] = addTenantIdToNestedCreateData(nestedValue, tenantId)
    }
  }

  return next
}

const addTenantIdToCreateArgs = (args: any, tenantId: string) => {
  if (!args?.data) return args

  return {
    ...args,
    data: addTenantIdToCreateData(args.data, tenantId)
  }
}

const toTenantUniqueWhere = (model: string, where: Record<string, unknown>, tenantId: string) => {
  if ('id' in where && TENANT_ID_UNIQUE_MODELS.has(model)) {
    return {
      id_tenantId: {
        id: where.id,
        tenantId
      }
    }
  }

  const uniqueFields = TENANT_UNIQUE_FIELDS[model] ?? {}
  for (const [field, compoundName] of Object.entries(uniqueFields)) {
    if (field in where) {
      return {
        [compoundName]: {
          [field]: where[field],
          tenantId
        }
      }
    }
  }

  return where
}

const installTenantMiddleware = (client: PrismaClient) => {
  if (typeof (client as any).$use !== 'function') {
    return
  }

  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    const model = params.model
    const context = getTenantContext()

    if (!model || !context?.tenantId || !TENANT_SCOPED_MODELS.has(model)) {
      return next(params)
    }

    const tenantId = context.tenantId
    const args = { ...(params.args as any) }

    switch (params.action) {
      case 'findUnique':
        params.action = 'findFirst'
        args.where = mergeTenantWhere(args.where, tenantId)
        break
      case 'findUniqueOrThrow':
        params.action = 'findFirstOrThrow'
        args.where = mergeTenantWhere(args.where, tenantId)
        break
      case 'findFirst':
      case 'findFirstOrThrow':
      case 'findMany':
      case 'count':
      case 'aggregate':
      case 'groupBy':
      case 'updateMany':
      case 'deleteMany':
        args.where = mergeTenantWhere(args.where, tenantId)
        break
      case 'create':
        Object.assign(args, addTenantIdToCreateArgs(args, tenantId))
        break
      case 'createMany':
        Object.assign(args, addTenantIdToCreateArgs(args, tenantId))
        break
      case 'update':
      case 'delete':
        if (isPlainObject(args.where)) {
          args.where = toTenantUniqueWhere(model, args.where, tenantId)
        }
        if (params.action === 'update' && args.data) {
          args.data = addTenantIdToNestedCreateData(args.data, tenantId)
        }
        break
      case 'upsert':
        if (isPlainObject(args.where)) {
          args.where = toTenantUniqueWhere(model, args.where, tenantId)
        }
        Object.assign(args, addTenantIdToCreateArgs(args, tenantId))
        if (args.update) {
          args.update = addTenantIdToNestedCreateData(args.update, tenantId)
        }
        break
      default:
        break
    }

    params.args = args
    return next(params)
  })
}

const createPrismaClient = () => {
  const RuntimePrismaClient = loadRuntimePrismaClient()
  const client = new RuntimePrismaClient({
    datasourceUrl: process.env.DATABASE_URL
  })
  installTenantMiddleware(client)
  return client
}

export const prisma = globalForPrisma.__lucyPrisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__lucyPrisma = prisma
}

// Hora autoritativa para decisiones de licencia/trial. En modo Postgres
// (Supabase) la toma de la base con SELECT NOW(), de forma que cambiar el reloj
// del PC del cliente no alarga ni adelanta el trial. En SQLite local cae a la
// hora local del proceso.
export const getServerNow = async (): Promise<Date> => {
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    return new Date()
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ now: Date }>>('SELECT NOW() as now')
    const value = rows?.[0]?.now
    return value ? new Date(value) : new Date()
  } catch {
    return new Date()
  }
}

export const ensureSqliteCompatibilityMigrations = async () => {
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    return
  }

  await runSqliteCompatibilityMigrations({
    prisma,
    databaseUrl: process.env.DATABASE_URL
  })
}
