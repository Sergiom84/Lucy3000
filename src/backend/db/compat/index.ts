import { ensureUsersUsernameColumn } from './auth'
import {
  ensureAppointmentGuestSupport,
  ensureAppointmentLegendTable,
  ensureAppointmentServicesTable,
  ensureAgendaBlocksTable,
  ensureAgendaDayNotesTable,
  ensureDashboardRemindersTable,
  ensureDefaultAppointmentLegends
} from './appointments'
import { ensureMultipleBonoSessionsPerAppointment } from './bono-packs'
import {
  ensureAccountBalancePaymentMethodColumn,
  ensureCashRegisterClosureColumns,
  ensureSalesPaymentBreakdownColumn
} from './finance'
import {
  backfillBonoPackTemplateIds,
  clearSyntheticImportedBonoConsumptionDates,
  ensureLegacyAccountBalanceImportColumns,
  ensureLegacyBonoImportColumns
} from './legacy-imports'
import {
  createSqliteCompatibilityRuntime,
  isSqliteDatabase,
  type SqliteCompatibilityContext,
  type SqliteCompatibilityRuntime,
  type SqliteTableInfoRow
} from './helpers'
import {
  ensurePendingPaymentCollectionsTable,
  ensurePendingPaymentsTable
} from './pending-payments'

type SqliteCompatibilityStep = (runtime: SqliteCompatibilityRuntime) => Promise<void>

const sqliteCompatibilitySteps: SqliteCompatibilityStep[] = [
  ensureUsersUsernameColumn,
  ensureAccountBalancePaymentMethodColumn,
  ensureSalesPaymentBreakdownColumn,
  ensureCashRegisterClosureColumns,
  ensureLegacyAccountBalanceImportColumns,
  ensureLegacyBonoImportColumns,
  backfillBonoPackTemplateIds,
  clearSyntheticImportedBonoConsumptionDates,
  ensureAppointmentGuestSupport,
  ensureAppointmentServicesTable,
  ensureAppointmentLegendTable,
  ensureAgendaBlocksTable,
  ensureAgendaDayNotesTable,
  ensureDashboardRemindersTable,
  ensurePendingPaymentsTable,
  ensurePendingPaymentCollectionsTable,
  ensureMultipleBonoSessionsPerAppointment,
  ensureDefaultAppointmentLegends
]

export const ensureSqliteCompatibilityMigrations = async (
  context: SqliteCompatibilityContext
) => {
  if (!isSqliteDatabase(context)) {
    return
  }

  const runtime = createSqliteCompatibilityRuntime(context)

  for (const step of sqliteCompatibilitySteps) {
    await step(runtime)
  }
}

export type { SqliteCompatibilityContext, SqliteCompatibilityRuntime, SqliteTableInfoRow }
