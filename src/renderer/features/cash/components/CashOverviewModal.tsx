import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '../../../components/Modal'
import { formatCurrency } from '../../../utils/format'
import type {
  CashOverview,
  CashOverviewDateRange,
  CashOverviewProfessionalRow,
  CashOverviewSalesRow
} from '../types'

type CashOverviewModalProps = {
  dateRange: CashOverviewDateRange
  isLoading: boolean
  isOpen: boolean
  onClose: () => void
  onDateRangeChange: (dateRange: CashOverviewDateRange) => void | Promise<void>
  overview: CashOverview | null
}

type OverviewTab = 'SALES' | 'PROFESSIONALS'
type DateSelectionMode = 'DAY' | 'RANGE'

type SummaryRow = {
  label: string
  value: string
  emphasis?: boolean
}

type DonutSegment = {
  label: string
  value: number
  color: string
}

const chartColors = ['#2f80ed', '#f2b33d', '#ef3b0f', '#16a34a', '#7c3aed', '#0891b2']

const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/\.?0+$/, '')
}

const formatDateInputValue = (date: Date) => format(date, 'yyyy-MM-dd')
const parseDateInputValue = (value: string) => new Date(`${value}T12:00:00`)

const formatSignedCurrency = (value: number) => {
  if (value > 0) return `+${formatCurrency(value)}`
  return formatCurrency(value)
}

function DateRangeSelector({
  dateRange,
  isLoading,
  onDateRangeChange
}: {
  dateRange: CashOverviewDateRange
  isLoading: boolean
  onDateRangeChange: (dateRange: CashOverviewDateRange) => void | Promise<void>
}) {
  const [mode, setMode] = useState<DateSelectionMode>(
    dateRange.startDate === dateRange.endDate ? 'DAY' : 'RANGE'
  )

  const applyDay = (day: string) => {
    if (!day) return
    void onDateRangeChange({ startDate: day, endDate: day })
  }

  const applyRange = (field: keyof CashOverviewDateRange, value: string) => {
    if (!value) return

    const nextRange = {
      ...dateRange,
      [field]: value
    }

    if (field === 'startDate' && value > nextRange.endDate) {
      nextRange.endDate = value
    }

    if (field === 'endDate' && value < nextRange.startDate) {
      nextRange.startDate = value
    }

    void onDateRangeChange(nextRange)
  }

  const shiftDays = (days: number) => {
    const startDate = formatDateInputValue(addDays(parseDateInputValue(dateRange.startDate), days))
    const endDate = formatDateInputValue(addDays(parseDateInputValue(dateRange.endDate), days))
    void onDateRangeChange({ startDate, endDate })
  }

  const goToday = () => {
    const today = formatDateInputValue(new Date())
    void onDateRangeChange({ startDate: today, endDate: today })
  }

  return (
    <section className="inline-flex max-w-[calc(100%-2.5rem)] rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid w-44 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-gray-900">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === 'DAY'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
            onClick={() => setMode('DAY')}
            type="button"
          >
            Día
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === 'RANGE'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
            onClick={() => setMode('RANGE')}
            type="button"
          >
            Rango
          </button>
        </div>
        <button
          aria-label="Día anterior"
          className="btn btn-secondary btn-sm px-2"
          disabled={isLoading}
          onClick={() => shiftDays(-1)}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="btn btn-secondary btn-sm min-w-[8rem] px-5"
          disabled={isLoading}
          onClick={goToday}
          type="button"
        >
          Hoy
        </button>
        <button
          aria-label="Día siguiente"
          className="btn btn-secondary btn-sm px-2"
          disabled={isLoading}
          onClick={() => shiftDays(1)}
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {mode === 'DAY' ? (
          <input
            className="input h-9 w-40 text-sm"
            disabled={isLoading}
            onChange={(event) => applyDay(event.target.value)}
            type="date"
            value={dateRange.startDate}
          />
        ) : (
          <div className="grid min-w-[20rem] gap-2 sm:grid-cols-2">
            <input
              className="input h-9 text-sm"
              disabled={isLoading}
              onChange={(event) => applyRange('startDate', event.target.value)}
              type="date"
              value={dateRange.startDate}
            />
            <input
              className="input h-9 text-sm"
              disabled={isLoading}
              onChange={(event) => applyRange('endDate', event.target.value)}
              type="date"
              value={dateRange.endDate}
            />
          </div>
        )}
      </div>
    </section>
  )
}

