import { useState, useEffect } from 'react'
import {
  Filter,
  Maximize2,
  Minimize2
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RePieChart, Pie, Cell } from 'recharts'
import { paymentMethodLabel } from '../utils/tickets'
import { exportRawSalesReportWorkbook } from '../utils/exports'

interface DateRange {
  startDate: string
  endDate: string
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)

// Componente para tarjeta expandible
const ExpandableCard = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div className={`card transition-all duration-300 cursor-pointer hover:shadow-lg ${isExpanded ? 'col-span-1 lg:col-span-2' : ''}`} onClick={() => setIsExpanded(!isExpanded)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`font-semibold text-gray-900 dark:text-white ${isExpanded ? 'text-lg' : 'text-sm'}`}>
            {title}
          </h3>
        </div>
        <button 
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
        >
          {isExpanded ? (
            <Minimize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
      <div className={`${isExpanded ? 'block' : 'max-h-48 overflow-hidden'}`}>
        {children}
      </div>
    </div>
  )
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'clients' | 'products' | 'cash'>('overview')
  const [showLowStockProducts, setShowLowStockProducts] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  })
  const [loading, setLoading] = useState(false)

  // Reports data
  const [salesReport, setSalesReport] = useState<any>(null)
  const [clientReport, setClientReport] = useState<any>(null)
  const [productReport, setProductReport] = useState<any>(null)
  const [cashReport, setCashReport] = useState<any>(null)

  useEffect(() => {
    loadReports()
  }, [dateRange])

  const loadReports = async () => {
    setLoading(true)
    try {
      const [sales, clients, products, cash] = await Promise.all([
        api.get(`/reports/sales?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
        api.get('/reports/clients'),
        api.get('/reports/products'),
        api.get(`/reports/cash?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)
      ])

      setSalesReport(sales.data)
      setClientReport(clients.data)
      setProductReport(products.data)
      setCashReport(cash.data)
    } catch (error) {
      console.error('Error loading reports:', error)
      toast.error('Error al cargar reportes')
    } finally {
      setLoading(false)
    }
  }

  const setQuickDateRange = (days: number) => {
    const end = new Date()
    const start = subDays(end, days)
    setDateRange({
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    })
  }

  const setMonthRange = () => {
    setDateRange({
      startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    })
  }

  const exportReport = async () => {
    if (!salesReport) {
      toast.error('Todavía no hay datos para exportar')
      return
    }

    try {
      await exportRawSalesReportWorkbook({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        totalSales: Number(salesReport.totalSales || 0),
        collectedRevenue: Number(salesReport.collectedRevenue || 0),
        workPerformedRevenue: Number(salesReport.workPerformedRevenue || 0),
        paymentMethods: salesReport.paymentMethods || {}
      })
      toast.success('Resumen bruto exportado por fechas')
    } catch (error) {
      console.error('Report export error:', error)
      toast.error('No se pudo exportar el resumen de reportes')
    }
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  // Prepare chart data
  const paymentMethodsData = salesReport
    ? Object.entries(salesReport.paymentMethods)
        .map(([key, value]: any) => ({
        name: paymentMethodLabel(key),
        value: Number(value)
        }))
        .filter((entry) => entry.value > 0)
    : []

  const topProductsData = productReport?.topProducts.slice(0, 5).map((p: any) => ({
    name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
    ventas: p.totalSold,
    ingresos: Number(p.revenue)
  })) || []

  const topServicesData = salesReport?.topServices?.slice(0, 5).map((service: any) => ({
    name: service.name.length > 20 ? service.name.substring(0, 20) + '...' : service.name,
    ventas: service.quantity,
    ingresos: Number(service.revenue)
  })) || []

  const topClientsData = clientReport?.topClients.slice(0, 5).map((c: any) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
    gastado: Number(c.totalSpent),
    citas: c.appointmentCount
  })) || []

  const cashFlowData = cashReport ? [
    { name: 'Ingresos', monto: cashReport.totalIncome },
    { name: 'Gastos', monto: cashReport.totalExpenses },
    { name: 'Depósitos', monto: cashReport.totalDeposits },
    { name: 'Retiros', monto: cashReport.totalWithdrawals }
  ] : []

  const accountBalanceSummary = salesReport?.accountBalanceSummary || {
    topUpCount: 0,
    topUpTotal: 0,
    consumptionCount: 0,
    consumptionTotal: 0
  }

  const bonoSummary = salesReport?.bonoSummary || {
    consumedSessions: 0,
    consumedAmount: 0
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Reportes y Analytics
        </h1>

        <button
          onClick={() => void exportReport()}
          className="btn btn-secondary"
        >
          Exportar
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="label">Desde</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex-1">
            <label className="label">Hasta</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setQuickDateRange(7)} className="btn btn-secondary btn-sm">
              7 días
            </button>
            <button onClick={() => setQuickDateRange(30)} className="btn btn-secondary btn-sm">
              30 días
            </button>
            <button onClick={setMonthRange} className="btn btn-secondary btn-sm">
              Este mes
            </button>
            <button onClick={loadReports} className="btn btn-primary btn-sm">
              <Filter className="w-4 h-4 mr-2" />
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Resumen
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`btn ${activeTab === 'sales' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Ventas
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`btn ${activeTab === 'clients' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Clientes
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Productos
        </button>
        <button
          onClick={() => setActiveTab('cash')}
          className={`btn ${activeTab === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Flujo de Caja
        </button>
      </div>

      {loading ? (
        <div className="card">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando reportes...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ventas Totales</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {salesReport?.totalSales || 0}
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    {formatCurrency(Number(salesReport?.workPerformedRevenue || 0))}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Venta Promedio</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(Number(salesReport?.averageTicket || 0))}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Abono</span>
                  </div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Recargado</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(Number(accountBalanceSummary.topUpTotal || 0))}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {accountBalanceSummary.topUpCount || 0} movimientos
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-4">Consumido</p>
                  <p className="text-lg font-semibold text-red-600">
                    {formatCurrency(Number(accountBalanceSummary.consumptionTotal || 0))}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {accountBalanceSummary.consumptionCount || 0} usos
                  </p>
                </div>

                <div className="card">
                  <div className="mb-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Bono</span>
                  </div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Consumido</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {formatCurrency(Number(bonoSummary.consumedAmount || 0))}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {bonoSummary.consumedSessions || 0} usos
                  </p>
                </div>
              </div>

              {/* Expandable Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
                {/* Payment Methods Chart */}
                <ExpandableCard title="Ventas por Método de Pago">
                  {paymentMethodsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <RePieChart>
                        <Pie
                          data={paymentMethodsData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: €${entry.value.toFixed(0)}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {paymentMethodsData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                      </RePieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                      No hay cobros registrados en el periodo.
                    </div>
                  )}
                </ExpandableCard>

                {/* Cash Flow Chart */}
                <ExpandableCard title="Flujo de Caja">
                  {cashFlowData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={cashFlowData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                        <Bar dataKey="monto" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                      No hay movimientos de caja en el periodo.
                    </div>
                  )}
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Flujo Neto: {formatCurrency(Number(cashReport?.netCashFlow || 0))}
                    </p>
                  </div>
                </ExpandableCard>

                {/* Top Products Chart */}
                <ExpandableCard title="Productos Más Vendidos">
                  {topProductsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={topProductsData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} />
                        <Tooltip />
                        <Bar dataKey="ventas" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                      Todavía no hay productos vendidos.
                    </div>
                  )}
                </ExpandableCard>

                {/* Top Services Chart */}
                <ExpandableCard title="Tratamientos Más Vendidos">
                  {topServicesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={topServicesData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} />
                        <Tooltip />
                        <Bar dataKey="ventas" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                      Todavía no hay tratamientos vendidos.
                    </div>
                  )}
                </ExpandableCard>

                {/* Top Clients Chart */}
                <ExpandableCard title="Top Clientes">
                  {topClientsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={topClientsData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} />
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                        <Bar dataKey="gastado" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                      Todavía no hay clientes con gasto acumulado.
                    </div>
                  )}
                </ExpandableCard>
              </div>
            </div>
          )}

          {/* Sales Tab */}
          {activeTab === 'sales' && salesReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Ventas</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {salesReport.totalSales}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Cobrado real</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">
                    €{salesReport.collectedRevenue.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Trabajo realizado</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-600">
                    €{salesReport.workPerformedRevenue.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ticket Promedio</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    €{salesReport.averageTicket.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Distribución por Método de Pago
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(salesReport.paymentMethods).map(([method, amount]: any) => (
                    <div key={method} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {paymentMethodLabel(method)}
                      </p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        €{Number(amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Products */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Productos Más Vendidos
                </h3>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReport.topProducts.map((product: any, index: number) => (
                        <tr key={index}>
                          <td>{product.name}</td>
                          <td className="font-semibold">{product.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Clients Tab */}
          {activeTab === 'clients' && clientReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {clientReport.totalClients}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Gasto Total</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">
                    €{clientReport.totalSpent.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Gasto Promedio</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    €{clientReport.averageSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Top Clients */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Clientes Top por Gasto
                </h3>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Total Gastado</th>
                        <th>Puntos</th>
                        <th>Citas</th>
                        <th>Compras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientReport.topClients.map((client: any) => (
                        <tr key={client.id}>
                          <td className="font-semibold">{client.name}</td>
                          <td className="text-green-600">€{Number(client.totalSpent).toFixed(2)}</td>
                          <td>{client.loyaltyPoints}</td>
                          <td>{client.appointmentCount}</td>
                          <td>{client.saleCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {activeTab === 'products' && productReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Productos</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {productReport.totalProducts}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Valor Inventario</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">
                    €{productReport.totalValue.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Stock Bajo</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    {productReport.lowStockProducts.length}
                  </p>
                </div>
              </div>

              {/* Low Stock Alert */}
              {productReport.lowStockProducts.length > 0 && (
                <div className="card bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-red-900 dark:text-red-200">
                        Productos con Stock Bajo
                      </h3>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {productReport.lowStockProducts.length} productos pendientes de reposición
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLowStockProducts((current) => !current)}
                      className="btn btn-secondary btn-sm"
                    >
                      {showLowStockProducts ? 'Ocultar productos en stock' : 'Mostrar productos en stock'}
                    </button>
                  </div>

                  {showLowStockProducts && (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {productReport.lowStockProducts.map((product: any) => (
                        <div key={product.id} className="rounded-lg bg-white p-3 dark:bg-gray-800">
                          <p className="font-semibold text-gray-900 dark:text-white">{product.name}</p>
                          <p className="text-sm text-red-600">
                            Stock: {product.stock} / Mínimo: {product.minStock}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Top Products */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Productos Más Vendidos
                </h3>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Unidades Vendidas</th>
                        <th>Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productReport.topProducts.map((product: any) => (
                        <tr key={product.id}>
                          <td className="font-semibold">{product.name}</td>
                          <td>{product.totalSold}</td>
                          <td className="text-green-600">€{Number(product.revenue).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Cash Tab */}
          {activeTab === 'cash' && cashReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ingresos</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    €{cashReport.totalIncome.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Gastos</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    €{cashReport.totalExpenses.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Depósitos</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    €{cashReport.totalDeposits.toFixed(2)}
                  </p>
                </div>

                <div className="card">
                  <div className="mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Retiros</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">
                    €{cashReport.totalWithdrawals.toFixed(2)}
                  </p>
                </div>

                <div className="card bg-gradient-to-br from-blue-500 to-blue-600">
                  <div className="mb-2">
                    <span className="text-sm text-white opacity-90">Flujo Neto</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    €{cashReport.netCashFlow.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Cash Flow Chart */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Flujo de Caja Detallado
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `€${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="monto" fill="#3b82f6" name="Monto" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
