import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Search, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '../utils/format'

interface RankingClient {
  id: string
  name: string
  loyaltyPoints: number
  totalSpent: number
  noShowCount: number
  firstService: string | null
  lastService: string | null
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

type SortKey = 'loyaltyPoints' | 'totalSpent' | 'visitRatio' | 'noShowCount' | 'name'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
const ROWS_PER_PAGE = 50

export default function ClientRanking() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('totalSpent')
  const [sortAsc, setSortAsc] = useState(false)
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortAsc ? ' \u2191' : ' \u2193'
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.clients
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    if (riskOnly) {
      list = list.filter(c => c.abandonmentRisk)
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return list
  }, [data, search, riskOnly, sortKey, sortAsc])

  useEffect(() => {
    setTablePage(1)
  }, [search, riskOnly, sortKey, sortAsc])

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-500" />
            Ranking de Clientes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data.totalClients} clientes activos &middot; {data.atRiskCount} en riesgo de abandono
          </p>
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
        <div className="flex flex-col sm:flex-row gap-4 items-center">
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
          <button
            onClick={() => setRiskOnly(!riskOnly)}
            className={`btn ${riskOnly ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {riskOnly ? 'Mostrando Riesgo' : 'Filtrar Riesgo'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>#</th>
              <th className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                Cliente{sortIndicator('name')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => handleSort('loyaltyPoints')}>
                Puntos{sortIndicator('loyaltyPoints')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => handleSort('totalSpent')}>
                Facturacion{sortIndicator('totalSpent')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => handleSort('visitRatio')}>
                Ratio (dias){sortIndicator('visitRatio')}
              </th>
              <th>Primer Servicio</th>
              <th>Ultimo Servicio</th>
              <th className="cursor-pointer select-none" onClick={() => handleSort('noShowCount')}>
                Faltas{sortIndicator('noShowCount')}
              </th>
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
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertTriangle className="w-3 h-3" />
                      Riesgo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="w-3 h-3" />
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
