import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import DashboardReminderCard from '../components/DashboardReminderCard'
import Modal from '../components/Modal'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'

type LowStockProduct = {
  id: string
  name: string
  category: string
  stock: number
  minStock: number
  unit: string
}

type DashboardAppointment = {
  id: string
  date: string
  startTime: string | null
  displayName: string | null
  service?: {
    name: string | null
  } | null
}

type DashboardSale = {
  id: string
  saleNumber: string | number
  date: string
  total: number
  displayName: string | null
}

type DashboardSalesPoint = {
  date: string
  revenue: number
}

type DashboardStats = {
  today?: {
    appointments: number
    revenue: number
    salesCount: number
  }
  totals?: {
    lowStockProducts: number
  }
  upcomingAppointments?: DashboardAppointment[]
  recentSales?: DashboardSale[]
  salesChart?: DashboardSalesPoint[]
}

const ACCENT = '#9a5a63'
const INK_SUB = '#7a6b66'

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 6) return 'Buenas noches'
  if (hour < 14) return 'Buenos días'
  if (hour < 21) return 'Buenas tardes'

  return 'Buenas noches'
}

function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLowStockModal, setShowLowStockModal] = useState(false)
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [lowStockLoading, setLowStockLoading] = useState(false)

  useEffect(() => {
    void fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get<DashboardStats>('/dashboard/stats')
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenLowStockModal = async () => {
    setShowLowStockModal(true)

    try {
      setLowStockLoading(true)
      const response = await api.get<LowStockProduct[]>('/products/low-stock')
      setLowStockProducts(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error fetching low stock products:', error)
      setLowStockProducts([])
    } finally {
      setLowStockLoading(false)
    }
  }

  const firstName = useMemo(() => {
    if (!user?.name) return ''
    return user.name.split(' ')[0]
  }, [user?.name])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2"
          style={{ borderColor: ACCENT }}
        />
      </div>
    )
  }

  const todayAppointmentsCount = stats?.today?.appointments ?? 0
  const lowStockProductsCount = stats?.totals?.lowStockProducts ?? 0
  const todayRevenue = stats?.today?.revenue ?? null
  const upcomingAppointments = stats?.upcomingAppointments ?? []
  const recentSales = stats?.recentSales ?? []
  const salesChart = stats?.salesChart ?? []
  const serifStyle = { fontFamily: '"Cormorant Garamond", ui-serif, Georgia, serif' }

  return (
    <div className="animate-fade-in space-y-8">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
            {formatLongDate()}
          </p>
          <h1
            className="mt-2 text-5xl font-normal tracking-tight text-gray-900 dark:text-white md:text-6xl"
            style={{ ...serifStyle, lineHeight: 1 }}
          >
            {getGreeting()}
            {firstName ? (
              <>
                , <span className="italic" style={{ color: ACCENT }}>{firstName}</span>
              </>
            ) : null}
          </h1>
        </div>

        <Link
          to="/appointments"
          className="group inline-flex self-start rounded-sm bg-gray-900 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-white transition hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 md:self-auto"
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
            Nueva cita
          </span>
        </Link>
      </section>

      <section className="grid grid-cols-1 border-y border-gray-200 dark:border-gray-700 lg:grid-cols-3">
        <div className="relative p-6 lg:border-r lg:border-gray-200 lg:dark:border-gray-700">
          {todayAppointmentsCount > 0 ? (
            <span
              className="absolute bottom-6 left-0 top-6 w-[2px]"
              style={{ background: ACCENT }}
            />
          ) : null}
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            Citas hoy
          </p>
          <p
            className="mt-2 text-5xl font-normal tracking-tight text-gray-900 dark:text-white"
            style={{ ...serifStyle, lineHeight: 1 }}
          >
            {todayAppointmentsCount}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Programadas</p>
        </div>

        <div className="border-t border-gray-200 p-6 lg:border-r lg:border-t-0 lg:border-gray-200 lg:dark:border-gray-700 dark:border-gray-700">
          <div className="[&>.card]:min-h-0 [&>.card]:border-0 [&>.card]:bg-transparent [&>.card]:p-0 [&>.card]:shadow-none">
            <DashboardReminderCard />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleOpenLowStockModal()}
          className="relative border-t border-gray-200 p-6 text-left transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50 lg:border-t-0"
        >
          {lowStockProductsCount > 0 ? (
            <span
              className="absolute bottom-6 left-0 top-6 w-[2px]"
              style={{ background: ACCENT }}
            />
          ) : null}
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            Stock bajo
          </p>
          <p
            className="mt-2 text-5xl font-normal tracking-tight"
            style={{
              ...serifStyle,
              lineHeight: 1,
              color: lowStockProductsCount > 0 ? ACCENT : undefined,
            }}
          >
            {lowStockProductsCount}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Productos a reponer</p>
        </button>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                Ingresos
              </p>
              <h2
                className="mt-1 text-3xl font-normal tracking-tight text-gray-900 dark:text-white"
                style={serifStyle}
              >
                Últimos 7 días
              </h2>
            </div>
            {todayRevenue !== null ? (
              <div className="text-2xl font-normal text-gray-900 dark:text-white" style={serifStyle}>
                {formatCurrency(todayRevenue)}
                <span
                  className="ml-2 text-[11px] font-normal uppercase tracking-wider"
                  style={{ color: INK_SUB }}
                >
                  hoy
                </span>
              </div>
            ) : null}
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={salesChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="currentColor"
                  className="text-gray-100 dark:text-gray-700"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="currentColor"
                  className="text-gray-400"
                  tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-gray-400"
                  tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 2,
                    fontSize: 12,
                    fontFamily: 'Inter, sans-serif',
                  }}
                  labelStyle={{
                    color: INK_SUB,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                  formatter={(value: number | string) =>
                    typeof value === 'number' ? formatCurrency(value) : value
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  fill="url(#revenueGradient)"
                  dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: ACCENT, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                Agenda
              </p>
              <h2
                className="mt-1 text-3xl font-normal tracking-tight text-gray-900 dark:text-white"
                style={serifStyle}
              >
                Próximas citas
              </h2>
            </div>
            <Link
              to="/appointments"
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Ver todas <ArrowRight className="h-3 w-3" strokeWidth={1.6} />
            </Link>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {upcomingAppointments.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                No hay citas programadas
              </p>
            ) : (
              upcomingAppointments.map((appointment, index) => {
                const time = appointment.startTime ?? ''
                const [hours, minutes] = time.split(':')
                const showDivider = index < upcomingAppointments.length - 1

                return (
                  <div
                    key={appointment.id}
                    className={`flex items-center gap-4 px-5 py-4 ${
                      showDivider ? 'border-b border-gray-100 dark:border-gray-700' : ''
                    }`}
                  >
                    <div className="w-10 text-center">
                      <div
                        className="text-xl font-medium leading-none text-gray-900 dark:text-white"
                        style={serifStyle}
                      >
                        {hours || '--'}
                      </div>
                      <div className="mt-0.5 text-[9px] tracking-[0.1em] text-gray-500 dark:text-gray-400">
                        :{minutes || '--'}
                      </div>
                    </div>
                    <div className="h-7 w-px bg-gray-200 dark:bg-gray-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {appointment.displayName || 'Cliente puntual'}
                      </p>
                      <p className="mt-0.5 truncate text-xs italic text-gray-500 dark:text-gray-400">
                        {appointment.service?.name || 'Servicio sin asignar'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {formatDate(appointment.date)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
              Movimientos
            </p>
            <h2
              className="mt-1 text-3xl font-normal tracking-tight text-gray-900 dark:text-white"
              style={serifStyle}
            >
              Ventas recientes
            </h2>
          </div>
          <Link
            to="/sales"
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Ver todas <ArrowRight className="h-3 w-3" strokeWidth={1.6} />
          </Link>
        </div>

        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                  Nº
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                  Cliente
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                  Fecha
                </th>
                <th className="px-5 py-3 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    No hay ventas recientes
                  </td>
                </tr>
              ) : (
                recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-gray-100 transition last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-5 py-3 text-sm text-gray-900 dark:text-white">{sale.saleNumber}</td>
                    <td className="px-5 py-3 text-sm text-gray-900 dark:text-white">
                      {sale.displayName || 'Cliente anónimo'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(sale.date)}
                    </td>
                    <td
                      className="px-5 py-3 text-right text-base font-normal text-gray-900 dark:text-white"
                      style={serifStyle}
                    >
                      {formatCurrency(sale.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={showLowStockModal}
        onClose={() => setShowLowStockModal(false)}
        title="Productos con stock bajo"
        maxWidth="2xl"
      >
        {lowStockLoading ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Cargando productos...
          </div>
        ) : lowStockProducts.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No hay productos con stock bajo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="text-right">Stock actual</th>
                  <th className="text-right">Stock mínimo</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="min-w-[180px]">
                        <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{product.unit}</p>
                      </div>
                    </td>
                    <td>{product.category}</td>
                    <td className="text-right">
                      <span className="font-medium" style={{ color: ACCENT }}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="text-right">{product.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
