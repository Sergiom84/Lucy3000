import { useEffect, useState } from 'react'
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  Bell,
  ShoppingCart
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../utils/api'
import { formatCurrency, formatDate } from '../utils/format'

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Ventas Hoy',
      value: formatCurrency(stats?.today?.revenue || 0),
      subtitle: `${stats?.today?.salesCount || 0} ventas`,
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      title: 'Citas Hoy',
      value: stats?.today?.appointments || 0,
      subtitle: 'Programadas',
      icon: Calendar,
      color: 'bg-blue-500',
    },
    {
      title: 'Clientes',
      value: stats?.totals?.clients || 0,
      subtitle: 'Activos',
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      title: 'Stock Bajo',
      value: stats?.totals?.lowStockProducts || 0,
      subtitle: 'Productos',
      icon: AlertTriangle,
      color: 'bg-orange-500',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Resumen general de tu negocio
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <div key={index} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {stat.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stat.subtitle}
                </p>
              </div>
              <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
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
                        {appointment.client.firstName} {appointment.client.lastName}
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
                      {sale.client ? `${sale.client.firstName} ${sale.client.lastName}` : 'Cliente anónimo'}
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
    </div>
  )
}

