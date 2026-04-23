import { Edit } from 'lucide-react'
import {
  CASH_COUNT_DENOMINATIONS
} from '../../../utils/cashCount'
import { formatCurrency } from '../../../utils/format'
import { paymentMethodLabel } from '../../../utils/tickets'
import type { CashSummaryPeriodTotals, CommercialPaymentMethod, LastClosure } from '../types'

type CashSummarySectionProps = {
  canEditOpeningBalance: boolean
  currentCashBalance: number
  incomeCards: CashSummaryPeriodTotals
  lastClosure: LastClosure | null
  onEditOpeningBalance: () => void
  onOpenCashWithInheritedFloat: () => void
  onOpenCashWithOtherAmount: (amount: number) => void
  openingBalanceAmount: number
  openingWithInheritedSaving: boolean
  paymentMethods: readonly CommercialPaymentMethod[]
  paymentsByMethod: Record<string, number>
  workPerformedCards: CashSummaryPeriodTotals
}

type CashMetricCardProps = {
  title: string
  values: CashSummaryPeriodTotals
}

function CashMetricCard({ title, values }: CashMetricCardProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">{title}</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Día</span>
          <strong>{formatCurrency(Number(values.day || 0))}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Mes</span>
          <strong>{formatCurrency(Number(values.month || 0))}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Año</span>
          <strong>{formatCurrency(Number(values.year || 0))}</strong>
        </div>
      </div>
    </div>
  )
}

export default function CashSummarySection({
  canEditOpeningBalance,
  currentCashBalance,
  incomeCards,
  lastClosure,
  onEditOpeningBalance,
  onOpenCashWithInheritedFloat,
  onOpenCashWithOtherAmount,
  openingBalanceAmount,
  openingWithInheritedSaving,
  paymentMethods,
  paymentsByMethod,
  workPerformedCards
}: CashSummarySectionProps) {
  return (
    <>
      {!canEditOpeningBalance && lastClosure && (
        <div className="card border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                Último fondo guardado
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-indigo-900 dark:text-indigo-100">
                {formatCurrency(Number(lastClosure.nextDayFloat || 0))}
              </p>
              <p className="mt-1 text-xs text-indigo-700/80 dark:text-indigo-300/80">
                {lastClosure.closedAt
                  ? `Dejado en caja al cerrar el ${new Date(lastClosure.closedAt).toLocaleDateString()}`
                  : 'Fondo pendiente de heredar'}
              </p>
              {Object.keys(lastClosure.nextDayFloatDenominations || {}).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {CASH_COUNT_DENOMINATIONS.filter(
                    (denomination) => (lastClosure.nextDayFloatDenominations?.[denomination.key] || 0) > 0
                  ).map((denomination) => (
                    <span
                      key={denomination.key}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-800 dark:border-indigo-900/70 dark:bg-indigo-950/40 dark:text-indigo-200"
                    >
                      <span className="tabular-nums">
                        {lastClosure.nextDayFloatDenominations[denomination.key]}
                      </span>
                      <span className="text-indigo-400 dark:text-indigo-500">×</span>
                      <span>{denomination.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 md:w-60">
              <button
                onClick={onOpenCashWithInheritedFloat}
                className="btn btn-primary w-full"
                disabled={openingWithInheritedSaving}
                type="button"
              >
                {openingWithInheritedSaving ? 'Abriendo...' : 'Abrir caja con fondo heredado'}
              </button>
              <button
                onClick={() => onOpenCashWithOtherAmount(lastClosure.nextDayFloat || 0)}
                className="btn btn-secondary w-full"
                type="button"
              >
                Abrir con otro importe
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Saldo inicial</span>
            <div className="flex items-center gap-2">
              {canEditOpeningBalance && (
                <button
                  onClick={onEditOpeningBalance}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Editar saldo inicial"
                >
                  <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(Number(openingBalanceAmount || 0))}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Pagos por método</span>
          </div>
          <div className="space-y-1 text-sm">
            {paymentMethods.map((method) => (
              <div key={method} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{paymentMethodLabel(method)}</span>
                <strong>{formatCurrency(Number(paymentsByMethod[method] || 0))}</strong>
              </div>
            ))}
          </div>
        </div>

        <CashMetricCard title="Cobrado real" values={incomeCards} />
        <CashMetricCard title="Trabajo realizado" values={workPerformedCards} />

        <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Saldo actual</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(Number(currentCashBalance || 0))}</p>
        </div>
      </div>
    </>
  )
}
