import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Unlock,
  Edit
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import api from '../utils/api'
import { savePdfDocument } from '../utils/desktop'
import {
  buildCashMovementsPdfHtml,
  exportCashMovementsWorkbook,
  getCashMovementsPdfFileName
} from '../utils/exports'
import {
  buildEmptyCashCountInputs,
  calculateCashCountSummary,
  CASH_COUNT_BILL_DENOMINATIONS,
  CASH_COUNT_COIN_DENOMINATIONS,
  CASH_COUNT_DENOMINATIONS,
  getCashCountPieceCounts
} from '../utils/cashCount'
import { calendarWeekDays, endOfCalendarWeek, formatCalendarText, startOfCalendarWeek } from '../utils/calendarLocale'
import { formatCurrency } from '../utils/format'
import { paymentMethodLabel } from '../utils/tickets'

type Period = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
type PrivateRangePreset = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM'

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

type PrivateCashRow = {
  id: string
  saleNumber: string
  date: string
  amount: number
  description?: string | null
  clientName: string
  professionalName: string
  paymentDetail: string
  treatmentName: string
}

const commercialPaymentMethods = ['CASH', 'CARD', 'BIZUM', 'ABONO'] as const

const formatDateInput = (value: Date) => format(value, 'yyyy-MM-dd')
const parseDateInput = (value: string) => new Date(`${value}T12:00:00`)

const buildPrivateDateRange = (preset: Exclude<PrivateRangePreset, 'CUSTOM'>, anchorDate: Date) => {
  if (preset === 'DAY') {
    const dateValue = formatDateInput(anchorDate)
    return {
      startDate: dateValue,
      endDate: dateValue
    }
  }

  if (preset === 'WEEK') {
    return {
      startDate: formatDateInput(startOfCalendarWeek(anchorDate)),
      endDate: formatDateInput(endOfCalendarWeek(anchorDate))
    }
  }

  return {
    startDate: formatDateInput(startOfMonth(anchorDate)),
    endDate: formatDateInput(endOfMonth(anchorDate))
  }
}

const buildPrivateCalendarDays = (referenceDate: Date) => {
  const monthStart = startOfCalendarWeek(startOfMonth(referenceDate))
  return Array.from({ length: 42 }, (_, index) => addDays(monthStart, index))
}

const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/\.?0+$/, '')
}

const findOptionLabel = <T,>(
  items: T[],
  value: string,
  getId: (item: T) => string,
  getLabel: (item: T) => string,
  fallback: string
) => {
  if (!value) return fallback
  const item = items.find((current) => getId(current) === value)
  return item ? getLabel(item) : fallback
}

