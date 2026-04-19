import { useEffect, useState } from 'react'
import {
  Calendar
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import DashboardReminderCard from '../components/DashboardReminderCard'
import Modal from '../components/Modal'
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

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showLowStockModal, setShowLowStockModal] = useState(false)
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [lowStockLoading, setLowStockLoading] = useState(false)

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get('/dashboard/stats')
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
      const response = await api.get('/products/low-stock')
      setLowStockProducts(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error fetching low stock products:', error)
      setLowStockProducts([])
    } finally {
      setLowStockLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const todayAppointmentsCount = stats?.today?.appointments || 0
  const lowStockProductsCount = stats?.totals?.lowStockProducts || 0

  const todayCardClassName = `card flex min-h-[10rem] flex-col justify-between p-4 xl:min-h-[10.5rem] ${
    todayAppointmentsCount > 0
      ? 'border-l-4 border-l-blue-500 bg-blue-50/70 shadow-[inset_6px_0_18px_-12px_rgba(59,130,246,0.95)] dark:border-l-blue-400 dark:bg-blue-950/20'
      : ''
  }`

  const lowStockCardClassName = `card flex min-h-[10rem] flex-col justify-between p-4 text-left transition-all xl:min-h-[10.5rem] ${
    lowStockProductsCount > 1
      ? 'border-l-4 border-l-orange-500 bg-orange-50/70 shadow-[inset_6px_0_18px_-12px_rgba(249,115,22,0.95)] hover:border-orange-500 hover:shadow-[inset_6px_0_18px_-12px_rgba(249,115,22,0.95),0_8px_24px_-12px_rgba(249,115,22,0.45)] dark:border-l-orange-400 dark:bg-orange-950/20'
      : 'hover:border-orange-400 hover:shadow-md'
  }`

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-[14rem_minmax(0,1fr)_14rem]">
        <div className={todayCardClassName}>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Citas Hoy
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {todayAppointmentsCount}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Programadas
            </p>
          </div>
        </div>

        <DashboardReminderCard />

        <button
          type="button"
          onClick={() => void handleOpenLowStockModal()}
          className={lowStockCardClassName}
        >
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Stock Bajo
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {lowStockProductsCount}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Productos
            </p>
          </div>
        </button>
      </div>

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Ventas Últimos 7 Días
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats?.salesChart || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#d946ef"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming Appointments */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Próximas Citas
          </h2>
          <div className="space-y-3">
            {stats?.upcomingAppointments?.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No hay citas programadas
              </p>
            ) : (
              stats?.upcomingAppointments?.map((appointment: any) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-primary-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {appointment.displayName || 'Cliente puntual'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {appointment.service.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(appointment.date)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {appointment.startTime}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Ventas Recientes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Número
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Cliente
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Fecha
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {stats?.recentSales?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay ventas recientes
                  </td>
                </tr>
              ) : (
                stats?.recentSales?.map((sale: any) => (
                  <tr
                    key={sale.id}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                      {sale.saleNumber}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                      {sale.displayName || 'Cliente anónimo'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(sale.date)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(sale.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                      <span className="font-medium text-orange-600 dark:text-orange-400">
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

