import { useMemo, useRef, useState } from 'react'
import { addDays, addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/Modal'
import { savePdfDocument } from '../../utils/desktop'
import {
  buildCashMovementsPdfHtml,
  exportCashMovementsWorkbook,
  getCashMovementsPdfFileName
} from '../../utils/exports'
import {
  buildEmptyCashCountInputs,
  calculateCashCountSummary,
  CASH_COUNT_BILL_DENOMINATIONS,
  CASH_COUNT_COIN_DENOMINATIONS,
  CASH_COUNT_DENOMINATIONS,
  getCashCountPieceCounts
} from '../../utils/cashCount'
import { endOfCalendarWeek, formatCalendarText, startOfCalendarWeek } from '../../utils/calendarLocale'
import { formatCurrency } from '../../utils/format'
import { paymentMethodLabel } from '../../utils/tickets'
import {
  addCashRegisterMovement,
  closeCashRegister,
  openCashRegister,
  saveCashCount,
  updateCashOpeningBalance
} from './cashApi'
import CashHistoryModal from './components/CashHistoryModal'
import CashMovementsSection from './components/CashMovementsSection'
import CashRankingFiltersSection from './components/CashRankingFiltersSection'
import CashSummarySection from './components/CashSummarySection'
import PrivateCashModal from './components/PrivateCashModal'
import { useCashPageData } from './useCashPageData'
import type {
  CashFilters,
  CashRankingGroup,
  CommercialPaymentMethod,
  LastClosure,
  Period,
  PrivateRangePreset
} from './types'

const parseDenominationsField = (raw: string | null | undefined): Record<string, number> => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const out: Record<string, number> = {}
      for (const [key, value] of Object.entries(parsed)) {
        const num = Number(value)
        if (Number.isFinite(num) && num > 0) out[key] = Math.trunc(num)
      }
      return out
    }
  } catch {
    // ignore
  }
  return {}
}

