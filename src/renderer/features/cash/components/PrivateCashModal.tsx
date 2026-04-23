import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '../../../components/Modal'
import { calendarWeekDays, formatCalendarText } from '../../../utils/calendarLocale'
import { formatCurrency } from '../../../utils/format'
import type { PrivateCashRow, PrivateDateRange, PrivateRangePreset } from '../types'

type PrivateCashModalProps = {
  calendarDate: Date
  calendarDays: Date[]
  calendarMonth: Date
  dateRange: PrivateDateRange
  isLoading: boolean
  isOpen: boolean
  onCalendarDaySelect: (date: Date) => void
  onClose: () => void
  onDateRangeChange: (field: 'startDate' | 'endDate', value: string) => void
  onNextMonth: () => void
  onPrevMonth: () => void
  onRangePresetChange: (preset: Exclude<PrivateRangePreset, 'CUSTOM'>) => void
  rangePreset: PrivateRangePreset
  rangeTitle: string
  rows: PrivateCashRow[]
  totalAmount: number
}

const parseDateInput = (value: string) => new Date(`${value}T12:00:00`)

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const isSameMonth = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()

export default function PrivateCashModal({
  calendarDate,
  calendarDays,
  calendarMonth,
  dateRange,
  isLoading,
  isOpen,
  onCalendarDaySelect,
  onClose,
  onDateRangeChange,
  onNextMonth,
  onPrevMonth,
  onRangePresetChange,
  rangePreset,
  rangeTitle,
  rows,
  totalAmount
}: PrivateCashModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cobros privados" maxWidth="4xl">
      <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-900/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Rango seleccionado
                </p>
                <p className="mt-1 text-xl font-bold capitalize text-slate-900 dark:text-slate-100">
                  {rangeTitle}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {rows.length} {rows.length === 1 ? 'cobro' : 'cobros'} · Total {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'DAY', label: 'Día' },
                  { key: 'WEEK', label: 'Semana' },
                  { key: 'MONTH', label: 'Mes' }
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onRangePresetChange(option.key)}
                    className={`btn ${rangePreset === option.key ? 'btn-primary' : 'btn-secondary'} h-9 px-3 text-xs`}
                    disabled={isLoading}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Desde
                </span>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(event) => onDateRangeChange('startDate', event.target.value)}
                  className="input"
                  disabled={isLoading}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Hasta
                </span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(event) => onDateRangeChange('endDate', event.target.value)}
                  className="input"
                  disabled={isLoading}
                />
              </label>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onPrevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                title="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-xs font-semibold capitalize tracking-[0.08em] text-slate-700 dark:text-slate-200">
                {formatCalendarText(calendarMonth, 'MMMM YYYY')}
              </p>
              <button
                type="button"
                onClick={onNextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                title="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarWeekDays.map((weekday) => (
                <span
                  key={weekday}
                  className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"
                >
                  {weekday}
                </span>
              ))}
              {calendarDays.map((day) => {
                const isCurrentMonth = isSameMonth(day, calendarMonth)
                const isSelectedDay = isSameDay(day, calendarDate)
                const isToday = isSameDay(day, new Date())

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => onCalendarDaySelect(day)}
                    className={`h-8 rounded-lg text-[11px] font-semibold transition ${
                      isSelectedDay
                        ? 'bg-primary-600 text-white'
                        : isToday
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : isCurrentMonth
                            ? 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
                            : 'text-slate-400 hover:bg-white/70 dark:text-slate-600 dark:hover:bg-slate-800'
                    }`}
                    disabled={isLoading}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </aside>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-900/50">
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Total rango
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Cobros
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Desde
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatCalendarText(parseDateInput(dateRange.startDate), 'dddd D [de] MMMM')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Hasta
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatCalendarText(parseDateInput(dateRange.endDate), 'dddd D [de] MMMM')}
              </p>
            </div>
          </div>

          <div className="max-h-[30rem] overflow-y-auto space-y-3 pr-1">
            {isLoading ? (
              <div className="rounded-lg border border-slate-200 py-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Cargando cobros privados...
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 py-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No hay cobros privados en el rango seleccionado.
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.1fr_1fr_0.9fr_0.7fr]">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Cliente</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{row.clientName}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.professionalName}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tratamiento</p>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{row.treatmentName}</p>
                      {row.description ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.description}</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Pago</p>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{row.paymentDetail}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Día</p>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{new Date(row.date).toLocaleString()}</p>
                      <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400">{row.saleNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Cuantía</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(Number(row.amount))}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
