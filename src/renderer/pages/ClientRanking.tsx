import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '../utils/format'
import { buildSearchTokens, filterRankedItems } from '../utils/searchableOptions'

interface RankingClient {
  id: string
  name: string
  externalCode: string | null
  loyaltyPoints: number
  totalSpent: number
  pendingAmount: number
  noShowCount: number
  firstService: string | null
  lastService: string | null
  lastVisit: string | null
  visitRatio: number | null
  abandonmentRisk: boolean
  completedCount: number
}

interface ChartEntry {
  name: string
  value: number
}

interface RankingData {
  clients: RankingClient[]
  totalClients: number
  atRiskCount: number
  avgRevenue: number
  charts: {
    revenue: ChartEntry[]
    frequency: ChartEntry[]
    noShows: ChartEntry[]
  }
}

const CLIENT_SORT_OPTIONS = [
  { value: 'lastVisit', label: 'Última visita' },
  { value: 'name', label: 'Cliente' },
  { value: 'clientNumber', label: 'Nº cliente' },
  { value: 'totalSpent', label: 'Facturado' },
  { value: 'pendingAmount', label: 'Pendiente' }
] as const

type RankingSortBy = (typeof CLIENT_SORT_OPTIONS)[number]['value']
type RankingSortDirection = 'asc' | 'desc'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
const ROWS_PER_PAGE = 50

export default function ClientRanking() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [sortBy, setSortBy] = useState<RankingSortBy>('lastVisit')
  const [sortDirection, setSortDirection] = useState<RankingSortDirection>('desc')
  const [tablePage, setTablePage] = useState(1)

  useEffect(() => {
    loadRanking()
  }, [])

  const loadRanking = async () => {
    try {
      const res = await api.get('/ranking')
      setData(res.data)
    } catch {
      toast.error('Error al cargar ranking')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.clients
    if (search.trim()) {
      list = filterRankedItems(list, search, (client) => ({
        label: client.name,
        labelTokens: buildSearchTokens(client.name),
        searchText: [client.name, client.firstService, client.lastService].filter(Boolean).join(' ')
      }))
    }
    if (riskOnly) {
      list = list.filter(c => c.abandonmentRisk)
    }

    const getComparableValue = (client: RankingClient) => {
      switch (sortBy) {
        case 'lastVisit':
          return client.lastVisit ? new Date(client.lastVisit).getTime() : null
        case 'name':
          return client.name
        case 'clientNumber':
          return client.externalCode
        case 'pendingAmount':
          return client.pendingAmount
        case 'totalSpent':
        default:
          return client.totalSpent
      }
    }

    list = [...list].sort((a, b) => {
      const av = getComparableValue(a)
      const bv = getComparableValue(b)
      const aMissing = av === null || av === ''
      const bMissing = bv === null || bv === ''

      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1

      if (typeof av === 'string' && typeof bv === 'string') {
        const result = av.localeCompare(bv, 'es', { numeric: true, sensitivity: 'base' })
        return sortDirection === 'asc' ? result : -result
      }

      const result = Number(av) - Number(bv)
      return sortDirection === 'asc' ? result : -result
    })
    return list
  }, [data, riskOnly, search, sortBy, sortDirection])

  useEffect(() => {
    setTablePage(1)
  }, [riskOnly, search, sortBy, sortDirection])

  const totalRows = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE))
  const currentPage = Math.min(tablePage, totalPages)
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE
  const visibleClients = filtered.slice(startIndex, startIndex + ROWS_PER_PAGE)
  const showingFrom = totalRows === 0 ? 0 : startIndex + 1
  const showingTo = totalRows === 0 ? 0 : Math.min(startIndex + ROWS_PER_PAGE, totalRows)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!data) return null

  const renderDonut = (chartData: ChartEntry[], title: string) => (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            label={({ name, value }) => `${name}: ${value}`}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Ranking de Clientes
          </h1>
        </div>
      </div>

      {/* Donut Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderDonut(data.charts.revenue, 'Facturacion vs Media')}
        {renderDonut(data.charts.frequency, 'Frecuencia de Visita')}
        {renderDonut(data.charts.noShows, 'Faltas (No-Show)')}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-auto">
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Ordenar por
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  const nextSortBy = e.target.value as RankingSortBy
                  const nextSortDirection: RankingSortDirection =
                    nextSortBy === 'name' || nextSortBy === 'clientNumber' ? 'asc' : 'desc'
                  setSortBy(nextSortBy)
                  setSortDirection(nextSortDirection)
                }}
                className="input"
              >
                {CLIENT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Sentido
              </label>
              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as RankingSortDirection)}
                className="input"
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setRiskOnly(!riskOnly)}
            className={`btn ${riskOnly ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
          >
            {riskOnly ? 'Mostrando riesgo de abandono' : 'Filtrar riesgo de abandono'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Puntos</th>
              <th>Facturacion</th>
              <th>Ratio (dias)</th>
              <th>Primer Servicio</th>
              <th>Ultimo Servicio</th>
              <th>Faltas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibleClients.map((client, idx) => (
              <tr key={client.id}>
                <td className="text-gray-500">{startIndex + idx + 1}</td>
                <td>
                  <Link
                    to={`/clients/${client.id}`}
                    className="text-primary-600 hover:underline font-medium"
                  >
                    {client.name}
                  </Link>
                </td>
                <td>{client.loyaltyPoints}</td>
                <td className="font-semibold">{formatCurrency(client.totalSpent)}</td>
                <td>{client.visitRatio !== null ? client.visitRatio : '-'}</td>
                <td>{client.firstService ? formatDate(client.firstService) : '-'}</td>
                <td>{client.lastService ? formatDate(client.lastService) : '-'}</td>
                <td>{client.noShowCount}</td>
                <td>
                  {client.abandonmentRisk ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Riesgo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {visibleClients.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-500 py-8">
                  No se encontraron clientes
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Mostrando {showingFrom} - {showingTo} de {totalRows}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </button>
            <span className="text-xs sm:text-sm">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setTablePage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