const formatPercent = (value: number, total: number) => {
  if (total <= 0) return '0,0 %'
  return `${((value / total) * 100).toFixed(1).replace('.', ',')} %`
}

const buildDonutGradient = (segments: DonutSegment[]) => {
  const visibleSegments = segments.filter((segment) => segment.value > 0)
  const total = visibleSegments.reduce((sum, segment) => sum + segment.value, 0)

  if (total <= 0) return '#e5e7eb'

  let cursor = 0
  const stops = visibleSegments.map((segment) => {
    const start = cursor
    const end = cursor + (segment.value / total) * 360
    cursor = end
    return `${segment.color} ${start}deg ${end}deg`
  })

  return `conic-gradient(${stops.join(', ')})`
}

function SummaryGroup({ rows, title }: { rows: SummaryRow[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-gray-900/40">
      <h3 className="bg-slate-500 px-3 py-1 text-center text-sm font-semibold text-white dark:bg-slate-600">
        {title}
      </h3>
      <div className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5">
            <span className={row.emphasis ? 'font-semibold text-slate-950 dark:text-white' : 'text-slate-700 dark:text-slate-200'}>
              {row.label}
            </span>
            <span
              className={
                row.emphasis
                  ? 'text-base font-bold tabular-nums text-slate-950 dark:text-white'
                  : 'font-medium tabular-nums text-slate-700 dark:text-slate-200'
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DonutChart({ centerLabel, segments }: { centerLabel: string; segments: DonutSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const gradient = buildDonutGradient(segments)

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className="flex h-40 w-40 items-center justify-center rounded-full p-5 shadow-inner"
        style={{ background: gradient }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center dark:bg-gray-800">
          <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(total)}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{centerLabel}</p>
      <div className="w-full space-y-1.5 text-xs">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
              {formatPercent(segment.value, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SalesAndServicesPanel({ rows, servicesAmount, productsAmount }: {
  productsAmount: number
  rows: CashOverviewSalesRow[]
  servicesAmount: number
}) {
  const segments = [
    { label: 'Ventas de servicios', value: servicesAmount, color: chartColors[0] },
    { label: 'Ventas de productos', value: productsAmount, color: chartColors[1] }
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="max-h-[27rem] overflow-auto">
          <table className="table min-w-full">
            <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No hay ventas ni servicios en el periodo.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index % 2 === 0 ? 'bg-slate-50/80 dark:bg-gray-900/30' : undefined}
                  >
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            row.itemType === 'SERVICE' ? 'bg-blue-500' : 'bg-amber-400'
                          }`}
                        />
                        <span className="truncate">{row.description}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(Number(row.quantity || 0))}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatCurrency(Number(row.amount || 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <DonutChart centerLabel="Distribución" segments={segments} />
      </div>
    </div>
  )
}

function ProfessionalPanel({ professionals }: { professionals: CashOverviewProfessionalRow[] }) {
  const segments = professionals.map((row, index) => ({
    label: row.name,
    value: Number(row.amount || 0),
    color: chartColors[index % chartColors.length]
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="table min-w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Esteticista</th>
              <th className="px-3 py-2 text-right">Servicios*</th>
              <th className="px-3 py-2 text-right">Facturado</th>
            </tr>
          </thead>
          <tbody>
            {professionals.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-slate-500 dark:text-slate-400">
                  No hay profesionales en el periodo.
                </td>
              </tr>
            ) : (
              professionals.map((row) => (
                <tr key={row.name}>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(Number(row.services || 0))}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatCurrency(Number(row.amount || 0))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex min-h-[21rem] items-center justify-center rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <DonutChart centerLabel="Distribución de facturación" segments={segments} />
      </div>
    </div>
  )
}

export default function CashOverviewModal({
  dateRange,
  isLoading,
  isOpen,
  onClose,
  onDateRangeChange,
  overview
}: CashOverviewModalProps) {
  const [activeTab, setActiveTab] = useState<OverviewTab>('SALES')

  const summaryGroups = useMemo(() => {
    if (!overview) return []

    return [
      {
        title: 'Facturación y cobros',
        rows: [
          { label: 'Facturado', value: formatCurrency(Number(overview.summary.billing.billed || 0)) },
          { label: 'Total Cobrado', value: formatCurrency(Number(overview.summary.billing.totalCollected || 0)) }
        ]
      },
      {
        title: 'Formas de pago',
        rows: [
          { label: 'Efectivo', value: formatCurrency(Number(overview.summary.paymentMethods.cash || 0)) },
          { label: 'Tarjeta', value: formatCurrency(Number(overview.summary.paymentMethods.card || 0)) },
          { label: 'Otros', value: formatCurrency(Number(overview.summary.paymentMethods.other || 0)) },
          { label: 'Pendiente actual', value: formatCurrency(Number(overview.summary.paymentMethods.pendingCurrent || 0)) },
          { label: 'Contra Abonos', value: formatCurrency(Number(overview.summary.paymentMethods.accountBalance || 0)) }
        ]
      },
      {
        title: 'Tipo de servicios',
        rows: [
          { label: 'Con descuentos', value: formatCurrency(Number(overview.summary.serviceTypes.withDiscounts || 0)) },
          { label: 'Sin cargo', value: `${formatQuantity(Number(overview.summary.serviceTypes.freeOfChargeCount || 0))} uds` },
          { label: 'Abonos', value: formatCurrency(Number(overview.summary.serviceTypes.topUps || 0)) },
          { label: 'Con cobro de pdtes', value: formatCurrency(Number(overview.summary.serviceTypes.pendingCollections || 0)) },
          { label: 'Con amortizados', value: `${formatQuantity(Number(overview.summary.serviceTypes.amortizedCount || 0))} uds` }
        ]
      },
      {
        title: 'Caja',
        rows: [
          { label: 'Cambio inicial', value: formatCurrency(Number(overview.summary.cash.openingBalance || 0)) },
          { label: 'Movimientos de caja', value: formatSignedCurrency(Number(overview.summary.cash.manualMovements || 0)) },
          {
            label: 'Efectivo en caja',
            value: formatCurrency(Number(overview.summary.cash.currentCash || 0)),
            emphasis: true
          }
        ]
      }
    ]
  }, [overview])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Resumen de caja" maxWidth="6xl" hideTitle>
      {isLoading && !overview ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando resumen...</p>
      ) : !overview ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hay datos de resumen disponibles.</p>
      ) : (
        <div className="space-y-3">
          <DateRangeSelector
            dateRange={dateRange}
            isLoading={isLoading}
            onDateRangeChange={onDateRangeChange}
          />

          <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="space-y-2.5">
              {summaryGroups.map((group) => (
                <SummaryGroup key={group.title} rows={group.rows} title={group.title} />
              ))}
            </aside>

            <section className="min-w-0 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-gray-800">
              <div className="flex items-center border-b border-slate-200 dark:border-slate-700">
                <button
                  className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab === 'SALES'
                      ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                  onClick={() => setActiveTab('SALES')}
                  type="button"
                >
                  Ventas y Servicios
                </button>
                <button
                  className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab === 'PROFESSIONALS'
                      ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                  onClick={() => setActiveTab('PROFESSIONALS')}
                  type="button"
                >
                  Por profesional
                </button>
              </div>

              <div className="p-3">
                {activeTab === 'SALES' ? (
                  <SalesAndServicesPanel
                    productsAmount={Number(overview.distribution.productsAmount || 0)}
                    rows={overview.salesAndServices}
                    servicesAmount={Number(overview.distribution.servicesAmount || 0)}
                  />
                ) : (
                  <ProfessionalPanel professionals={overview.professionals} />
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </Modal>
  )
}