export default function Cash() {
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [analyticsRows, setAnalyticsRows] = useState<any[]>([])
  const [ranking, setRanking] = useState<any>(null)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const [openCashModal, setOpenCashModal] = useState(false)
  const [closeCashModal, setCloseCashModal] = useState(false)
  const [cashCountModal, setCashCountModal] = useState(false)
  const [movementModal, setMovementModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [privatePinModal, setPrivatePinModal] = useState(false)
  const [privateCashModal, setPrivateCashModal] = useState(false)
  const [privatePinInput, setPrivatePinInput] = useState('')
  const [privateCashAccessPin, setPrivateCashAccessPin] = useState('')
  const [privateCashRows, setPrivateCashRows] = useState<PrivateCashRow[]>([])
  const [privateCashTotal, setPrivateCashTotal] = useState(0)
  const [privateCashLoading, setPrivateCashLoading] = useState(false)
  const [privateRangePreset, setPrivateRangePreset] = useState<PrivateRangePreset>('DAY')
  const [privateCalendarDate, setPrivateCalendarDate] = useState<Date>(new Date())
  const [privateCalendarMonth, setPrivateCalendarMonth] = useState<Date>(new Date())
  const [privateDateRange, setPrivateDateRange] = useState(() => buildPrivateDateRange('DAY', new Date()))
  const [cashHistory, setCashHistory] = useState<any[]>([])
  const [editOpeningBalanceModal, setEditOpeningBalanceModal] = useState(false)

  const [openingBalance, setOpeningBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [cashCountQuantities, setCashCountQuantities] = useState<Record<string, string>>(() =>
    buildEmptyCashCountInputs()
  )
  const [cashCountBlind, setCashCountBlind] = useState(false)
  const [cashCountRevealed, setCashCountRevealed] = useState(false)
  const [cashCountNote, setCashCountNote] = useState('')
  const [cashCountSaving, setCashCountSaving] = useState(false)
  const cashCountInputRefs = useRef<Array<HTMLInputElement | null>>([])

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
    const bootstrapCashPage = async () => {
      await loadSummary()
      await loadFilterOptions()
      setInitialDataLoaded(true)
    }

    void bootstrapCashPage()
  }, [])

  useEffect(() => {
    if (!initialDataLoaded) return
    void Promise.all([loadAnalytics(), loadRanking()])
  }, [initialDataLoaded, period, filters])

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
        api.get('/clients?isActive=true&includeCounts=false'),
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

  const resetPrivateCashFilters = () => {
    const today = new Date()
    setPrivateRangePreset('DAY')
    setPrivateCalendarDate(today)
    setPrivateCalendarMonth(today)
    setPrivateDateRange(buildPrivateDateRange('DAY', today))
  }

  const closePrivateCashSection = () => {
    setPrivateCashModal(false)
    setPrivateCashAccessPin('')
    setPrivateCashRows([])
    setPrivateCashTotal(0)
    resetPrivateCashFilters()
  }

  const loadPrivateNoTicketCash = async (options?: {
    pin?: string
    startDate?: string
    endDate?: string
  }) => {
    try {
      const accessPin = options?.pin || privateCashAccessPin
      if (!accessPin) {
        toast.error('Introduce la contraseña para abrir la sección privada')
        return false
      }

      setPrivateCashLoading(true)
      const response = await api.get('/cash/private/no-ticket-cash', {
        params: {
          pin: accessPin,
          startDate: options?.startDate || privateDateRange.startDate,
          endDate: options?.endDate || privateDateRange.endDate
        }
      })
      setPrivateCashRows(response.data.rows || [])
      setPrivateCashTotal(Number(response.data.totalAmount || 0))
      if (options?.pin) {
        setPrivateCashAccessPin(accessPin)
      }
      return true
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo abrir la sección privada')
      if (error.response?.status === 403) {
        setPrivateCashAccessPin('')
        setPrivateCashModal(false)
      }
      return false
    } finally {
      setPrivateCashLoading(false)
    }
  }

  const handleOpenPrivateCashSection = async () => {
    const ok = await loadPrivateNoTicketCash({ pin: privatePinInput })
    if (!ok) return
    setPrivatePinModal(false)
    setPrivateCashModal(true)
    setPrivatePinInput('')
  }

  const applyPrivateRangePreset = async (
    nextPreset: Exclude<PrivateRangePreset, 'CUSTOM'>,
    anchorDate = privateCalendarDate
  ) => {
    const nextRange = buildPrivateDateRange(nextPreset, anchorDate)
    setPrivateRangePreset(nextPreset)
    setPrivateCalendarDate(anchorDate)
    setPrivateCalendarMonth(anchorDate)
    setPrivateDateRange(nextRange)

    if (privateCashModal && privateCashAccessPin) {
      await loadPrivateNoTicketCash(nextRange)
    }
  }

  const handlePrivateDateChange = async (field: 'startDate' | 'endDate', value: string) => {
    if (!value) return

    const nextRange = {
      ...privateDateRange,
      [field]: value
    }

    if (field === 'startDate' && value > nextRange.endDate) {
      nextRange.endDate = value
    }

    if (field === 'endDate' && value < nextRange.startDate) {
      nextRange.startDate = value
    }

    const anchorDate = parseDateInput(field === 'endDate' ? nextRange.endDate : nextRange.startDate)
    setPrivateRangePreset('CUSTOM')
    setPrivateCalendarDate(anchorDate)
    setPrivateCalendarMonth(anchorDate)
    setPrivateDateRange(nextRange)

    if (privateCashModal && privateCashAccessPin) {
      await loadPrivateNoTicketCash(nextRange)
    }
  }

  const handlePrivateCalendarDaySelect = async (date: Date) => {
    setPrivateCalendarDate(date)
    setPrivateCalendarMonth(date)

    if (privateRangePreset === 'CUSTOM') {
      const nextRange = {
        startDate: formatDateInput(date),
        endDate: formatDateInput(date)
      }
      setPrivateDateRange(nextRange)
      if (privateCashModal && privateCashAccessPin) {
        await loadPrivateNoTicketCash(nextRange)
      }
      return
    }

    await applyPrivateRangePreset(privateRangePreset, date)
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
      await loadSummary()
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
      setCashCountModal(false)
      setClosingBalance('')
      setCloseNotes('')
      setCashCountQuantities(buildEmptyCashCountInputs())
      await Promise.all([loadSummary(), loadCashHistory()])
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
      await loadSummary()
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
      await loadSummary()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar el saldo inicial')
    }
  }

  const handleCashCountQuantityChange = (denominationKey: string, value: string) => {
    const normalizedValue = value.replace(/\D/g, '').slice(0, 4)
    setCashCountQuantities((current) => ({
      ...current,
      [denominationKey]: normalizedValue
    }))
  }

  const handleResetCashCount = () => {
    setCashCountQuantities(buildEmptyCashCountInputs())
    setCashCountNote('')
    setCashCountRevealed(false)
  }

  const handleCashCountKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault()
      const next = cashCountInputRefs.current[index + 1]
      if (next) next.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const prev = cashCountInputRefs.current[index - 1]
      if (prev) prev.focus()
    }
  }

  const paymentsByMethod = summary?.cards?.paymentsByMethod || {}
  const incomeCards = summary?.cards?.income || { day: 0, month: 0, year: 0 }
  const workPerformedCards = summary?.cards?.workPerformed || { day: 0, month: 0, year: 0 }

  const currentCashBalance = summary?.cards?.currentBalance || 0
  const closingSummary = summary?.cards?.closingSummary || {
    expectedOfficialCash: Number(currentCashBalance || 0),
    officialCashCollected: Number(paymentsByMethod.CASH || 0),
    cardCollected: Number(paymentsByMethod.CARD || 0),
    bizumCollected: Number(paymentsByMethod.BIZUM || 0),
    privateCashCollected: 0,
    totalCollectedExcludingAbono:
      Number(paymentsByMethod.CASH || 0) +
      Number(paymentsByMethod.CARD || 0) +
      Number(paymentsByMethod.BIZUM || 0)
  }
  const cashCountSummary = useMemo(
    () => calculateCashCountSummary(cashCountQuantities, Number(currentCashBalance || 0)),
    [cashCountQuantities, currentCashBalance]
  )
  const cashCountStatus = useMemo(() => {
    if (cashCountSummary.isBalanced) {
      return {
        title: 'Caja cuadrada',
        detail: 'El recuento coincide con el saldo esperado.',
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200'
      }
    }

    if (cashCountSummary.difference > 0) {
      return {
        title: 'Sobra efectivo',
        detail: `Hay ${formatCurrency(cashCountSummary.difference)} de más respecto al saldo esperado.`,
        className:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
      }
    }

    return {
      title: 'Falta efectivo',
      detail: `Faltan ${formatCurrency(Math.abs(cashCountSummary.difference))} respecto al saldo esperado.`,
      className:
        'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200'
    }
  }, [cashCountSummary.difference, cashCountSummary.isBalanced])

  const cashCountPieces = useMemo(
    () => getCashCountPieceCounts(cashCountQuantities),
    [cashCountQuantities]
  )
  const cashCountExpectedVisible = !cashCountBlind || cashCountRevealed
  const privateCalendarDays = useMemo(
    () => buildPrivateCalendarDays(privateCalendarMonth),
    [privateCalendarMonth]
  )
  const privateRangeTitle = useMemo(() => {
    if (privateRangePreset === 'DAY') {
      return formatCalendarText(parseDateInput(privateDateRange.startDate), 'dddd D [de] MMMM')
    }

    if (privateRangePreset === 'WEEK') {
      return `${formatCalendarText(parseDateInput(privateDateRange.startDate), 'D MMM')} - ${formatCalendarText(parseDateInput(privateDateRange.endDate), 'D MMM')}`
    }

    if (privateRangePreset === 'MONTH') {
      return formatCalendarText(parseDateInput(privateDateRange.startDate), 'MMMM YYYY')
    }

    return `${formatCalendarText(parseDateInput(privateDateRange.startDate), 'D MMM')} - ${formatCalendarText(parseDateInput(privateDateRange.endDate), 'D MMM')}`
  }, [privateDateRange.endDate, privateDateRange.startDate, privateRangePreset])

  const persistCashCount = async (appliedAsClose: boolean) => {
    if (!activeCashRegister) {
      toast.error('No hay caja abierta')
      return false
    }

    if (cashCountSummary.difference !== 0 && !cashCountNote.trim()) {
      toast.error('Indica un motivo para la diferencia antes de guardar')
      return false
    }

    const denominations: Record<string, number> = {}
    for (const denomination of CASH_COUNT_DENOMINATIONS) {
      const raw = cashCountQuantities[denomination.key]
      denominations[denomination.key] = raw ? Number.parseInt(raw, 10) || 0 : 0
    }

    try {
      setCashCountSaving(true)
      await api.post(`/cash/${activeCashRegister.id}/counts`, {
        denominations,
        isBlind: cashCountBlind,
        appliedAsClose,
        notes: cashCountNote.trim() || null
      })
      return true
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo guardar el recuento')
      return false
    } finally {
      setCashCountSaving(false)
    }
  }

  const handleSaveCashCount = async () => {
    const ok = await persistCashCount(false)
    if (ok) {
      toast.success('Recuento guardado')
      setCashCountNote('')
    }
  }

  const handleUseCashCountForClosing = async () => {
    const ok = await persistCashCount(true)
    if (!ok) return
    setClosingBalance(cashCountSummary.total.toFixed(2))
    setCashCountModal(false)
    setCloseCashModal(true)
    setCashCountNote('')
  }

  const rankingGroups = useMemo(
    () => [
      { key: 'services', title: 'Tratamientos' },
      { key: 'products', title: 'Productos' }
    ],
    []
  )

  const exportContext = useMemo(
    () => ({
      period,
      clientLabel: findOptionLabel(
        clients,
        filters.clientId,
        (client) => client.id,
        (client) => `${client.firstName} ${client.lastName}`.trim(),
        'Todos los clientes'
      ),
      paymentMethodLabel: filters.paymentMethod ? paymentMethodLabel(filters.paymentMethod) : 'Todos los pagos',
      serviceLabel: findOptionLabel(
        services,
        filters.serviceId,
        (service) => service.id,
        (service) => service.name,
        'Todos los tratamientos'
      ),
      productLabel: findOptionLabel(
        products,
        filters.productId,
        (product) => product.id,
        (product) => product.name,
        'Todos los productos'
      ),
      typeLabel:
        filters.type === 'SERVICE' ? 'Tratamientos' : filters.type === 'PRODUCT' ? 'Productos' : 'Todo'
    }),
    [clients, filters, period, products, services]
  )

  const handleExportExcel = async () => {
    if (analyticsRows.length === 0) {
      toast.error('No hay movimientos para exportar con los filtros actuales')
      return
    }

    try {
      await exportCashMovementsWorkbook(analyticsRows, exportContext)
      toast.success('Excel generado con los movimientos filtrados')
    } catch (error) {
      console.error('Cash Excel export error:', error)
      toast.error('No se pudo generar el Excel de caja')
    }
  }

  const handleExportPdf = async () => {
    if (analyticsRows.length === 0) {
      toast.error('No hay movimientos para exportar con los filtros actuales')
      return
    }

    try {
      const result = await savePdfDocument({
        html: buildCashMovementsPdfHtml(analyticsRows, exportContext),
        defaultFileName: getCashMovementsPdfFileName(period),
        landscape: true
      })

      if (result.canceled) {
        return
      }

      toast.success(
        result.mode === 'desktop' ? 'PDF generado con los movimientos filtrados' : 'Se abrió el diálogo para guardar el PDF'
      )
    } catch (error) {
      console.error('Cash PDF export error:', error)
      toast.error('No se pudo generar el PDF de caja')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Caja</h1>
        </div>

        <div className="flex gap-3">
          <button onClick={() => void loadCashHistory()} className="btn btn-secondary">
            Historial
          </button>
          <button onClick={() => setPrivatePinModal(true)} className="btn btn-secondary" title="Sección privada">
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
                Movimiento
              </button>
              <button onClick={() => setCashCountModal(true)} className="btn btn-secondary">
                Cuadrar caja
              </button>
              <button onClick={() => setCloseCashModal(true)} className="btn btn-primary">
                Cerrar caja
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Saldo inicial</span>
            <div className="flex items-center gap-2">
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
          </div>
          <div className="space-y-1 text-sm">
            {commercialPaymentMethods.map((method) => (
              <div key={method} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{paymentMethodLabel(method)}</span>
                <strong>{formatCurrency(Number(paymentsByMethod[method] || 0))}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Cobrado real</span>
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

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Trabajo realizado</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Día</span>
              <strong>{formatCurrency(Number(workPerformedCards.day || 0))}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Mes</span>
              <strong>{formatCurrency(Number(workPerformedCards.month || 0))}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Año</span>
              <strong>{formatCurrency(Number(workPerformedCards.year || 0))}</strong>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Saldo actual</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(Number(currentCashBalance || 0))}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movimientos unificados</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void handleExportExcel()} className="btn btn-secondary btn-sm">
              Exportar Excel
            </button>
            <button onClick={() => void handleExportPdf()} className="btn btn-secondary btn-sm">
              Exportar PDF
            </button>
            <button
              onClick={() => void Promise.all([loadAnalytics(), loadRanking(), loadSummary()])}
              className="btn btn-secondary btn-sm"
            >
              Actualizar
            </button>
          </div>
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
                          {formatQuantity(Number(item.quantity || 0))} uds · {formatCurrency(Number(item.revenue))}
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
              {commercialPaymentMethods.map((method) => (
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
            Efectivo oficial esperado: <strong>{formatCurrency(Number(currentCashBalance || 0))}</strong>
          </div>
          <button
            onClick={() => {
              setCloseCashModal(false)
              setCashCountModal(true)
            }}
            className="btn btn-secondary w-full"
          >
            Cuadrar caja
          </button>
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

      <Modal isOpen={cashCountModal} onClose={() => setCashCountModal(false)} title="Cuadrar caja" maxWidth="4xl">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Efectivo oficial esperado
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
                {cashCountExpectedVisible ? formatCurrency(cashCountSummary.expectedTotal) : '••••••'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Recuento manual de billetes y monedas. Tarjeta, Bizum y caja privada se muestran aparte.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-gray-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={cashCountBlind}
                  onChange={(event) => {
                    setCashCountBlind(event.target.checked)
                    setCashCountRevealed(false)
                  }}
                  className="h-4 w-4 accent-indigo-600"
                />
                Recuento a ciegas
              </label>
              {cashCountBlind && !cashCountRevealed && (
                <button
                  onClick={() => setCashCountRevealed(true)}
                  className="btn btn-secondary h-9 px-3 text-xs"
                  type="button"
                >
                  Comprobar
                </button>
              )}
              <button
                onClick={() => handleResetCashCount()}
                className="btn btn-secondary h-9 px-3 text-xs"
                type="button"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-800">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Billetes
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {cashCountPieces.billPieces} {cashCountPieces.billPieces === 1 ? 'pieza' : 'piezas'}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {CASH_COUNT_BILL_DENOMINATIONS.map((denomination, billIndex) => (
                  <div
                    key={denomination.key}
                    className="grid grid-cols-[minmax(3.5rem,auto)_5.5rem_minmax(0,1fr)] items-center gap-3"
                  >
                    <span className="text-xl font-bold leading-none tabular-nums whitespace-nowrap text-slate-800 dark:text-slate-100">
                      {denomination.label}
                    </span>
                    <input
                      ref={(element) => {
                        cashCountInputRefs.current[billIndex] = element
                      }}
                      type="text"
                      inputMode="numeric"
                      value={cashCountQuantities[denomination.key]}
                      onChange={(event) => handleCashCountQuantityChange(denomination.key, event.target.value)}
                      onFocus={(event) => event.target.select()}
                      onKeyDown={(event) => handleCashCountKeyDown(billIndex, event)}
                      className="input h-10 text-center font-semibold tabular-nums"
                      placeholder="0"
                    />
                    <div className="min-w-0 text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        Subtotal
                      </p>
                      <p className="truncate text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(cashCountSummary.lineTotals[denomination.key] || 0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/10">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
                  Monedas
                </h3>
                <span className="text-[11px] text-amber-600/80 dark:text-amber-400/70">
                  {cashCountPieces.coinPieces} {cashCountPieces.coinPieces === 1 ? 'pieza' : 'piezas'}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {CASH_COUNT_COIN_DENOMINATIONS.map((denomination, coinIndex) => {
                  const refIndex = CASH_COUNT_BILL_DENOMINATIONS.length + coinIndex
                  return (
                    <div
                      key={denomination.key}
                      className="grid grid-cols-[minmax(3.5rem,auto)_5.5rem_minmax(0,1fr)] items-center gap-3"
                    >
                      <span className="text-xl font-bold leading-none tabular-nums whitespace-nowrap text-amber-800 dark:text-amber-100">
                        {denomination.label}
                      </span>
                      <input
                        ref={(element) => {
                          cashCountInputRefs.current[refIndex] = element
                        }}
                        type="text"
                        inputMode="numeric"
                        value={cashCountQuantities[denomination.key]}
                        onChange={(event) => handleCashCountQuantityChange(denomination.key, event.target.value)}
                        onFocus={(event) => event.target.select()}
                        onKeyDown={(event) => handleCashCountKeyDown(refIndex, event)}
                        className="input h-10 border-amber-200 bg-white text-center font-semibold tabular-nums dark:border-amber-900/60 dark:bg-gray-900"
                        placeholder="0"
                      />
                      <div className="min-w-0 text-right">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-500 dark:text-amber-400/80">
                          Subtotal
                        </p>
                        <p className="truncate text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                          {formatCurrency(cashCountSummary.lineTotals[denomination.key] || 0)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <aside className="space-y-3">
              <div className="rounded-3xl bg-slate-950 px-5 py-6 text-center text-white shadow-lg dark:bg-slate-100 dark:text-slate-950">
                <p className="text-xs uppercase tracking-[0.28em] text-white/70 dark:text-slate-500">
                  Efectivo contado
                </p>
                <p className="mt-2 text-3xl font-black tabular-nums tracking-tight whitespace-nowrap">
                  {formatCurrency(cashCountSummary.total)}
                </p>
                <p className="mt-1 text-[11px] text-white/60 dark:text-slate-500">
                  {cashCountPieces.totalPieces} {cashCountPieces.totalPieces === 1 ? 'pieza' : 'piezas'} en total
                </p>
              </div>

              {cashCountExpectedVisible && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-center ${
                    cashCountSummary.isBalanced
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200'
                      : cashCountSummary.difference > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200'
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">Diferencia</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight whitespace-nowrap">
                    {cashCountSummary.isBalanced
                      ? 'Cuadrada'
                      : `${cashCountSummary.difference > 0 ? '+' : ''}${formatCurrency(cashCountSummary.difference)}`}
                  </p>
                  <p className="mt-1 text-[11px] opacity-80">{cashCountStatus.detail}</p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-gray-900/50">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Cobros del día
                </h3>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Efectivo oficial</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(Number(closingSummary.officialCashCollected || 0))}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Tarjeta</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(Number(closingSummary.cardCollected || 0))}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Bizum</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(Number(closingSummary.bizumCollected || 0))}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Caja privada</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(Number(closingSummary.privateCashCollected || 0))}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Total sin abonos</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(Number(closingSummary.totalCollectedExcludingAbono || 0))}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-gray-900/50">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Resumen
                </h3>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Billetes</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(cashCountSummary.billTotal)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Monedas</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(cashCountSummary.coinTotal)}
                    </strong>
                  </div>
                </div>
              </div>

              {cashCountExpectedVisible && cashCountSummary.difference !== 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-gray-900/50">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Motivo de la diferencia *
                  </label>
                  <textarea
                    value={cashCountNote}
                    onChange={(event) => setCashCountNote(event.target.value)}
                    className="input mt-2 w-full resize-none text-sm"
                    rows={2}
                    placeholder="Error de cambio, vuelto incorrecto, etc."
                  />
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={() => void handleUseCashCountForClosing()}
                  className="btn btn-primary w-full"
                  disabled={cashCountSaving}
                  type="button"
                >
                  Usar como saldo de cierre
                </button>
                <button
                  onClick={() => void handleSaveCashCount()}
                  className="btn btn-secondary w-full"
                  disabled={cashCountSaving || cashCountPieces.totalPieces === 0}
                  type="button"
                >
                  Guardar recuento
                </button>
              </div>
            </aside>
          </div>
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
            onClick={() => void handleOpenPrivateCashSection()}
            className="btn btn-primary w-full"
            disabled={privatePinInput.length !== 4 || privateCashLoading}
          >
            {privateCashLoading ? 'Validando...' : 'Entrar'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={privateCashModal}
        onClose={closePrivateCashSection}
        title="Cobros privados"
        maxWidth="4xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-900/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Rango seleccionado
                  </p>
                  <p className="mt-1 text-xl font-bold capitalize text-slate-900 dark:text-slate-100">
                    {privateRangeTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {privateCashRows.length} {privateCashRows.length === 1 ? 'cobro' : 'cobros'} · Total {formatCurrency(privateCashTotal)}
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
                      onClick={() => void applyPrivateRangePreset(option.key, privateCalendarDate)}
                      className={`btn ${privateRangePreset === option.key ? 'btn-primary' : 'btn-secondary'} h-9 px-3 text-xs`}
                      disabled={privateCashLoading}
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
                    value={privateDateRange.startDate}
                    onChange={(event) => void handlePrivateDateChange('startDate', event.target.value)}
                    className="input"
                    disabled={privateCashLoading}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={privateDateRange.endDate}
                    onChange={(event) => void handlePrivateDateChange('endDate', event.target.value)}
                    className="input"
                    disabled={privateCashLoading}
                  />
                </label>
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPrivateCalendarMonth((current) => subMonths(current, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  title="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xs font-semibold capitalize tracking-[0.08em] text-slate-700 dark:text-slate-200">
                  {formatCalendarText(privateCalendarMonth, 'MMMM YYYY')}
                </p>
                <button
                  type="button"
                  onClick={() => setPrivateCalendarMonth((current) => addMonths(current, 1))}
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
                {privateCalendarDays.map((day) => {
                  const isCurrentMonth = isSameMonth(day, privateCalendarMonth)
                  const isSelectedDay = isSameDay(day, privateCalendarDate)
                  const isToday = isSameDay(day, new Date())

                  return (
                    <button
                      key={formatDateInput(day)}
                      type="button"
                      onClick={() => void handlePrivateCalendarDaySelect(day)}
                      className={`h-8 rounded-lg text-[11px] font-semibold transition ${
                        isSelectedDay
                          ? 'bg-primary-600 text-white'
                          : isToday
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                            : isCurrentMonth
                              ? 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
                              : 'text-slate-400 hover:bg-white/70 dark:text-slate-600 dark:hover:bg-slate-800'
                      }`}
                      disabled={privateCashLoading}
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
                  {formatCurrency(privateCashTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Cobros
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{privateCashRows.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Desde
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatCalendarText(parseDateInput(privateDateRange.startDate), 'dddd D [de] MMMM')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Hasta
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatCalendarText(parseDateInput(privateDateRange.endDate), 'dddd D [de] MMMM')}
                </p>
              </div>
            </div>

            <div className="max-h-[30rem] overflow-y-auto space-y-3 pr-1">
              {privateCashLoading ? (
                <div className="rounded-lg border border-slate-200 py-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Cargando cobros privados...
                </div>
              ) : privateCashRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 py-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No hay cobros privados en el rango seleccionado.
                </div>
              ) : (
                privateCashRows.map((row) => (
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
