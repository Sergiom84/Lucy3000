import { useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  DollarSign,
  Filter,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingBag,
  Unlock,
  Edit
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'
import { paymentMethodLabel } from '../utils/tickets'

type Period = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

type CashRegister = {
  id: string
  openingBalance: number
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  movements: Array<{
    id: string
    type: 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'
    paymentMethod?: string | null
    amount: number
    category: string
    description: string
    user: {
      name: string
    }
  }>
}

export default function Cash() {
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [analyticsRows, setAnalyticsRows] = useState<any[]>([])
  const [ranking, setRanking] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const [openCashModal, setOpenCashModal] = useState(false)
  const [closeCashModal, setCloseCashModal] = useState(false)
  const [movementModal, setMovementModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [privatePinModal, setPrivatePinModal] = useState(false)
  const [privateCashModal, setPrivateCashModal] = useState(false)
  const [privatePinInput, setPrivatePinInput] = useState('')
  const [privateCashRows, setPrivateCashRows] = useState<any[]>([])
  const [privateCashTotal, setPrivateCashTotal] = useState(0)
  const [privateCashLoading, setPrivateCashLoading] = useState(false)
  const [cashHistory, setCashHistory] = useState<any[]>([])
  const [editOpeningBalanceModal, setEditOpeningBalanceModal] = useState(false)

  const [openingBalance, setOpeningBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [closeNotes, setCloseNotes] = useState('')

  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'>('EXPENSE')
  const [movementPaymentMethod, setMovementPaymentMethod] = useState<'CASH' | 'CARD' | 'BIZUM' | 'OTHER' | ''>('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementCategory, setMovementCategory] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [movementReference, setMovementReference] = useState('')

  const [newOpeningBalance, setNewOpeningBalance] = useState('')
  const [editOpeningNotes, setEditOpeningNotes] = useState('')

  const [period, setPeriod] = useState<Period>('DAY')
  const [filters, setFilters] = useState({
    clientId: '',
    serviceId: '',
    productId: '',
    paymentMethod: '',
    type: 'ALL' as 'ALL' | 'SERVICE' | 'PRODUCT'
  })

  useEffect(() => {
    void Promise.all([loadActiveCashRegister(), loadSummary(), loadFilterOptions()])
  }, [])

  useEffect(() => {
    void Promise.all([loadAnalytics(), loadRanking()])
  }, [period, filters])

  const loadActiveCashRegister = async () => {
    try {
      const response = await api.get('/cash?status=OPEN')
      setActiveCashRegister(response.data[0] || null)
    } catch (error) {
      toast.error('No se pudo cargar la caja activa')
    }
  }

  const loadSummary = async () => {
    try {
      const response = await api.get('/cash/summary')
      setSummary(response.data)
      setActiveCashRegister(response.data.activeCashRegister || null)
    } catch (error) {
      toast.error('No se pudo cargar el resumen de caja')
    }
  }

  const loadFilterOptions = async () => {
    try {
      const [clientsRes, servicesRes, productsRes] = await Promise.all([
        api.get('/clients?isActive=true'),
        api.get('/services?isActive=true'),
        api.get('/products?isActive=true')
      ])
      setClients(clientsRes.data)
      setServices(servicesRes.data)
      setProducts(productsRes.data)
    } catch (error) {
      toast.error('No se pudieron cargar los filtros de caja')
    }
  }

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true)
      const response = await api.get('/cash/analytics', {
        params: {
          period,
          ...filters,
          clientId: filters.clientId || undefined,
          serviceId: filters.serviceId || undefined,
          productId: filters.productId || undefined,
          paymentMethod: filters.paymentMethod || undefined
        }
      })
      setAnalyticsRows(response.data.rows)
    } catch (error) {
      toast.error('No se pudo cargar la analítica de caja')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadRanking = async () => {
    try {
      const response = await api.get('/cash/analytics/ranking', {
        params: {
          period,
          ...filters,
          clientId: filters.clientId || undefined,
          serviceId: filters.serviceId || undefined,
          productId: filters.productId || undefined,
          paymentMethod: filters.paymentMethod || undefined
        }
      })
      setRanking(response.data)
    } catch (error) {
      toast.error('No se pudo cargar el ranking')
    }
  }

  const loadCashHistory = async () => {
    try {
      const response = await api.get('/cash')
      setCashHistory(response.data)
      setHistoryModal(true)
    } catch (error) {
      toast.error('No se pudo cargar el historial de caja')
    }
  }

  const loadPrivateNoTicketCash = async () => {
    try {
      setPrivateCashLoading(true)
      const response = await api.get('/cash/private/no-ticket-cash', {
        params: {
          pin: privatePinInput
        }
      })
      setPrivateCashRows(response.data.rows || [])
      setPrivateCashTotal(Number(response.data.totalAmount || 0))
      setPrivatePinModal(false)
      setPrivateCashModal(true)
      setPrivatePinInput('')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo abrir la sección privada')
    } finally {
      setPrivateCashLoading(false)
    }
  }

  const handleOpenCash = async () => {
    try {
      await api.post('/cash/open', {
        openingBalance: Number(openingBalance),
        notes: openNotes || null
      })
      toast.success('Caja abierta')
      setOpenCashModal(false)
      setOpeningBalance('')
      setOpenNotes('')
      await Promise.all([loadActiveCashRegister(), loadSummary()])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo abrir la caja')
    }
  }

  const handleCloseCash = async () => {
    if (!activeCashRegister) return

    try {
      await api.post(`/cash/${activeCashRegister.id}/close`, {
        closingBalance: Number(closingBalance),
        notes: closeNotes || null
      })
      toast.success('Caja cerrada')
      setCloseCashModal(false)
      setClosingBalance('')
      setCloseNotes('')
      await Promise.all([loadActiveCashRegister(), loadSummary(), loadCashHistory()])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo cerrar la caja')
    }
  }

  const handleAddMovement = async () => {
    if (!activeCashRegister) return

    try {
      await api.post(`/cash/${activeCashRegister.id}/movements`, {
        type: movementType,
        paymentMethod: movementType === 'INCOME' ? movementPaymentMethod || null : null,
        amount: Number(movementAmount),
        category: movementCategory,
        description: movementDescription,
        reference: movementReference || null
      })
      toast.success('Movimiento registrado')
      setMovementModal(false)
      setMovementPaymentMethod('')
      setMovementAmount('')
      setMovementCategory('')
      setMovementDescription('')
      setMovementReference('')
      await Promise.all([loadActiveCashRegister(), loadSummary()])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo registrar el movimiento')
    }
  }

  const handleEditOpeningBalance = async () => {
    if (!activeCashRegister) return

    try {
      await api.put(`/cash/${activeCashRegister.id}/opening-balance`, {
        openingBalance: Number(newOpeningBalance),
        notes: editOpeningNotes || null
      })
      toast.success('Saldo inicial actualizado')
      setEditOpeningBalanceModal(false)
      setNewOpeningBalance('')
      setEditOpeningNotes('')
      await Promise.all([loadActiveCashRegister(), loadSummary()])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar el saldo inicial')
    }
  }

  const paymentsByMethod = summary?.cards?.paymentsByMethod || {}
  const incomeCards = summary?.cards?.income || { day: 0, month: 0, year: 0 }

  const currentCashBalance = summary?.cards?.currentBalance || 0

  const rankingGroups = useMemo(
    () => [
      { key: 'services', title: 'Tratamientos' },
      { key: 'products', title: 'Productos' }
    ],
    []
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Caja</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Resumen operativo y analítica por periodos.
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => void loadCashHistory()} className="btn btn-secondary">
            <Receipt className="w-4 h-4 mr-2" />
            Historial
          </button>
          <button onClick={() => setPrivatePinModal(true)} className="btn btn-secondary" title="Sección privada">
            <Settings className="w-4 h-4 mr-2" />
            Privado
          </button>
          {!activeCashRegister ? (
            <button onClick={() => setOpenCashModal(true)} className="btn btn-primary">
              <Unlock className="w-4 h-4 mr-2" />
              Abrir caja
            </button>
          ) : (
            <>
              <button onClick={() => setMovementModal(true)} className="btn btn-secondary">
                <Plus className="w-4 h-4 mr-2" />
                Movimiento
              </button>
              <button onClick={() => setCloseCashModal(true)} className="btn btn-primary">
                <Lock className="w-4 h-4 mr-2" />
                Cerrar caja
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Saldo inicial</span>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              {activeCashRegister && (
                <button
                  onClick={() => {
                    setNewOpeningBalance(String(activeCashRegister.openingBalance))
                    setEditOpeningNotes('')
                    setEditOpeningBalanceModal(true)
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Editar saldo inicial"
                >
                  <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(Number(summary?.cards?.openingBalance || 0))}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Pagos por método</span>
            <CreditCard className="w-5 h-5 text-purple-600" />
          </div>
          <div className="space-y-1 text-sm">
            {(['CASH', 'CARD', 'BIZUM', 'OTHER'] as const).map((method) => (
              <div key={method} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{paymentMethodLabel(method)}</span>
                <strong>{formatCurrency(Number(paymentsByMethod[method] || 0))}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Ingresos</span>
            <ShoppingBag className="w-5 h-5 text-green-600" />
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Día</span>
              <strong>{formatCurrency(Number(incomeCards.day || 0))}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Mes</span>
              <strong>{formatCurrency(Number(incomeCards.month || 0))}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Año</span>
              <strong>{formatCurrency(Number(incomeCards.year || 0))}</strong>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Saldo actual</span>
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(Number(currentCashBalance || 0))}</p>
          <p className="text-xs opacity-80 mt-2">
            Saldo inicial + ventas en efectivo + depósitos - gastos - retiros
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movimientos unificados</h2>
          <button
            onClick={() => void Promise.all([loadAnalytics(), loadRanking(), loadActiveCashRegister(), loadSummary()])}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </button>
        </div>

        {analyticsLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando movimientos...</p>
        ) : (
          <div className="overflow-x-auto max-h-[30rem]">
            <table className="table min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left min-w-[16rem]">Nombre y apellidos</th>
                  <th className="px-4 py-3 text-left min-w-[14rem]">Concepto</th>
                  <th className="px-4 py-3 text-left min-w-[7rem]">Pago</th>
                  <th className="px-4 py-3 text-left min-w-[8rem]">Importe</th>
                  <th className="px-4 py-3 text-left min-w-[12rem]">Profesional</th>
                  <th className="px-4 py-3 text-left min-w-[8rem]">Nº venta</th>
                </tr>
              </thead>
              <tbody>
                {analyticsRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No hay resultados para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  analyticsRows.map((row) => (
                    <tr key={`${row.saleId}-${row.concept}-${row.amount}-${row.quantity}`} className="align-top">
                      <td className="px-4 py-3">{row.clientName}</td>
                      <td className="px-4 py-3">{row.concept}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{paymentMethodLabel(row.paymentMethod)}</td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatCurrency(Number(row.amount))}</td>
                      <td className="px-4 py-3">{row.professionalName}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{row.saleNumber}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                    {(ranking?.[group.key]?.top || []).map((item: any) => (
                      <div key={`top-${group.key}-${item.id}`} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.quantity} uds · {formatCurrency(Number(item.revenue))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Bottom 10</p>
                  <div className="space-y-2">
                    {(ranking?.[group.key]?.bottom || []).map((item: any) => (
                      <div key={`bottom-${group.key}-${item.id}`} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.quantity} uds · {formatCurrency(Number(item.revenue))}
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
          <div className="flex gap-2 flex-wrap">
            {(['DAY', 'WEEK', 'MONTH', 'YEAR'] as Period[]).map((item) => (
              <button
                key={item}
                onClick={() => setPeriod(item)}
                className={`btn ${period === item ? 'btn-primary' : 'btn-secondary'}`}
              >
                {item === 'DAY' ? 'Día' : item === 'WEEK' ? 'Semanal' : item === 'MONTH' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <select
              value={filters.clientId}
              onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value }))}
              className="input"
            >
              <option value="">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </select>

            <select
              value={filters.paymentMethod}
              onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}
              className="input"
            >
              <option value="">Todos los pagos</option>
              {(['CASH', 'CARD', 'BIZUM', 'OTHER'] as const).map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel(method)}
                </option>
              ))}
            </select>

            <select
              value={filters.serviceId}
              onChange={(event) => setFilters((current) => ({ ...current, serviceId: event.target.value }))}
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
              onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}
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
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as 'ALL' | 'SERVICE' | 'PRODUCT' }))}
              className="input"
            >
              <option value="ALL">Todo</option>
              <option value="SERVICE">Tratamientos</option>
              <option value="PRODUCT">Productos</option>
            </select>

            <button
              onClick={() =>
                setFilters({
                  clientId: '',
                  serviceId: '',
                  productId: '',
                  paymentMethod: '',
                  type: 'ALL'
                })
              }
              className="btn btn-secondary"
            >
              <Filter className="w-4 h-4 mr-2" />
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      <Modal isOpen={openCashModal} onClose={() => setOpenCashModal(false)} title="Abrir caja">
        <div className="space-y-4">
          <input
            type="number"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            className="input"
            placeholder="Saldo inicial"
          />
          <textarea
            value={openNotes}
            onChange={(event) => setOpenNotes(event.target.value)}
            className="input resize-none"
            rows={3}
            placeholder="Notas de apertura"
          />
          <button onClick={() => void handleOpenCash()} className="btn btn-primary w-full" disabled={!openingBalance}>
            Abrir caja
          </button>
        </div>
      </Modal>

      <Modal isOpen={closeCashModal} onClose={() => setCloseCashModal(false)} title="Cerrar caja">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">
            Saldo esperado: <strong>{formatCurrency(Number(currentCashBalance || 0))}</strong>
          </div>
          <input
            type="number"
            step="0.01"
            value={closingBalance}
            onChange={(event) => setClosingBalance(event.target.value)}
            className="input"
            placeholder="Saldo de cierre"
          />
          <textarea
            value={closeNotes}
            onChange={(event) => setCloseNotes(event.target.value)}
            className="input resize-none"
            rows={3}
            placeholder="Notas de cierre"
          />
          <button onClick={() => void handleCloseCash()} className="btn btn-primary w-full" disabled={!closingBalance}>
            Cerrar caja
          </button>
        </div>
      </Modal>

      <Modal isOpen={editOpeningBalanceModal} onClose={() => setEditOpeningBalanceModal(false)} title="Editar Saldo Inicial">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">
            Saldo actual: <strong>{formatCurrency(Number(activeCashRegister?.openingBalance || 0))}</strong>
          </div>
          <input
            type="number"
            step="0.01"
            value={newOpeningBalance}
            onChange={(event) => setNewOpeningBalance(event.target.value)}
            className="input"
            placeholder="Nuevo saldo inicial"
          />
          <textarea
            value={editOpeningNotes}
            onChange={(event) => setEditOpeningNotes(event.target.value)}
            className="input resize-none"
            rows={3}
            placeholder="Notas sobre el ajuste"
          />
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
            <p className="text-blue-900 dark:text-blue-200 font-medium">
              ⚠️ Esta operación ajustará el saldo inicial y recalculará el saldo actual.
            </p>
            <p className="text-blue-800 dark:text-blue-300 mt-1">
              El diferencial se registrará como un movimiento de ajuste.
            </p>
          </div>
          <button onClick={() => void handleEditOpeningBalance()} className="btn btn-primary w-full" disabled={!newOpeningBalance}>
            Actualizar saldo inicial
          </button>
        </div>
      </Modal>

      <Modal isOpen={movementModal} onClose={() => setMovementModal(false)} title="Nuevo movimiento">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['INCOME', 'EXPENSE', 'WITHDRAWAL', 'DEPOSIT'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setMovementType(item)}
                className={`btn ${movementType === item ? 'btn-primary' : 'btn-secondary'}`}
              >
                {item === 'INCOME' ? 'Ingreso' : item === 'EXPENSE' ? 'Gasto' : item === 'WITHDRAWAL' ? 'Retiro' : 'Depósito'}
              </button>
            ))}
          </div>
          {movementType === 'INCOME' && (
            <select
              value={movementPaymentMethod}
              onChange={(event) => setMovementPaymentMethod(event.target.value as typeof movementPaymentMethod)}
              className="input"
            >
              <option value="">Método de pago</option>
              {(['CASH', 'CARD', 'BIZUM', 'OTHER'] as const).map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel(method)}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            step="0.01"
            value={movementAmount}
            onChange={(event) => setMovementAmount(event.target.value)}
            className="input"
            placeholder="Importe"
          />
          <input
            type="text"
            value={movementCategory}
            onChange={(event) => setMovementCategory(event.target.value)}
            className="input"
            placeholder="Categoría"
          />
          <textarea
            value={movementDescription}
            onChange={(event) => setMovementDescription(event.target.value)}
            className="input resize-none"
            rows={3}
            placeholder="Descripción"
          />
          <input
            type="text"
            value={movementReference}
            onChange={(event) => setMovementReference(event.target.value)}
            className="input"
            placeholder="Referencia"
          />
          <button
            onClick={() => void handleAddMovement()}
            className="btn btn-primary w-full"
            disabled={!movementAmount || !movementCategory || !movementDescription}
          >
            Guardar movimiento
          </button>
        </div>
      </Modal>

      <Modal isOpen={privatePinModal} onClose={() => setPrivatePinModal(false)} title="Acceso privado">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Introduce la contraseña para acceder a movimientos en efectivo sin ticket.
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={privatePinInput}
            onChange={(event) => setPrivatePinInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
            className="input"
            placeholder="Contraseña"
          />
          <button
            onClick={() => void loadPrivateNoTicketCash()}
            className="btn btn-primary w-full"
            disabled={privatePinInput.length !== 4 || privateCashLoading}
          >
            {privateCashLoading ? 'Validando...' : 'Entrar'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={privateCashModal}
        onClose={() => setPrivateCashModal(false)}
        title="Efectivo sin ticket"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Total: {formatCurrency(privateCashTotal)}
            </p>
          </div>
          <div className="max-h-[30rem] overflow-y-auto space-y-3 pr-1">
            {privateCashRows.length === 0 ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 py-8 text-center text-gray-500 dark:text-gray-400">
                No hay registros en esta sección.
              </div>
            ) : (
              privateCashRows.map((row) => (
                <div key={row.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Fecha</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {new Date(row.date).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Ticket</p>
                      <p className="text-sm font-mono text-gray-900 dark:text-white mt-1">{row.saleNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Cliente</p>
                      <p className="text-sm text-gray-900 dark:text-white mt-1">{row.clientName}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Usuario</p>
                      <p className="text-sm text-gray-900 dark:text-white mt-1">{row.userName}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Importe</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                        {formatCurrency(Number(row.amount))}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={historyModal} onClose={() => setHistoryModal(false)} title="Historial de cajas" maxWidth="2xl">
        <div className="space-y-3 max-h-[32rem] overflow-y-auto">
          {cashHistory.map((cash) => (
            <div key={cash.id} className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{new Date(cash.date).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cash.status}</p>
                </div>
                <div className="text-right text-sm">
                  <p>Inicial: {formatCurrency(Number(cash.openingBalance))}</p>
                  {cash.closingBalance && <p>Final: {formatCurrency(Number(cash.closingBalance))}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