const commercialPaymentMethods: readonly CommercialPaymentMethod[] = ['CASH', 'CARD', 'BIZUM', 'ABONO']
const defaultCashFilters: CashFilters = {
  clientId: '',
  serviceId: '',
  productId: '',
  paymentMethod: '',
  type: 'ALL'
}
const rankingGroups: CashRankingGroup[] = [
  { key: 'services', title: 'Tratamientos' },
  { key: 'products', title: 'Productos' }
]

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
  const [period, setPeriod] = useState<Period>('DAY')
  const [filters, setFilters] = useState<CashFilters>(defaultCashFilters)
  const {
    activeCashRegister,
    analyticsLoading,
    analyticsRows,
    cashHistory,
    clearPrivateCashData,
    clients,
    loadCashHistory,
    loadAnalytics,
    loadPrivateNoTicketCash,
    loadRanking,
    loadSummary,
    privateCashLoading,
    privateCashRows,
    privateCashTotal,
    products,
    ranking,
    services,
    summary
  } = useCashPageData({
    filters,
    period
  })

  const [openCashModal, setOpenCashModal] = useState(false)
  const [cashCountModal, setCashCountModal] = useState(false)
  const [cashCountStep, setCashCountStep] = useState<'COUNT' | 'FLOAT'>('COUNT')
  const [movementModal, setMovementModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [privatePinModal, setPrivatePinModal] = useState(false)
  const [privateCashModal, setPrivateCashModal] = useState(false)
  const [privatePinInput, setPrivatePinInput] = useState('')
  const [privateCashAccessPin, setPrivateCashAccessPin] = useState('')
  const [privateRangePreset, setPrivateRangePreset] = useState<PrivateRangePreset>('DAY')
  const [privateCalendarDate, setPrivateCalendarDate] = useState<Date>(new Date())
  const [privateCalendarMonth, setPrivateCalendarMonth] = useState<Date>(new Date())
  const [privateDateRange, setPrivateDateRange] = useState(() => buildPrivateDateRange('DAY', new Date()))
  const [editOpeningBalanceModal, setEditOpeningBalanceModal] = useState(false)

  const [openingBalance, setOpeningBalance] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  const [cashCountQuantities, setCashCountQuantities] = useState<Record<string, string>>(() =>
    buildEmptyCashCountInputs()
  )
  const [nextDayFloatQuantities, setNextDayFloatQuantities] = useState<Record<string, string>>(() =>
    buildEmptyCashCountInputs()
  )
  const [cashCountBlind, setCashCountBlind] = useState(false)
  const [cashCountRevealed, setCashCountRevealed] = useState(false)
  const [cashCountNote, setCashCountNote] = useState('')
  const [cashCountSaving, setCashCountSaving] = useState(false)
  const [closingWithFloatSaving, setClosingWithFloatSaving] = useState(false)
  const [openingWithInheritedSaving, setOpeningWithInheritedSaving] = useState(false)
  const cashCountInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'>('EXPENSE')
  const [movementPaymentMethod, setMovementPaymentMethod] = useState<'CASH' | 'CARD' | 'BIZUM' | 'OTHER' | ''>('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementCategory, setMovementCategory] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [movementReference, setMovementReference] = useState('')

  const [newOpeningBalance, setNewOpeningBalance] = useState('')
  const [editOpeningNotes, setEditOpeningNotes] = useState('')

  const handlePeriodChange = (nextPeriod: Period) => {
    setPeriod(nextPeriod)
  }

  const handleCashFilterChange = <Key extends keyof CashFilters>(key: Key, value: CashFilters[Key]) => {
    setFilters((current) => ({
      ...current,
      [key]: value
    }))
  }

  const handleResetCashFilters = () => {
    setFilters(defaultCashFilters)
  }

  const handlePrepareOpeningBalanceEdit = () => {
    if (!activeCashRegister) return
    setNewOpeningBalance(String(activeCashRegister.openingBalance))
    setEditOpeningNotes('')
    setEditOpeningBalanceModal(true)
  }

  const handleOpenCashWithCustomAmount = (amount: number) => {
    setOpeningBalance(String(amount))
    setOpenCashModal(true)
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
    clearPrivateCashData()
    resetPrivateCashFilters()
  }

  const loadPrivateCashSection = async (options?: {
    pin?: string
    startDate?: string
    endDate?: string
  }) => {
    const accessPin = options?.pin || privateCashAccessPin
    if (!accessPin) {
      toast.error('Introduce la contraseña para abrir la sección privada')
      return false
    }

    const ok = await loadPrivateNoTicketCash({
      endDate: options?.endDate || privateDateRange.endDate,
      pin: accessPin,
      startDate: options?.startDate || privateDateRange.startDate
    })

    if (ok && options?.pin) {
      setPrivateCashAccessPin(accessPin)
    }

    if (!ok) {
      setPrivateCashAccessPin('')
      setPrivateCashModal(false)
    }

    return ok
  }

  const handleOpenPrivateCashSection = async () => {
    const ok = await loadPrivateCashSection({ pin: privatePinInput })
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
      await loadPrivateCashSection(nextRange)
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
      await loadPrivateCashSection(nextRange)
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
        await loadPrivateCashSection(nextRange)
      }
      return
    }

    await applyPrivateRangePreset(privateRangePreset, date)
  }

  const openCashCountModal = () => {
    setCashCountStep('COUNT')
    setCashCountModal(true)
  }

  const handleOpenHistoryModal = async () => {
    const ok = await loadCashHistory()
    if (ok) {
      setHistoryModal(true)
    }
  }

  const handleRefreshCashSections = async () => {
    await Promise.all([loadAnalytics(), loadRanking(), loadSummary()])
  }

  const handlePrivateCalendarPreviousMonth = () => {
    setPrivateCalendarMonth((current) => subMonths(current, 1))
  }

  const handlePrivateCalendarNextMonth = () => {
    setPrivateCalendarMonth((current) => addMonths(current, 1))
  }

  const closeCashCountModal = () => {
    setCashCountModal(false)
    setCashCountStep('COUNT')
  }

  const handleOpenCash = async () => {
    try {
      await openCashRegister({
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

  const handleOpenCashWithInheritedFloat = async () => {
    if (!lastClosure) return
    try {
      setOpeningWithInheritedSaving(true)
      await openCashRegister({
        useLastClosureFloat: true,
        notes: null
      })
      toast.success(`Caja abierta con fondo heredado de ${formatCurrency(lastClosure.nextDayFloat)}`)
      await loadSummary()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo abrir la caja con el fondo heredado')
    } finally {
      setOpeningWithInheritedSaving(false)
    }
  }

  const handleAddMovement = async () => {
    if (!activeCashRegister) return

    try {
      await addCashRegisterMovement(activeCashRegister.id, {
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
      await updateCashOpeningBalance(activeCashRegister.id, {
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

  const handleNextDayFloatQuantityChange = (denominationKey: string, value: string) => {
    const normalizedValue = value.replace(/\D/g, '').slice(0, 4)
    setNextDayFloatQuantities((current) => ({
      ...current,
      [denominationKey]: normalizedValue
    }))
  }

  const handleResetCashCount = () => {
    setCashCountQuantities(buildEmptyCashCountInputs())
    setNextDayFloatQuantities(buildEmptyCashCountInputs())
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

  const openingBalanceAmount = Number(summary?.cards?.openingBalance || 0)
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
  const manualAdjustments = summary?.cards?.manualAdjustments || {
    deposits: 0,
    expenses: 0,
    withdrawals: 0
  }
  const registeredOutflows =
    Number(manualAdjustments.expenses || 0) + Number(manualAdjustments.withdrawals || 0)
  const manualBalanceDelta = Number(manualAdjustments.deposits || 0) - registeredOutflows
  const cashCountSummary = useMemo(
    () => calculateCashCountSummary(cashCountQuantities, Number(currentCashBalance || 0)),
    [cashCountQuantities, currentCashBalance]
  )
  const nextDayFloatSummary = useMemo(
    () => calculateCashCountSummary(nextDayFloatQuantities, 0),
    [nextDayFloatQuantities]
  )
  const lastClosure: LastClosure | null = summary?.lastClosure || null
  const inheritedOpeningDenominations = useMemo(
    () => parseDenominationsField(activeCashRegister?.openingDenominations ?? null),
    [activeCashRegister?.openingDenominations]
  )
  const hasInheritedOpeningBreakdown = Object.keys(inheritedOpeningDenominations).length > 0
  const nextDayFloatPerDenomination = useMemo(() => {
    const map: Record<string, number> = {}
    for (const denomination of CASH_COUNT_DENOMINATIONS) {
      const raw = nextDayFloatQuantities[denomination.key]
      map[denomination.key] = raw ? Number.parseInt(raw, 10) || 0 : 0
    }
    return map
  }, [nextDayFloatQuantities])
  const countedPerDenomination = useMemo(() => {
    const map: Record<string, number> = {}
    for (const denomination of CASH_COUNT_DENOMINATIONS) {
      const raw = cashCountQuantities[denomination.key]
      map[denomination.key] = raw ? Number.parseInt(raw, 10) || 0 : 0
    }
    return map
  }, [cashCountQuantities])
  const overdrawnDenominations = useMemo(
    () =>
      CASH_COUNT_DENOMINATIONS.filter(
        (denomination) =>
          nextDayFloatPerDenomination[denomination.key] >
          countedPerDenomination[denomination.key]
      ),
    [countedPerDenomination, nextDayFloatPerDenomination]
  )
  const withdrawalAmount = Math.max(0, cashCountSummary.total - nextDayFloatSummary.total)
  const withdrawalBreakdown = useMemo(
    () =>
      CASH_COUNT_DENOMINATIONS.map((denomination) => ({
        denomination,
        pieces:
          (countedPerDenomination[denomination.key] || 0) -
          (nextDayFloatPerDenomination[denomination.key] || 0)
      })).filter((entry) => entry.pieces > 0),
    [countedPerDenomination, nextDayFloatPerDenomination]
  )
  const cashCountStatus = useMemo(() => {
    if (cashCountSummary.isBalanced) {
      return {
        title: 'Arqueo cuadrado',
        detail: 'El recuento coincide con el saldo esperado.',
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200'
      }
    }

    if (cashCountSummary.difference > 0) {
      return {
        title: 'Sobrante de arqueo',
        detail: `Hay ${formatCurrency(cashCountSummary.difference)} de más respecto al saldo esperado. Indica el motivo.`,
        className:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
      }
    }

    return {
      title: 'Faltante de arqueo',
      detail: `Faltan ${formatCurrency(Math.abs(cashCountSummary.difference))} respecto al saldo esperado. Indica el motivo.`,
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
      await saveCashCount(activeCashRegister.id, {
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

  const handleContinueToNextDayFloat = () => {
    if (cashCountPieces.totalPieces === 0) {
      toast.error('Introduce al menos una denominación para continuar')
      return
    }

    if (cashCountBlind && !cashCountRevealed) {
      setCashCountRevealed(true)
    }

    setCashCountStep('FLOAT')
  }

  const handleCloseWithNextDayFloat = async () => {
    if (!activeCashRegister) {
      toast.error('No hay caja abierta')
      return
    }

    if (cashCountSummary.difference !== 0 && !cashCountNote.trim()) {
      toast.error('Indica un motivo para la diferencia antes de cerrar')
      return
    }

    if (overdrawnDenominations.length > 0) {
      toast.error('No puedes dejar más piezas de las contadas en alguna denominación')
      return
    }

    if (nextDayFloatSummary.total > cashCountSummary.total + 0.01) {
      toast.error('El fondo para mañana no puede superar el efectivo contado')
      return
    }

    try {
      setClosingWithFloatSaving(true)
      await closeCashRegister(activeCashRegister.id, {
        countedTotal: Number(cashCountSummary.total.toFixed(2)),
        countedDenominations: countedPerDenomination,
        nextDayFloat: Number(nextDayFloatSummary.total.toFixed(2)),
        nextDayFloatDenominations: nextDayFloatPerDenomination,
        differenceReason: cashCountSummary.difference !== 0 ? cashCountNote.trim() : null,
        notes: null
      })
      toast.success('Caja cerrada y fondo guardado para el próximo día')
      setCashCountModal(false)
      setCashCountStep('COUNT')
      setCashCountQuantities(buildEmptyCashCountInputs())
      setNextDayFloatQuantities(buildEmptyCashCountInputs())
      setCashCountNote('')
      setCashCountRevealed(false)
      await loadSummary()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo cerrar la caja')
    } finally {
      setClosingWithFloatSaving(false)
    }
  }

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
          <button onClick={() => void handleOpenHistoryModal()} className="btn btn-secondary">
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
              <button onClick={() => openCashCountModal()} className="btn btn-primary">
                Cuadrar caja
              </button>
            </>
          )}
        </div>
      </div>

      <CashSummarySection
        canEditOpeningBalance={Boolean(activeCashRegister)}
        currentCashBalance={Number(currentCashBalance || 0)}
        incomeCards={incomeCards}
        lastClosure={lastClosure}
        onEditOpeningBalance={handlePrepareOpeningBalanceEdit}
        onOpenCashWithInheritedFloat={() => void handleOpenCashWithInheritedFloat()}
        onOpenCashWithOtherAmount={handleOpenCashWithCustomAmount}
        openingBalanceAmount={openingBalanceAmount}
        openingWithInheritedSaving={openingWithInheritedSaving}
        paymentMethods={commercialPaymentMethods}
        paymentsByMethod={paymentsByMethod}
        workPerformedCards={workPerformedCards}
      />

      <CashMovementsSection
        analyticsLoading={analyticsLoading}
        analyticsRows={analyticsRows}
        onExportExcel={() => void handleExportExcel()}
        onExportPdf={() => void handleExportPdf()}
        onRefresh={() => void handleRefreshCashSections()}
      />

      <CashRankingFiltersSection
        clients={clients}
        filters={filters}
        onFilterChange={handleCashFilterChange}
        onPeriodChange={handlePeriodChange}
        onResetFilters={handleResetCashFilters}
        paymentMethods={commercialPaymentMethods}
        period={period}
        products={products}
        ranking={ranking}
        rankingGroups={rankingGroups}
        services={services}
      />

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

      <Modal isOpen={cashCountModal} onClose={() => closeCashCountModal()} title="Cuadrar caja" maxWidth="4xl">
        <div className="space-y-5">
          {hasInheritedOpeningBreakdown && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                    Fondo heredado del cierre anterior
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                    {formatCurrency(Number(activeCashRegister?.openingBalance || 0))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CASH_COUNT_DENOMINATIONS.filter(
                    (denomination) => (inheritedOpeningDenominations[denomination.key] || 0) > 0
                  ).map((denomination) => (
                    <span
                      key={denomination.key}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800 dark:border-indigo-900/70 dark:bg-indigo-950/40 dark:text-indigo-200"
                    >
                      <span className="tabular-nums">
                        {inheritedOpeningDenominations[denomination.key]}
                      </span>
                      <span className="text-indigo-400 dark:text-indigo-500">×</span>
                      <span>{denomination.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {cashCountStep === 'COUNT' ? 'Paso 1 · Conteo real en caja' : 'Paso 2 · Cambio para mañana'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {cashCountStep === 'COUNT'
                  ? 'Cuenta el efectivo real por denominaciones y comprueba la diferencia de arqueo.'
                  : 'Ahora indica qué billetes y monedas dejas como fondo para el siguiente día.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cashCountStep === 'COUNT' && (
                <>
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
                </>
              )}
            </div>
          </div>

          {cashCountStep === 'COUNT' ? (
            <>
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-gray-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Fondo inicial cargado
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {cashCountExpectedVisible ? formatCurrency(openingBalanceAmount) : '••••••'}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                    Cobros en efectivo
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                    {cashCountExpectedVisible
                      ? formatCurrency(Number(closingSummary.officialCashCollected || 0))
                      : '••••••'}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
                    Ajustes manuales
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                    {cashCountExpectedVisible
                      ? manualBalanceDelta === 0
                        ? formatCurrency(0)
                        : `${manualBalanceDelta > 0 ? '+' : ''}${formatCurrency(manualBalanceDelta)}`
                      : '••••••'}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">
                    Depósitos {cashCountExpectedVisible ? formatCurrency(Number(manualAdjustments.deposits || 0)) : '••••••'}
                    {' · '}
                    Salidas {cashCountExpectedVisible ? formatCurrency(registeredOutflows) : '••••••'}
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                    Efectivo esperado
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                    {cashCountExpectedVisible ? formatCurrency(Number(currentCashBalance || 0)) : '••••••'}
                  </p>
                </div>
              </section>

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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">Diferencia de arqueo</p>
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
                      Flujo del día
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
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-300">Salidas registradas</span>
                        <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(registeredOutflows)}
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
                </aside>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={closeCashCountModal}
                  className="btn btn-secondary"
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleSaveCashCount()}
                  className="btn btn-secondary"
                  disabled={cashCountSaving || cashCountPieces.totalPieces === 0}
                  type="button"
                >
                  {cashCountSaving ? 'Guardando recuento...' : 'Guardar recuento parcial'}
                </button>
                <button
                  onClick={handleContinueToNextDayFloat}
                  className="btn btn-primary"
                  disabled={cashCountPieces.totalPieces === 0}
                  type="button"
                >
                  {cashCountBlind && !cashCountRevealed
                    ? 'Comprobar y continuar'
                    : 'Continuar con cambio para mañana'}
                </button>
              </div>
            </>
          ) : (
            <>
              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                    Efectivo esperado
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                    {formatCurrency(Number(currentCashBalance || 0))}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-gray-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Efectivo contado
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(cashCountSummary.total)}
                  </p>
                </div>
                <div
                  className={`rounded-2xl border p-4 ${
                    cashCountSummary.isBalanced
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200'
                      : cashCountSummary.difference > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200'
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">
                    Diferencia de arqueo
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight whitespace-nowrap">
                    {cashCountSummary.isBalanced
                      ? 'Cuadrada'
                      : `${cashCountSummary.difference > 0 ? '+' : ''}${formatCurrency(cashCountSummary.difference)}`}
                  </p>
                  <p className="mt-1 text-[11px] opacity-80">
                    La retirada es independiente de este descuadre.
                  </p>
                </div>
              </section>

              {cashCountSummary.difference !== 0 && (
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

              <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm dark:border-indigo-900/60 dark:bg-indigo-950/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                      Cambio para mañana
                    </h3>
                    <p className="mt-1 text-xs text-indigo-800/80 dark:text-indigo-200/80">
                      Indica cuántos billetes y monedas dejas en caja como fondo para el día siguiente. El resto será la retirada.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700/80 dark:text-indigo-300/80">
                      Total a dejar
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                      {formatCurrency(nextDayFloatSummary.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-indigo-200 bg-white/60 p-3 dark:border-indigo-900/60 dark:bg-gray-900/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700/80 dark:text-indigo-300/80">
                      Billetes a dejar
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {CASH_COUNT_BILL_DENOMINATIONS.map((denomination) => {
                        const countedPieces = countedPerDenomination[denomination.key] || 0
                        const leavePieces = nextDayFloatPerDenomination[denomination.key] || 0
                        const overdrawn = leavePieces > countedPieces
                        return (
                          <div
                            key={`leave-${denomination.key}`}
                            className="grid grid-cols-[minmax(3.5rem,auto)_5rem_auto] items-center gap-2"
                          >
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {denomination.label}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={nextDayFloatQuantities[denomination.key]}
                              onChange={(event) =>
                                handleNextDayFloatQuantityChange(denomination.key, event.target.value)
                              }
                              onFocus={(event) => event.target.select()}
                              className={`input h-9 text-center font-semibold tabular-nums ${
                                overdrawn ? 'border-rose-400 text-rose-700' : ''
                              }`}
                              placeholder="0"
                            />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              de {countedPieces}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                      Monedas a dejar
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {CASH_COUNT_COIN_DENOMINATIONS.map((denomination) => {
                        const countedPieces = countedPerDenomination[denomination.key] || 0
                        const leavePieces = nextDayFloatPerDenomination[denomination.key] || 0
                        const overdrawn = leavePieces > countedPieces
                        return (
                          <div
                            key={`leave-${denomination.key}`}
                            className="grid grid-cols-[minmax(3.5rem,auto)_5rem_auto] items-center gap-2"
                          >
                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                              {denomination.label}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={nextDayFloatQuantities[denomination.key]}
                              onChange={(event) =>
                                handleNextDayFloatQuantityChange(denomination.key, event.target.value)
                              }
                              onFocus={(event) => event.target.select()}
                              className={`input h-9 border-amber-200 bg-white text-center font-semibold tabular-nums dark:border-amber-900/60 dark:bg-gray-900 ${
                                overdrawn ? 'border-rose-400 text-rose-700' : ''
                              }`}
                              placeholder="0"
                            />
                            <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 tabular-nums">
                              de {countedPieces}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {overdrawnDenominations.length > 0 && (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200">
                    Estás dejando más piezas de las contadas en: {overdrawnDenominations.map((d) => d.label).join(', ')}.
                  </p>
                )}
              </section>

              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-gray-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Efectivo contado
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(cashCountSummary.total)}
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
                    Fondo dejado para mañana
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                    {formatCurrency(nextDayFloatSummary.total)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-900 bg-slate-950 p-4 text-white dark:bg-slate-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                    Retirada automática
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatCurrency(withdrawalAmount)}
                  </p>
                  <p className="mt-1 text-[11px] text-white/60">
                    Se registrará como salida de caja al cerrar.
                  </p>
                  {withdrawalBreakdown.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {withdrawalBreakdown.map(({ denomination, pieces }) => (
                        <span
                          key={`withdrawal-${denomination.key}`}
                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold"
                        >
                          <span className="tabular-nums">{pieces}</span>
                          <span className="opacity-70">×</span>
                          <span>{denomination.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={closeCashCountModal}
                  className="btn btn-secondary"
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setCashCountStep('COUNT')}
                  className="btn btn-secondary"
                  type="button"
                >
                  Volver al recuento
                </button>
                <button
                  onClick={() => void handleCloseWithNextDayFloat()}
                  className="btn btn-primary"
                  disabled={
                    closingWithFloatSaving ||
                    cashCountPieces.totalPieces === 0 ||
                    overdrawnDenominations.length > 0
                  }
                  type="button"
                >
                  {closingWithFloatSaving ? 'Guardando cierre...' : 'Establecer cambio para el próximo día'}
                </button>
              </div>
            </>
          )}
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

      <PrivateCashModal
        calendarDate={privateCalendarDate}
        calendarDays={privateCalendarDays}
        calendarMonth={privateCalendarMonth}
        dateRange={privateDateRange}
        isLoading={privateCashLoading}
        isOpen={privateCashModal}
        onCalendarDaySelect={(date) => void handlePrivateCalendarDaySelect(date)}
        onClose={closePrivateCashSection}
        onDateRangeChange={(field, value) => void handlePrivateDateChange(field, value)}
        onNextMonth={handlePrivateCalendarNextMonth}
        onPrevMonth={handlePrivateCalendarPreviousMonth}
        onRangePresetChange={(preset) => void applyPrivateRangePreset(preset, privateCalendarDate)}
        rangePreset={privateRangePreset}
        rangeTitle={privateRangeTitle}
        rows={privateCashRows}
        totalAmount={privateCashTotal}
      />

      <CashHistoryModal
        cashHistory={cashHistory}
        isOpen={historyModal}
        onClose={() => setHistoryModal(false)}
      />
    </div>
  )
}
