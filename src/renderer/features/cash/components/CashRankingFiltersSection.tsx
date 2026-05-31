import { useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'
import { paymentMethodLabel } from '../../../utils/tickets'
import type {
  CashClientOption,
  CashDateRange,
  CashFilters,
  CashProductOption,
  CashRanking,
  CashRankingGroup,
  CashServiceOption,
  CommercialPaymentMethod,
  Period
} from '../types'

type CashFilterChangeHandler = <Key extends keyof CashFilters>(key: Key, value: CashFilters[Key]) => void
type CashPeriodPreset = Exclude<Period, 'YEAR' | 'CUSTOM'>

type CashRankingFiltersSectionProps = {
  clientSearch: string
  clients: CashClientOption[]
  clientsLoading: boolean
  dateRange: CashDateRange
  filters: CashFilters
  onClearClientFilter: () => void
  onClientSearchChange: (value: string) => void
  onClientSearchFocus: () => void
  onClientSelect: (client: CashClientOption) => void
  onDateRangeChange: (field: keyof CashDateRange, value: string) => void
  onFilterChange: CashFilterChangeHandler
  onPeriodChange: (period: CashPeriodPreset) => void
  onResetFilters: () => void
  paymentMethods: readonly CommercialPaymentMethod[]
  period: Period
  products: CashProductOption[]
  ranking: CashRanking | null
  rankingGroups: CashRankingGroup[]
  services: CashServiceOption[]
}

const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/\.?0+$/, '')
}

const periodOptions: Array<{ label: string; value: CashPeriodPreset }> = [
  { value: 'DAY', label: 'Día' },
  { value: 'WEEK', label: 'Semanal' },
  { value: 'MONTH', label: 'Mensual' }
]

export default function CashRankingFiltersSection({
  clientSearch,
  clients,
  clientsLoading,
  dateRange,
  filters,
  onClearClientFilter,
  onClientSearchChange,
  onClientSearchFocus,
  onClientSelect,
  onDateRangeChange,
  onFilterChange,
  onPeriodChange,
  onResetFilters,
  paymentMethods,
  period,
  products,
  ranking,
  rankingGroups,
  services
}: CashRankingFiltersSectionProps) {
  const [clientOptionsOpen, setClientOptionsOpen] = useState(false)
  const selectedClientLabel =
    filters.clientId && clientSearch.trim()
      ? clientSearch
      : ''

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <div className="card space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ranking</h2>
        {rankingGroups.map((group) => (
          <div key={group.key} className="space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-white">{group.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Top 10</p>
                <div className="space-y-2">
                  {(ranking?.[group.key]?.top || []).map((item) => (
                    <div
                      key={`top-${group.key}-${item.id}`}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatQuantity(Number(item.quantity || 0))} uds · {formatCurrency(Number(item.revenue))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Bottom 10</p>
                <div className="space-y-2">
                  {(ranking?.[group.key]?.bottom || []).map((item) => (
                    <div
                      key={`bottom-${group.key}-${item.id}`}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatQuantity(Number(item.quantity || 0))} uds · {formatCurrency(Number(item.revenue))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          {periodOptions.map((item) => (
            <button
              key={item.value}
              onClick={() => onPeriodChange(item.value)}
              className={`btn ${period === item.value ? 'btn-primary' : 'btn-secondary'}`}
              type="button"
            >
              {item.label}
            </button>
          ))}

          <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-gray-600 dark:text-gray-400 sm:flex-none">
            Fecha inicio
            <input
              className={`input mt-1 text-sm ${period === 'CUSTOM' ? 'border-primary-500' : ''}`}
              onChange={(event) => onDateRangeChange('startDate', event.target.value)}
              type="date"
              value={dateRange.startDate}
            />
          </label>

          <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-gray-600 dark:text-gray-400 sm:flex-none">
            Fecha fin
            <input
              className={`input mt-1 text-sm ${period === 'CUSTOM' ? 'border-primary-500' : ''}`}
              onChange={(event) => onDateRangeChange('endDate', event.target.value)}
              type="date"
              value={dateRange.endDate}
            />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div
            className="relative"
            onBlur={() => {
              window.setTimeout(() => setClientOptionsOpen(false), 120)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={selectedClientLabel || clientSearch}
              onChange={(event) => {
                setClientOptionsOpen(true)
                onClientSearchChange(event.target.value)
              }}
              onFocus={() => {
                setClientOptionsOpen(true)
                onClientSearchFocus()
              }}
              className="input w-full pl-9 pr-9"
              placeholder="Todos los clientes"
            />
            {filters.clientId ? (
              <button
                type="button"
                onClick={onClearClientFilter}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Quitar cliente"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            {clientOptionsOpen ? (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {clientsLoading ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Cargando clientas...</div>
                ) : clients.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Sin resultados</div>
                ) : (
                  clients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onClientSelect(client)
                        setClientOptionsOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm transition hover:bg-primary-50 dark:hover:bg-gray-800"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {client.firstName} {client.lastName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <select
            value={filters.paymentMethod}
            onChange={(event) => onFilterChange('paymentMethod', event.target.value)}
            className="input"
          >
            <option value="">Todos los pagos</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {paymentMethodLabel(method)}
              </option>
            ))}
          </select>

          <select
            value={filters.serviceId}
            onChange={(event) => onFilterChange('serviceId', event.target.value)}
            className="input"
          >
            <option value="">Todos los tratamientos</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>

          <select
            value={filters.productId}
            onChange={(event) => onFilterChange('productId', event.target.value)}
            className="input"
          >
            <option value="">Todos los productos</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          <select
            value={filters.type}
            onChange={(event) => onFilterChange('type', event.target.value as CashFilters['type'])}
            className="input"
          >
            <option value="ALL">Todo</option>
            <option value="SERVICE">Tratamientos</option>
            <option value="PRODUCT">Productos</option>
          </select>

          <button onClick={onResetFilters} className="btn btn-secondary">
            <Filter className="w-4 h-4 mr-2" />
            Limpiar filtros
          </button>
        </div>
      </div>
    </div>
  )
}
