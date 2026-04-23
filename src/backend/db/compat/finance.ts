import type { SqliteCompatibilityRuntime } from './helpers'

export const ensureAccountBalancePaymentMethodColumn = async ({
  addColumnIfMissing
}: SqliteCompatibilityRuntime) => {
  await addColumnIfMissing(
    'account_balance_movements',
    'paymentMethod',
    'ALTER TABLE "account_balance_movements" ADD COLUMN "paymentMethod" TEXT'
  )
}

export const ensureSalesPaymentBreakdownColumn = async ({
  addColumnIfMissing
}: SqliteCompatibilityRuntime) => {
  await addColumnIfMissing(
    'sales',
    'paymentBreakdown',
    'ALTER TABLE "sales" ADD COLUMN "paymentBreakdown" TEXT'
  )
}

export const ensureCashRegisterClosureColumns = async ({
  prisma,
  tableExists,
  getTableColumns
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('cash_registers'))) {
    return
  }

  const cashRegisterColumns = new Set(
    (await getTableColumns('cash_registers')).map((column) => column.name)
  )

  const addColumnIfMissing = async (columnName: string, statement: string) => {
    if (cashRegisterColumns.has(columnName)) {
      return
    }

    await prisma.$executeRawUnsafe(statement)
    cashRegisterColumns.add(columnName)
  }

  await addColumnIfMissing(
    'openingDenominations',
    'ALTER TABLE "cash_registers" ADD COLUMN "openingDenominations" TEXT'
  )
  await addColumnIfMissing(
    'countedTotal',
    'ALTER TABLE "cash_registers" ADD COLUMN "countedTotal" DECIMAL'
  )
  await addColumnIfMissing(
    'countedDenominations',
    'ALTER TABLE "cash_registers" ADD COLUMN "countedDenominations" TEXT'
  )
  await addColumnIfMissing(
    'arqueoDifference',
    'ALTER TABLE "cash_registers" ADD COLUMN "arqueoDifference" DECIMAL'
  )
  await addColumnIfMissing(
    'nextDayFloat',
    'ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloat" DECIMAL'
  )
  await addColumnIfMissing(
    'nextDayFloatDenominations',
    'ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloatDenominations" TEXT'
  )
  await addColumnIfMissing(
    'withdrawalAmount',
    'ALTER TABLE "cash_registers" ADD COLUMN "withdrawalAmount" DECIMAL'
  )
}
