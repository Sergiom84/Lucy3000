import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Lock, Unlock, Plus, Calculator, History, AlertCircle, Calendar, Filter, Receipt, Euro } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '../stores/authStore'

interface CashRegister {
  id: string
  date: string
  openingBalance: number
  closingBalance?: number
  expectedBalance?: number
  difference?: number
  status: 'OPEN' | 'CLOSED'
  notes?: string
  openedAt: string
  closedAt?: string
  movements: CashMovement[]
}

interface CashMovement {
  id: string
  type: 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'
  amount: number
  category: string
  description: string
  reference?: string
  date: string
  user: {
    name: string
  }
}

export default function Cash() {
  const { user } = useAuthStore()
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null)
  const [cashHistory, setCashHistory] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(false)

  // Modals
  const [openCashModal, setOpenCashModal] = useState(false)
  const [closeCashModal, setCloseCashModal] = useState(false)
  const [movementModal, setMovementModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [selectedCashRegister, setSelectedCashRegister] = useState<CashRegister | null>(null)

  // Open Cash Form
  const [openingBalance, setOpeningBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')

  // Close Cash Form
  const [closingBalance, setClosingBalance] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [cashCount, setCashCount] = useState({
    bills_500: 0,
    bills_200: 0,
    bills_100: 0,
    bills_50: 0,
    bills_20: 0,
    bills_10: 0,
    bills_5: 0,
    coins_2: 0,
    coins_1: 0,
    coins_050: 0,
    coins_020: 0,
    coins_010: 0,
    coins_005: 0,
    coins_002: 0,
    coins_001: 0
  })

  // Movement Form
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'>('EXPENSE')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementCategory, setMovementCategory] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [movementReference, setMovementReference] = useState('')

  // History Filters
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })

  useEffect(() => {
    loadActiveCashRegister()
  }, [])

  const loadActiveCashRegister = async () => {
    try {
      setLoading(true)
      const response = await api.get('/cash?status=OPEN')
      if (response.data.length > 0) {
        setActiveCashRegister(response.data[0])
      } else {
        setActiveCashRegister(null)
      }
    } catch (error) {
      console.error('Error loading cash register:', error)
      toast.error('Error al cargar caja')
    } finally {
      setLoading(false)
    }
  }

  const loadCashHistory = async () => {
    try {
      const params = new URLSearchParams()
      if (dateFilter.startDate) params.append('startDate', dateFilter.startDate)
      if (dateFilter.endDate) params.append('endDate', dateFilter.endDate)

      const response = await api.get(`/cash?${params.toString()}`)
      setCashHistory(response.data)
    } catch (error) {
      console.error('Error loading cash history:', error)
      toast.error('Error al cargar historial')
    }
  }

  const handleOpenCash = async () => {
    if (!openingBalance || Number(openingBalance) < 0) {
      toast.error('Ingrese un saldo inicial válido')
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/cash/open', {
        openingBalance: Number(openingBalance),
        notes: openNotes
      })

      setActiveCashRegister(response.data)
      setOpenCashModal(false)
      setOpeningBalance('')
      setOpenNotes('')
      toast.success('Caja abierta exitosamente')
    } catch (error: any) {
      console.error('Error opening cash:', error)
      toast.error(error.response?.data?.error || 'Error al abrir caja')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseCash = async () => {
    if (!activeCashRegister) return

    if (!closingBalance || Number(closingBalance) < 0) {
      toast.error('Ingrese un saldo de cierre válido')
      return
    }

    try {
      setLoading(true)
      await api.post(`/cash/${activeCashRegister.id}/close`, {
        closingBalance: Number(closingBalance),
        notes: closeNotes
      })

      setActiveCashRegister(null)
      setCloseCashModal(false)
      setClosingBalance('')
      setCloseNotes('')
      setCashCount({
        bills_500: 0,
        bills_200: 0,
        bills_100: 0,
        bills_50: 0,
        bills_20: 0,
        bills_10: 0,
        bills_5: 0,
        coins_2: 0,
        coins_1: 0,
        coins_050: 0,
        coins_020: 0,
        coins_010: 0,
        coins_005: 0,
        coins_002: 0,
        coins_001: 0
      })
      toast.success('Caja cerrada exitosamente')
    } catch (error: any) {
      console.error('Error closing cash:', error)
      toast.error(error.response?.data?.error || 'Error al cerrar caja')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMovement = async () => {
    if (!activeCashRegister) return

    if (!movementAmount || Number(movementAmount) <= 0) {
      toast.error('Ingrese un monto válido')
      return
    }

    if (!movementCategory || !movementDescription) {
      toast.error('Complete todos los campos requeridos')
      return
    }

    try {
      setLoading(true)
      const response = await api.post(`/cash/${activeCashRegister.id}/movements`, {
        type: movementType,
        amount: Number(movementAmount),
        category: movementCategory,
        description: movementDescription,
        reference: movementReference || null
      })

      // Reload active cash register
      await loadActiveCashRegister()

      setMovementModal(false)
      setMovementAmount('')
      setMovementCategory('')
      setMovementDescription('')
      setMovementReference('')
      toast.success('Movimiento registrado')
    } catch (error: any) {
      console.error('Error adding movement:', error)
      toast.error(error.response?.data?.error || 'Error al registrar movimiento')
    } finally {
      setLoading(false)
    }
  }

  const calculateCashCount = () => {
    const total =
      cashCount.bills_500 * 500 +
      cashCount.bills_200 * 200 +
      cashCount.bills_100 * 100 +
      cashCount.bills_50 * 50 +
      cashCount.bills_20 * 20 +
      cashCount.bills_10 * 10 +
      cashCount.bills_5 * 5 +
      cashCount.coins_2 * 2 +
      cashCount.coins_1 * 1 +
      cashCount.coins_050 * 0.5 +
      cashCount.coins_020 * 0.2 +
      cashCount.coins_010 * 0.1 +
      cashCount.coins_005 * 0.05 +
      cashCount.coins_002 * 0.02 +
      cashCount.coins_001 * 0.01

    return total.toFixed(2)
  }

  const calculateBalance = () => {
    if (!activeCashRegister) return { income: 0, expense: 0, current: 0 }

    let income = 0
    let expense = 0

    if (activeCashRegister.movements && activeCashRegister.movements.length > 0) {
      activeCashRegister.movements.forEach(movement => {
        if (movement.type === 'INCOME' || movement.type === 'DEPOSIT') {
          income += Number(movement.amount)
        } else if (movement.type === 'EXPENSE' || movement.type === 'WITHDRAWAL') {
          expense += Number(movement.amount)
        }
      })
    }

    const current = Number(activeCashRegister.openingBalance) + income - expense

    return { income, expense, current }
  }

  const viewCashDetail = async (cashId: string) => {
    try {
      const response = await api.get(`/cash/${cashId}`)
      setSelectedCashRegister(response.data)
    } catch (error) {
      console.error('Error loading cash detail:', error)
      toast.error('Error al cargar detalle')
    }
  }

  const balance = calculateBalance()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Caja Diaria
        </h1>

        <div className="flex gap-3">
          <button
            onClick={() => {
              loadCashHistory()
              setHistoryModal(true)
            }}
            className="btn btn-secondary"
          >
            <History className="w-5 h-5 mr-2" />
            Historial
          </button>

          {!activeCashRegister ? (
            <button
              onClick={() => setOpenCashModal(true)}
              className="btn btn-primary"
            >
              <Unlock className="w-5 h-5 mr-2" />
              Abrir Caja
            </button>
          ) : (
            <button
              onClick={() => setCloseCashModal(true)}
              className="btn btn-error"
            >
              <Lock className="w-5 h-5 mr-2" />
              Cerrar Caja
            </button>
          )}
        </div>
      </div>

      {/* Status Card */}
      {!activeCashRegister ? (
        <div className="card">
          <div className="text-center py-12">
            <Lock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Caja Cerrada
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              No hay una caja abierta actualmente
            </p>
            <button
              onClick={() => setOpenCashModal(true)}
              className="btn btn-primary"
            >
              <Unlock className="w-5 h-5 mr-2" />
              Abrir Caja
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Saldo Inicial</span>
                <Euro className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                €{Number(activeCashRegister.openingBalance).toFixed(2)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Ingresos</span>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-600">
                +€{balance.income.toFixed(2)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Gastos</span>
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-600">
                -€{balance.expense.toFixed(2)}
              </p>
            </div>

            <div className="card bg-gradient-to-br from-blue-500 to-blue-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white opacity-90">Saldo Actual</span>
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-white">
                €{balance.current.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Caja abierta por {user?.name}
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      Abierta el {format(new Date(activeCashRegister.openedAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                    </p>
                  </div>
                  <button
                    onClick={() => setMovementModal(true)}
                    className="btn btn-primary btn-sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Movimiento
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Movimientos de Hoy
              </h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {activeCashRegister.movements?.length || 0} movimientos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Referencia</th>
                    <th>Usuario</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {!activeCashRegister.movements || activeCashRegister.movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No hay movimientos registrados
                      </td>
                    </tr>
                  ) : (
                    activeCashRegister.movements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="text-sm">
                          {format(new Date(movement.date), 'HH:mm', { locale: es })}
                        </td>
                        <td>
                          <span className={`badge ${
                            movement.type === 'INCOME' ? 'badge-success' :
                            movement.type === 'DEPOSIT' ? 'badge-info' :
                            movement.type === 'EXPENSE' ? 'badge-error' :
                            'badge-warning'
                          }`}>
                            {movement.type === 'INCOME' ? 'Ingreso' :
                             movement.type === 'DEPOSIT' ? 'Depósito' :
                             movement.type === 'EXPENSE' ? 'Gasto' : 'Retiro'}
                          </span>
                        </td>
                        <td>{movement.category}</td>
                        <td className="max-w-xs truncate">{movement.description}</td>
                        <td className="text-sm text-gray-600 dark:text-gray-400">
                          {movement.reference || '-'}
                        </td>
                        <td className="text-sm">{movement.user.name}</td>
                        <td className={`font-semibold ${
                          movement.type === 'INCOME' || movement.type === 'DEPOSIT'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          {movement.type === 'INCOME' || movement.type === 'DEPOSIT' ? '+' : '-'}
                          €{Number(movement.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Open Cash Modal */}
      <Modal
        isOpen={openCashModal}
        onClose={() => setOpenCashModal(false)}
        title="Abrir Caja"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Saldo Inicial *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="input pl-8"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Notas adicionales..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setOpenCashModal(false)}
              className="btn btn-secondary flex-1"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleOpenCash}
              className="btn btn-primary flex-1"
              disabled={loading}
            >
              <Unlock className="w-4 h-4 mr-2" />
              {loading ? 'Abriendo...' : 'Abrir Caja'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Close Cash Modal */}
      <Modal
        isOpen={closeCashModal}
        onClose={() => setCloseCashModal(false)}
        title="Cerrar Caja - Arqueo"
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Cash Count Calculator */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">
              Conteo de Efectivo
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Billetes */}
              <div className="col-span-2 md:col-span-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Billetes</p>
              </div>

              {[
                { key: 'bills_500', label: '€500', value: 500 },
                { key: 'bills_200', label: '€200', value: 200 },
                { key: 'bills_100', label: '€100', value: 100 },
                { key: 'bills_50', label: '€50', value: 50 },
                { key: 'bills_20', label: '€20', value: 20 },
                { key: 'bills_10', label: '€10', value: 10 },
                { key: 'bills_5', label: '€5', value: 5 }
              ].map(({ key, label, value }) => (
                <div key={key}>
                  <label className="label text-xs">{label}</label>
                  <input
                    type="number"
                    min="0"
                    value={cashCount[key as keyof typeof cashCount]}
                    onChange={(e) => setCashCount({ ...cashCount, [key]: Number(e.target.value) })}
                    className="input input-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    = €{(cashCount[key as keyof typeof cashCount] * value).toFixed(2)}
                  </p>
                </div>
              ))}

              {/* Monedas */}
              <div className="col-span-2 md:col-span-4 mt-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Monedas</p>
              </div>

              {[
                { key: 'coins_2', label: '€2', value: 2 },
                { key: 'coins_1', label: '€1', value: 1 },
                { key: 'coins_050', label: '€0.50', value: 0.5 },
                { key: 'coins_020', label: '€0.20', value: 0.2 },
                { key: 'coins_010', label: '€0.10', value: 0.1 },
                { key: 'coins_005', label: '€0.05', value: 0.05 },
                { key: 'coins_002', label: '€0.02', value: 0.02 },
                { key: 'coins_001', label: '€0.01', value: 0.01 }
              ].map(({ key, label, value }) => (
                <div key={key}>
                  <label className="label text-xs">{label}</label>
                  <input
                    type="number"
                    min="0"
                    value={cashCount[key as keyof typeof cashCount]}
                    onChange={(e) => setCashCount({ ...cashCount, [key]: Number(e.target.value) })}
                    className="input input-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    = €{(cashCount[key as keyof typeof cashCount] * value).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-blue-900 dark:text-blue-200">
                  Total Contado:
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  €{calculateCashCount()}
                </span>
              </div>
              <button
                onClick={() => setClosingBalance(calculateCashCount())}
                className="btn btn-secondary btn-sm w-full mt-2"
              >
                <Calculator className="w-4 h-4 mr-2" />
                Usar este total
              </button>
            </div>
          </div>

          {/* Balance Summary */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
              Resumen
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Saldo Inicial:</span>
                <span className="font-semibold">€{activeCashRegister ? Number(activeCashRegister.openingBalance).toFixed(2) : '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Ingresos:</span>
                <span>+€{balance.income.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-red-600">
                <span>Gastos:</span>
                <span>-€{balance.expense.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Saldo Esperado:</span>
                <span className="text-blue-600">€{balance.current.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Closing Balance */}
          <div>
            <label className="label">Saldo de Cierre *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
              <input
                type="number"
                step="0.01"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                className="input pl-8"
                placeholder="0.00"
              />
            </div>

            {closingBalance && Number(closingBalance) !== balance.current && (
              <div className={`mt-2 p-3 rounded-lg ${
                Number(closingBalance) > balance.current
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                <p className={`text-sm font-semibold ${
                  Number(closingBalance) > balance.current ? 'text-green-900 dark:text-green-200' : 'text-red-900 dark:text-red-200'
                }`}>
                  Diferencia: {Number(closingBalance) > balance.current ? '+' : ''}
                  €{(Number(closingBalance) - balance.current).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label">Notas de Cierre (opcional)</label>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Observaciones del cierre..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setCloseCashModal(false)}
              className="btn btn-secondary flex-1"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleCloseCash}
              className="btn btn-error flex-1"
              disabled={loading}
            >
              <Lock className="w-4 h-4 mr-2" />
              {loading ? 'Cerrando...' : 'Cerrar Caja'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal
        isOpen={movementModal}
        onClose={() => setMovementModal(false)}
        title="Nuevo Movimiento"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Tipo de Movimiento *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMovementType('INCOME')}
                className={`btn ${movementType === 'INCOME' ? 'btn-success' : 'btn-secondary'}`}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Ingreso
              </button>
              <button
                onClick={() => setMovementType('EXPENSE')}
                className={`btn ${movementType === 'EXPENSE' ? 'btn-error' : 'btn-secondary'}`}
              >
                <TrendingDown className="w-4 h-4 mr-2" />
                Gasto
              </button>
              <button
                onClick={() => setMovementType('DEPOSIT')}
                className={`btn ${movementType === 'DEPOSIT' ? 'btn-info' : 'btn-secondary'}`}
              >
                Depósito
              </button>
              <button
                onClick={() => setMovementType('WITHDRAWAL')}
                className={`btn ${movementType === 'WITHDRAWAL' ? 'btn-warning' : 'btn-secondary'}`}
              >
                Retiro
              </button>
            </div>
          </div>

          <div>
            <label className="label">Monto *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
              <input
                type="number"
                step="0.01"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                className="input pl-8"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="label">Categoría *</label>
            <select
              value={movementCategory}
              onChange={(e) => setMovementCategory(e.target.value)}
              className="input"
            >
              <option value="">Seleccionar categoría</option>
              {movementType === 'INCOME' || movementType === 'DEPOSIT' ? (
                <>
                  <option value="Ventas">Ventas</option>
                  <option value="Servicios">Servicios</option>
                  <option value="Productos">Productos</option>
                  <option value="Otros Ingresos">Otros Ingresos</option>
                </>
              ) : (
                <>
                  <option value="Suministros">Suministros</option>
                  <option value="Servicios Básicos">Servicios Básicos</option>
                  <option value="Salarios">Salarios</option>
                  <option value="Alquiler">Alquiler</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Compras">Compras</option>
                  <option value="Otros Gastos">Otros Gastos</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="label">Descripción *</label>
            <textarea
              value={movementDescription}
              onChange={(e) => setMovementDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Descripción del movimiento..."
            />
          </div>

          <div>
            <label className="label">Referencia (opcional)</label>
            <input
              type="text"
              value={movementReference}
              onChange={(e) => setMovementReference(e.target.value)}
              className="input"
              placeholder="Número de factura, recibo, etc."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setMovementModal(false)}
              className="btn btn-secondary flex-1"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleAddMovement}
              className="btn btn-primary flex-1"
              disabled={loading}
            >
              <Plus className="w-4 h-4 mr-2" />
              {loading ? 'Guardando...' : 'Guardar Movimiento'}
            </button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={historyModal}
        onClose={() => setHistoryModal(false)}
        title="Historial de Cajas"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-sm">Desde</label>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                className="input input-sm"
              />
            </div>
            <div>
              <label className="label text-sm">Hasta</label>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                className="input input-sm"
              />
            </div>
          </div>

          <button
            onClick={loadCashHistory}
            className="btn btn-primary btn-sm w-full"
          >
            <Filter className="w-4 h-4 mr-2" />
            Aplicar Filtros
          </button>

          {/* History List */}
          <div className="max-h-96 overflow-y-auto space-y-3">
            {cashHistory.map((cash) => (
              <div
                key={cash.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors"
                onClick={() => viewCashDetail(cash.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {cash.status === 'OPEN' ? (
                      <Unlock className="w-5 h-5 text-green-600 mr-2" />
                    ) : (
                      <Lock className="w-5 h-5 text-gray-600 mr-2" />
                    )}
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {format(new Date(cash.date), 'dd/MM/yyyy', { locale: es })}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {cash.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Inicial: €{Number(cash.openingBalance).toFixed(2)}
                    </p>
                    {cash.closingBalance && (
                      <p className="font-semibold text-blue-600">
                        Final: €{Number(cash.closingBalance).toFixed(2)}
                      </p>
                    )}
                    {cash.difference && Number(cash.difference) !== 0 && (
                      <p className={`text-xs ${
                        Number(cash.difference) > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        Dif: {Number(cash.difference) > 0 ? '+' : ''}€{Number(cash.difference).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {cashHistory.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay cajas registradas</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Cash Detail Modal */}
      {selectedCashRegister && (
        <Modal
          isOpen={!!selectedCashRegister}
          onClose={() => setSelectedCashRegister(null)}
          title={`Detalle de Caja - ${format(new Date(selectedCashRegister.date), 'dd/MM/yyyy', { locale: es })}`}
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Saldo Inicial</p>
                <p className="text-xl font-bold">€{Number(selectedCashRegister.openingBalance).toFixed(2)}</p>
              </div>
              {selectedCashRegister.closingBalance && (
                <>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Saldo Final</p>
                    <p className="text-xl font-bold">€{Number(selectedCashRegister.closingBalance).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Balance Esperado</p>
                    <p className="text-xl font-bold">€{Number(selectedCashRegister.expectedBalance).toFixed(2)}</p>
                  </div>
                  {selectedCashRegister.difference && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Diferencia</p>
                      <p className={`text-xl font-bold ${
                        Number(selectedCashRegister.difference) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {Number(selectedCashRegister.difference) > 0 ? '+' : ''}
                        €{Number(selectedCashRegister.difference).toFixed(2)}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Movements */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                Movimientos ({selectedCashRegister.movements.length})
              </h4>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {selectedCashRegister.movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {movement.description}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {movement.category} • {format(new Date(movement.date), 'HH:mm', { locale: es })}
                      </p>
                    </div>
                    <p className={`font-semibold ${
                      movement.type === 'INCOME' || movement.type === 'DEPOSIT'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {movement.type === 'INCOME' || movement.type === 'DEPOSIT' ? '+' : '-'}
                      €{Number(movement.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {selectedCashRegister.notes && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Notas</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {selectedCashRegister.notes}
                </p>
              </div>
            )}

            <button
              onClick={() => window.print()}
              className="btn btn-primary w-full"
            >
              <Receipt className="w-4 h-4 mr-2" />
              Imprimir Resumen
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
