import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Cake,
  Link2,
  AlertTriangle,
  Ticket,
  FileText,
  Printer,
  StickyNote,
  Trash2,
  Pencil
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatDate, formatPhone, formatDateTime, getInitials } from '../utils/format'
import {
  ClientAssetsResponse,
  isDesktop,
  getPrintTicketSuccessMessage,
  listClientAssets,
  normalizeDesktopAssetUrl,
  printTicket
} from '../utils/desktop'
import {
  buildPendingCollectionTicketPayload,
  buildSaleTicketPayload,
  buildQuoteHtml,
  paymentMethodLabel,
  salePaymentMethodLabel
} from '../utils/tickets'
import { buildClientPendingSummary, type PendingPaymentRow } from '../utils/clientPendingPayments'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ClientForm from '../components/ClientForm'
import BonoCard from '../components/BonoCard'
import BonoPackModal from '../components/BonoPackModal'
import AppointmentForm from '../components/AppointmentForm'
import ClientAssetExplorer from '../components/ClientAssetExplorer'

const toolbarItems = [
  { icon: AlertTriangle, label: 'Pendientes', tab: 'pending' as const },
  { icon: CreditCard, label: 'Abonos', tab: 'abonos' as const },
  { icon: Ticket, label: 'Bonos', tab: 'bonos' as const },
  { icon: FileText, label: 'Presupuestos', tab: 'quotes' as const }
]

type AccountBalanceMovement = {
  id: string
  type: 'TOP_UP' | 'CONSUMPTION' | 'ADJUSTMENT'
  paymentMethod?: 'CASH' | 'CARD' | 'BIZUM' | null
  operationDate: string
  description: string
  referenceItem?: string | null
  amount: number
  balanceAfter: number
  notes?: string | null
}

const accountBalanceMovementTypeLabel: Record<AccountBalanceMovement['type'], string> = {
  TOP_UP: 'Recarga',
  CONSUMPTION: 'Consumo',
  ADJUSTMENT: 'Ajuste'
}

const accountBalanceDateInput = () => new Date().toISOString().split('T')[0]
const pendingSettlementDateTimeInput = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

type PendingCollectionExecutionOptions = {
  paymentMethod: 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
  accountBalanceUsageAmount?: number
}

const pendingPaymentStatusLabel: Record<PendingPaymentRow['status'], string> = {
  OPEN: 'Abierto',
  SETTLED: 'Saldado',
  CANCELLED: 'Cancelado'
}

const appointmentStatusLabel: Record<string, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No acudió',
  PENDING_REVIEW: 'Pendiente de revisar'
}

const getAppointmentStatusLabel = (status: unknown) => {
  const normalizedStatus = String(status || '').toUpperCase()
  return appointmentStatusLabel[normalizedStatus] || normalizedStatus || 'Sin estado'
}

const getAppointmentStatusBadgeClassName = (status: unknown) => {
  const normalizedStatus = String(status || '').toUpperCase()

  switch (normalizedStatus) {
    case 'COMPLETED':
      return 'badge-success'
    case 'CONFIRMED':
      return 'badge-primary'
    case 'IN_PROGRESS':
    case 'PENDING_REVIEW':
      return 'badge-warning'
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'badge-danger'
    case 'SCHEDULED':
    default:
      return 'badge-secondary'
  }
}

const formatAppointmentCabin = (cabin: string | null | undefined) =>
  String(cabin || '')
    .replace('CABINA_', 'Cabina ')
    .trim() || 'Sin cabina'

const getAppointmentStartAt = (appointment: any) => {
  const startAt = new Date(appointment?.date || new Date())
  const [hour, minute] = String(appointment?.startTime || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))

  startAt.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0)
  return startAt
}

const getAppointmentDisplayStatus = (appointment: any) => {
  const normalizedStatus = String(appointment?.status || '').toUpperCase()

  if (appointment?.sale?.status === 'COMPLETED' && !['CANCELLED', 'NO_SHOW'].includes(normalizedStatus)) {
    return 'COMPLETED'
  }

  if (!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(normalizedStatus) && getAppointmentStartAt(appointment) < new Date()) {
    return 'PENDING_REVIEW'
  }

  return normalizedStatus
}

const isChargeableAppointment = (appointment: any) => {
  const status = getAppointmentDisplayStatus(appointment)
  return !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
}

const isMutableAppointment = (appointment: any) => {
  const status = getAppointmentDisplayStatus(appointment)
  return !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
}

const getSaleDisplayStatus = (sale: any) => {
  if (sale?.pendingPayment?.status === 'OPEN' || String(sale?.status || '').toUpperCase() === 'PENDING') {
    return 'PENDING'
  }

  return 'COMPLETED'
}

const getSaleDisplayStatusLabel = (sale: any) =>
  getSaleDisplayStatus(sale) === 'PENDING' ? 'Pendiente' : 'Cobrado'

const getSaleDisplayStatusBadgeClassName = (sale: any) =>
  getSaleDisplayStatus(sale) === 'PENDING' ? 'badge-warning' : 'badge-success'

const getSaleTreatmentLabel = (sale: any) => {
  const labels = Array.isArray(sale?.items)
    ? sale.items
        .map((item: any) => {
          const rawLabel = item?.service?.name || item?.description || item?.product?.name || ''
          return String(rawLabel).trim()
        })
        .filter(Boolean)
    : []

  const uniqueLabels = Array.from(new Set(labels))
  return uniqueLabels.length > 0 ? uniqueLabels.join(', ') : 'Sin tratamiento'
}

const parseClientNotes = (notes: unknown) =>
  String(notes || '')
    .split(/\r?\n\s*\r?\n+/)
    .map((note) => note.trim())
    .filter(Boolean)

const serializeClientNotes = (notes: string[]) => {
  const normalizedNotes = notes.map((note) => note.trim()).filter(Boolean)
  return normalizedNotes.length > 0 ? normalizedNotes.join('\n\n') : null
}

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'sales' | 'pending' | 'bonos' | 'abonos' | 'quotes'>('overview')
  const [clientQuotes, setClientQuotes] = useState<any[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [clientAssets, setClientAssets] = useState<ClientAssetsResponse | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [accountBalanceHistory, setAccountBalanceHistory] = useState<AccountBalanceMovement[]>([])
  const [accountBalanceLoading, setAccountBalanceLoading] = useState(false)
  const [accountBalanceSaving, setAccountBalanceSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [accountBalanceDraft, setAccountBalanceDraft] = useState({
    description: '',
    amount: '',
    paymentMethod: 'CASH' as 'CASH' | 'CARD' | 'BIZUM',
    operationDate: accountBalanceDateInput(),
    notes: ''
  })
  const [showBonoPackModal, setShowBonoPackModal] = useState(false)
  const [editingBonoPack, setEditingBonoPack] = useState<any | null>(null)
  const [showBonoAppointmentModal, setShowBonoAppointmentModal] = useState(false)
  const [selectedBonoForAppointment, setSelectedBonoForAppointment] = useState<any | null>(null)
  const [pendingSettlementTarget, setPendingSettlementTarget] = useState<PendingPaymentRow | null>(null)
  const [pendingSettlementModalOpen, setPendingSettlementModalOpen] = useState(false)
  const [pendingSettlementSaving, setPendingSettlementSaving] = useState(false)
  const [pendingSettlementDraft, setPendingSettlementDraft] = useState({
    settledAt: pendingSettlementDateTimeInput(),
    amount: '',
    paymentMethod: 'CASH' as 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
  })
  const [pendingCashDecisionModalOpen, setPendingCashDecisionModalOpen] = useState(false)
  const [pendingRemainderModalOpen, setPendingRemainderModalOpen] = useState(false)
  const [pendingCollectionExecution, setPendingCollectionExecution] = useState<PendingCollectionExecutionOptions | null>(null)
  const [pendingAccountBalanceUsage, setPendingAccountBalanceUsage] = useState(0)
  const [pendingRemainderAmount, setPendingRemainderAmount] = useState(0)
  const [manualPendingModalOpen, setManualPendingModalOpen] = useState(false)
  const [manualPendingSaving, setManualPendingSaving] = useState(false)
  const [manualPendingDraft, setManualPendingDraft] = useState('')

  useEffect(() => {
    if (id) {
      fetchClient()
    }
  }, [id])

  const fetchClient = async () => {
    try {
      const response = await api.get(`/clients/${id}`)
      setClient(response.data)
      void fetchAccountBalanceHistory(response.data.id)
      void fetchClientQuotes(response.data.id)
      if (isDesktop()) {
        setAssetsLoading(true)
        try {
          const assets = await listClientAssets(response.data.id, `${response.data.firstName} ${response.data.lastName}`)
          setClientAssets(assets)
        } finally {
          setAssetsLoading(false)
        }
      }
    } catch (error) {
      console.error('Error fetching client:', error)
      toast.error('Error al cargar el cliente')
      navigate('/clients')
    } finally {
      setLoading(false)
    }
  }

  const fetchAccountBalanceHistory = async (clientId: string) => {
    try {
      setAccountBalanceLoading(true)
      const response = await api.get(`/bonos/account-balance/${clientId}/history`, {
        params: { limit: 60 }
      })
      const movements = Array.isArray(response.data?.movements) ? response.data.movements : []
      setAccountBalanceHistory(movements)
      const currentBalance = Number(response.data?.currentBalance || 0)
      setClient((current: any) => (current ? { ...current, accountBalance: currentBalance } : current))
    } catch (error) {
      console.error('Error loading account balance history:', error)
      toast.error('No se pudo cargar el historial de abonos')
      setAccountBalanceHistory([])
    } finally {
      setAccountBalanceLoading(false)
    }
  }

  const fetchClientQuotes = async (clientId: string) => {
    try {
      setQuotesLoading(true)
      const response = await api.get(`/quotes/client/${clientId}`)
      setClientQuotes(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error loading quotes:', error)
      toast.error('No se pudieron cargar los presupuestos')
      setClientQuotes([])
    } finally {
      setQuotesLoading(false)
    }
  }

  const handlePrintQuote = (quote: any) => {
    const quoteHtml = buildQuoteHtml(quote)
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (printWindow) {
      printWindow.document.write(quoteHtml)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    }
  }

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    try {
      await api.delete(`/quotes/${quoteId}`)
      toast.success('Presupuesto eliminado')
      if (client?.id) await fetchClientQuotes(client.id)
    } catch (error: any) {
      console.error('Error deleting quote:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar el presupuesto')
    }
  }

  const handleFormSuccess = () => {
    setShowEditModal(false)
    fetchClient()
  }

  const handleUpdateAppointmentStatus = async (appointmentId: string, status: 'CANCELLED' | 'NO_SHOW') => {
    const confirmationMessage =
      status === 'CANCELLED'
        ? '¿Cancelar esta cita?'
        : '¿Marcar esta cita como "No acudió"?'

    if (!confirm(confirmationMessage)) {
      return
    }

    try {
      await api.put(`/appointments/${appointmentId}`, { status })
      toast.success(status === 'CANCELLED' ? 'Cita cancelada' : 'Cita marcada como no acudió')
      await fetchClient()
    } catch (error: any) {
      console.error('Error updating appointment status:', error)
      toast.error(error.response?.data?.error || 'No se pudo actualizar la cita')
    }
  }

  const renderAppointmentActions = (appointment: any) => {
    if (appointment.sale?.status === 'COMPLETED') {
      return (
        <div className="text-xs font-medium text-green-600 dark:text-green-400">
          Cobrada · {salePaymentMethodLabel(appointment.sale)}
        </div>
      )
    }

    return (
      <>
        {isChargeableAppointment(appointment) && (
          <button
            onClick={() =>
              navigate(`/sales?clientId=${client.id}&serviceId=${appointment.serviceId}&appointmentId=${appointment.id}`)
            }
            className="btn btn-secondary btn-sm"
          >
            Cobrar
          </button>
        )}

        {isMutableAppointment(appointment) && (
          <button
            type="button"
            onClick={() => void handleUpdateAppointmentStatus(appointment.id, 'NO_SHOW')}
            className="btn btn-secondary btn-sm"
          >
            No acudió
          </button>
        )}

        {isMutableAppointment(appointment) && (
          <button
            type="button"
            onClick={() => void handleUpdateAppointmentStatus(appointment.id, 'CANCELLED')}
            className="btn btn-secondary btn-sm"
          >
            Cancelar
          </button>
        )}
      </>
    )
  }

  const handleCloseBonoPackModal = () => {
    setShowBonoPackModal(false)
    setEditingBonoPack(null)
  }

  const handleBonoPackSuccess = () => {
    fetchClient()
  }

  const handleOpenBonoPackCreateModal = () => {
    setEditingBonoPack(null)
    setShowBonoPackModal(true)
  }

  const handleOpenBonoPackEditModal = (bonoPackId: string) => {
    const selectedBono = clientBonoPacks.find((bonoPack: any) => bonoPack.id === bonoPackId) || null
    if (!selectedBono) {
      toast.error('No se encontró el bono seleccionado')
      return
    }

    setEditingBonoPack(selectedBono)
    setShowBonoPackModal(true)
  }

  const handleOpenBonoAppointmentModal = (bonoPackId: string) => {
    const selectedBono = clientBonoPacks.find((bonoPack: any) => bonoPack.id === bonoPackId) || null
    if (!selectedBono) {
      toast.error('No se encontro el bono seleccionado')
      return
    }

    setSelectedBonoForAppointment(selectedBono)
    setShowBonoAppointmentModal(true)
  }

  const handleCloseBonoAppointmentModal = () => {
    setShowBonoAppointmentModal(false)
    setSelectedBonoForAppointment(null)
  }

  const handleBonoAppointmentSuccess = async () => {
    handleCloseBonoAppointmentModal()
    await fetchClient()
  }

  const handleClosePendingSettlementModal = () => {
    if (pendingSettlementSaving) return
    setPendingSettlementModalOpen(false)
    setPendingCashDecisionModalOpen(false)
    setPendingRemainderModalOpen(false)
    setPendingCollectionExecution(null)
    setPendingAccountBalanceUsage(0)
    setPendingRemainderAmount(0)
    setPendingSettlementTarget(null)
  }

  const handleOpenManualPendingModal = (amount: number) => {
    setManualPendingDraft(amount > 0 ? amount.toFixed(2).replace('.', ',') : '')
    setManualPendingModalOpen(true)
  }

  const handleCloseManualPendingModal = () => {
    if (manualPendingSaving) return
    setManualPendingModalOpen(false)
  }

  const resolvePendingCollectionDraft = () => {
    const pendingOpenAmount = Number(pendingSettlementTarget?.remainingAmount || 0)
    const settledAt = new Date(pendingSettlementDraft.settledAt)
    if (Number.isNaN(settledAt.getTime())) {
      throw new Error('Indica una fecha y hora válidas')
    }

    const normalizedAmount = pendingSettlementDraft.amount.trim().replace(',', '.')
    const amountToCollect = Number.parseFloat(normalizedAmount)
    if (!Number.isFinite(amountToCollect) || amountToCollect <= 0) {
      throw new Error('Indica un importe válido a cobrar')
    }

    if (amountToCollect > pendingOpenAmount) {
      throw new Error('El importe a cobrar no puede superar el pendiente actual')
    }

    return {
      operationDate: settledAt,
      amountToCollect: Math.round((amountToCollect + Number.EPSILON) * 100) / 100,
      pendingOpenAmount
    }
  }

  const executePendingCollection = async (options: {
    paymentMethod: 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
    accountBalanceUsageAmount?: number
    printTicketAfterCollection: boolean
    showInOfficialCash: boolean
  }) => {
    if (!pendingSettlementTarget?.sale?.id) return

    let collectionDraft: ReturnType<typeof resolvePendingCollectionDraft>
    try {
      collectionDraft = resolvePendingCollectionDraft()
    } catch (error: any) {
      toast.error(error.message || 'No se pudo preparar el cobro')
      return
    }

    const accountBalanceUsageAmount = Math.min(
      collectionDraft.amountToCollect,
      Math.max(0, Number(options.accountBalanceUsageAmount || 0))
    )
    const remainingAmount = Math.max(0, collectionDraft.pendingOpenAmount - collectionDraft.amountToCollect)

    try {
      setPendingSettlementSaving(true)
      const response = await api.post(`/sales/${pendingSettlementTarget.sale.id}/collect-pending`, {
        amount: collectionDraft.amountToCollect,
        paymentMethod: options.paymentMethod,
        operationDate: collectionDraft.operationDate.toISOString(),
        showInOfficialCash: options.showInOfficialCash,
        accountBalanceUsageAmount: accountBalanceUsageAmount > 0 ? accountBalanceUsageAmount : undefined
      })

      if (options.printTicketAfterCollection) {
        try {
          const printResult = await printTicket(
            buildPendingCollectionTicketPayload({
              sale: response.data,
              operationDate: collectionDraft.operationDate.toISOString(),
              collectedAmount: collectionDraft.amountToCollect,
              paymentMethod: options.paymentMethod,
              accountBalanceAmount: accountBalanceUsageAmount,
              remainingAmount
            })
          )
          toast.success(getPrintTicketSuccessMessage(printResult))
        } catch (error: any) {
          toast.error(error.message || 'El cobro se guardó, pero no se pudo imprimir el ticket')
        }
      }

      toast.success(
        remainingAmount > 0 ? 'Cobro parcial registrado correctamente' : 'Pendiente saldado correctamente'
      )
      setPendingSettlementModalOpen(false)
      setPendingCashDecisionModalOpen(false)
      setPendingRemainderModalOpen(false)
      setPendingCollectionExecution(null)
      setPendingAccountBalanceUsage(0)
      setPendingRemainderAmount(0)
      setPendingSettlementTarget(null)
      await fetchClient()
    } catch (error: any) {
      console.error('Error collecting pending payment:', error)
      toast.error(error.response?.data?.error || 'No se pudo registrar el cobro pendiente')
    } finally {
      setPendingSettlementSaving(false)
    }
  }

  const handlePendingRemainderPaymentSelection = async (method: 'CASH' | 'CARD' | 'BIZUM') => {
    setPendingRemainderModalOpen(false)

    if (method === 'CASH') {
      setPendingCollectionExecution({
        paymentMethod: method,
        accountBalanceUsageAmount: pendingAccountBalanceUsage
      })
      setPendingCashDecisionModalOpen(true)
      return
    }

    await executePendingCollection({
      paymentMethod: method,
      accountBalanceUsageAmount: pendingAccountBalanceUsage,
      printTicketAfterCollection: true,
      showInOfficialCash: true
    })
  }

  const handleConfirmPendingSettlement = async () => {
    let collectionDraft: ReturnType<typeof resolvePendingCollectionDraft>
    try {
      collectionDraft = resolvePendingCollectionDraft()
    } catch (error: any) {
      toast.error(error.message || 'No se pudo preparar el cobro')
      return
    }

    if (pendingSettlementDraft.paymentMethod === 'ABONO') {
      const availableAccountBalance = Math.max(0, Number(client?.accountBalance || 0))
      if (availableAccountBalance <= 0) {
        toast.error('El cliente no tiene saldo disponible en su abono')
        return
      }

      const usableAmount = Math.min(availableAccountBalance, collectionDraft.amountToCollect)
      if (usableAmount < collectionDraft.amountToCollect) {
        setPendingAccountBalanceUsage(Math.round((usableAmount + Number.EPSILON) * 100) / 100)
        setPendingRemainderAmount(
          Math.round((collectionDraft.amountToCollect - usableAmount + Number.EPSILON) * 100) / 100
        )
        setPendingRemainderModalOpen(true)
        return
      }

      await executePendingCollection({
        paymentMethod: 'ABONO',
        accountBalanceUsageAmount: usableAmount,
        printTicketAfterCollection: false,
        showInOfficialCash: false
      })
      return
    }

    if (pendingSettlementDraft.paymentMethod === 'CASH') {
      setPendingCollectionExecution({
        paymentMethod: 'CASH'
      })
      setPendingCashDecisionModalOpen(true)
      return
    }

    await executePendingCollection({
      paymentMethod: pendingSettlementDraft.paymentMethod,
      printTicketAfterCollection: true,
      showInOfficialCash: true
    })
  }

  const handlePrintSale = async (saleId: string) => {
    try {
      const response = await api.get(`/sales/${saleId}`)
      const printResult = await printTicket(buildSaleTicketPayload(response.data))
      toast.success(getPrintTicketSuccessMessage(printResult))
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket')
    }
  }

  const profileImageUrl = useMemo(() => {
    if (clientAssets?.primaryPhotoUrl) return clientAssets.primaryPhotoUrl
    return normalizeDesktopAssetUrl(client?.photoUrl) || null
  }, [clientAssets, client?.photoUrl])

  const clientNotes = useMemo(() => parseClientNotes(client?.notes), [client?.notes])

  const handleConsumeBonoSession = async (bonoPackId: string) => {
    try {
      await api.put(`/bonos/${bonoPackId}/consume`)
      toast.success('Sesión descontada')
      await fetchClient()
    } catch (error: any) {
      console.error('Error consuming bono session:', error)
      toast.error(error.response?.data?.error || 'No se pudo descontar la sesión')
    }
  }

  const handleDeleteBono = async (bonoPackId: string) => {
    if (!confirm('¿Eliminar este bono del cliente?')) return
    try {
      await api.delete(`/bonos/${bonoPackId}`)
      toast.success('Bono eliminado')
      await fetchClient()
    } catch (error: any) {
      console.error('Error deleting bono:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar el bono')
    }
  }

  const persistClientNotes = async (nextNotes: string[]) => {
    if (!client?.id) return false

    try {
      setNoteSaving(true)
      const response = await api.put(`/clients/${client.id}`, {
        notes: serializeClientNotes(nextNotes)
      })

      setClient((current: any) =>
        current
          ? {
              ...current,
              notes: response.data?.notes ?? null,
              updatedAt: response.data?.updatedAt ?? current.updatedAt
            }
          : current
      )

      return true
    } catch (error: any) {
      console.error('Error saving client notes:', error)
      toast.error(error.response?.data?.error || 'No se pudieron guardar las notas')
      return false
    } finally {
      setNoteSaving(false)
    }
  }

  const handleAddClientNote = async () => {
    const nextNote = noteDraft.trim()
    if (!nextNote) {
      toast.error('Escribe una nota antes de añadirla')
      return
    }

    const saved = await persistClientNotes([...clientNotes, nextNote])
    if (!saved) return

    setNoteDraft('')
    toast.success('Nota añadida')
  }

  const handleDeleteClientNote = async (noteIndex: number) => {
    if (!clientNotes[noteIndex]) return
    if (!confirm('¿Eliminar esta nota?')) return

    const saved = await persistClientNotes(clientNotes.filter((_, index) => index !== noteIndex))
    if (saved) {
      toast.success('Nota eliminada')
    }
  }

  const handleCreateAccountBalanceTopUp = async () => {
    if (!client?.id) return

    if (!accountBalanceDraft.description.trim()) {
      toast.error('Indica una descripción del abono')
      return
    }

    const parsedAmount = Number.parseFloat(accountBalanceDraft.amount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Indica un importe válido para el abono')
      return
    }

    if (!accountBalanceDraft.operationDate) {
      toast.error('Selecciona la fecha del abono')
      return
    }

    try {
      setAccountBalanceSaving(true)
      await api.post(`/bonos/account-balance/${client.id}/top-up`, {
        description: accountBalanceDraft.description.trim(),
        amount: parsedAmount,
        paymentMethod: accountBalanceDraft.paymentMethod,
        operationDate: accountBalanceDraft.operationDate,
        notes: accountBalanceDraft.notes.trim() || null
      })
      toast.success('Abono registrado correctamente')
      setAccountBalanceDraft({
        description: '',
        amount: '',
        paymentMethod: 'CASH',
        operationDate: accountBalanceDateInput(),
        notes: ''
      })
      await fetchAccountBalanceHistory(client.id)
    } catch (error: any) {
      console.error('Error creating account balance top-up:', error)
      toast.error(error.response?.data?.error || 'No se pudo registrar el abono')
    } finally {
      setAccountBalanceSaving(false)
    }
  }

  const sortedAppointments = useMemo(() => {
    const source = Array.isArray(client?.appointments) ? [...client.appointments] : []
    return source.sort((a: any, b: any) => getAppointmentStartAt(a).getTime() - getAppointmentStartAt(b).getTime())
  }, [client?.appointments])

  const upcomingAppointments = useMemo(() => {
    const now = new Date()

    return sortedAppointments
      .filter((appointment: any) => {
        const status = getAppointmentDisplayStatus(appointment)
        if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'COMPLETED') {
          return false
        }

        return getAppointmentStartAt(appointment) >= now
      })
      .slice(0, 3)
  }, [sortedAppointments])

  const remainingAppointments = useMemo(() => {
    const now = new Date()
    const upcomingIds = new Set(upcomingAppointments.map((appointment: any) => appointment.id))
    const futureAppointments = sortedAppointments.filter(
      (appointment: any) => !upcomingIds.has(appointment.id) && getAppointmentStartAt(appointment) >= now
    )
    const pastAppointments = [...sortedAppointments]
      .filter((appointment: any) => !upcomingIds.has(appointment.id) && getAppointmentStartAt(appointment) < now)
      .sort((a: any, b: any) => getAppointmentStartAt(b).getTime() - getAppointmentStartAt(a).getTime())

    return [...futureAppointments, ...pastAppointments]
  }, [sortedAppointments, upcomingAppointments])

  const clientBonoPacks = useMemo(() => {
    if (!Array.isArray(client?.bonoPacks)) return []
    return client.bonoPacks.filter((bonoPack: any) => !bonoPack?.clientId || bonoPack.clientId === client?.id)
  }, [client?.bonoPacks, client?.id])

  const pendingSummary = useMemo(() => buildClientPendingSummary(client), [client])
  const clientPendingPayments = pendingSummary.rows
  const clientPendingTotal = pendingSummary.openAmount
  const manualPendingAmount = pendingSummary.manualAmount
  const salePendingAmount = pendingSummary.saleOpenAmount
  const pendingSettlementOpenAmount = Number(pendingSettlementTarget?.remainingAmount || 0)
  const pendingSettlementDraftAmount = (() => {
    const normalized = pendingSettlementDraft.amount.trim().replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  })()
  const pendingSettlementRemainingAfterCharge = Math.max(
    0,
    Math.round((pendingSettlementOpenAmount - pendingSettlementDraftAmount + Number.EPSILON) * 100) / 100
  )

  const handleConfirmManualPendingUpdate = async () => {
    if (!client?.id) return

    const normalizedAmount = manualPendingDraft.trim().replace(',', '.')
    const parsedManualAmount = normalizedAmount.length === 0 ? 0 : Number.parseFloat(normalizedAmount)

    if (!Number.isFinite(parsedManualAmount) || parsedManualAmount < 0) {
      toast.error('Indica un importe pendiente válido')
      return
    }

    const nextPendingAmount = Math.round((salePendingAmount + parsedManualAmount + Number.EPSILON) * 100) / 100

    try {
      setManualPendingSaving(true)
      await api.put(`/clients/${client.id}`, {
        pendingAmount: nextPendingAmount
      })
      toast.success(parsedManualAmount === 0 ? 'Pendiente de ficha saldado' : 'Pendiente de ficha actualizado')
      setManualPendingModalOpen(false)
      await fetchClient()
    } catch (error: any) {
      console.error('Error updating manual pending amount:', error)
      toast.error(error.response?.data?.error || 'No se pudo actualizar el pendiente de ficha')
    } finally {
      setManualPendingSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Cliente no encontrado</p>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Resumen' },
    { id: 'appointments', label: 'Citas', count: client.appointments?.length || 0 },
    { id: 'sales', label: 'Ventas', count: client.sales?.length || 0 }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/clients')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {client.firstName} {client.lastName}
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/sales?clientId=${client.id}`)}
            className="btn btn-secondary"
          >
            Cobrar
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="btn btn-primary"
          >
            Editar
          </button>
        </div>
      </div>

      {/* Ficha Compacta */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0 flex justify-center sm:justify-start">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={`${client.firstName} ${client.lastName}`}
                className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-100 dark:ring-primary-900"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center ring-4 ring-primary-100 dark:ring-primary-900">
                <span className="text-3xl font-bold text-white">
                  {getInitials(`${client.firstName} ${client.lastName}`)}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name + Status */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {client.firstName} {client.lastName}
              </h2>
              <span className={`badge ${client.isActive ? 'badge-success' : 'badge-danger'}`}>
                {client.isActive ? 'Activo' : 'Inactivo'}
              </span>
              {client.externalCode && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  #{client.externalCode}
                </span>
              )}
            </div>

            {/* Contact details */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
              {client.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {formatPhone(client.phone)}
                </span>
              )}
              {client.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {client.email}
                </span>
              )}
              {client.birthDate && (
                <span className="inline-flex items-center gap-1">
                  <Cake className="w-3.5 h-3.5" />
                  {formatDate(client.birthDate)}
                </span>
              )}
              {(client.address || client.city) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[client.address, client.city, client.postalCode].filter(Boolean).join(', ')}
                </span>
              )}
            </div>

            {/* Allergies */}
            <div
              className={`mb-3 rounded-xl border px-4 py-3 ${
                client.allergies
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    client.allergies
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                      client.allergies
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    Alergias
                  </p>
                  <p
                    className={`mt-1 text-sm whitespace-pre-wrap ${
                      client.allergies
                        ? 'text-red-700 dark:text-red-200'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {client.allergies || 'Sin alergias registradas'}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Gastado</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(Number(client.totalSpent))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Puntos</p>
                  <p className="text-lg font-bold text-purple-600">{client.loyaltyPoints}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Citas</p>
                  <p className="text-lg font-bold text-blue-600">{client.appointments?.length || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ventas</p>
                  <p className="text-lg font-bold text-orange-600">{client.sales?.length || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Abono</p>
                  <p className="text-lg font-bold text-amber-600">
                    {formatCurrency(Number(client.accountBalance || 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pendiente</p>
                  <p className={`text-lg font-bold ${clientPendingTotal > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {formatCurrency(clientPendingTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar de Acceso Rápido */}
      <div className="flex flex-wrap gap-2">
        {toolbarItems.map((item) => {
          const Icon = item.icon
          const isEnabled = Boolean(item.tab)
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => item.tab && setActiveTab(item.tab)}
              disabled={!isEnabled}
              title={isEnabled ? 'Abrir sección' : 'Próximamente'}
              className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-colors ${
                isEnabled
                  ? 'border-primary-200 dark:border-primary-700 bg-white dark:bg-gray-800 hover:border-primary-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <Icon className={`w-5 h-5 ${isEnabled ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
              <span className={`text-xs ${isEnabled ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-6 overflow-x-auto">
          {tabs.map((tab) => {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 pb-4 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="font-medium">{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="badge badge-secondary">{tab.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.6fr)_minmax(0,1.4fr)]">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Resumen General
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Primera visita</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(client.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Última actualización</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(client.updatedAt)}
                    </p>
                  </div>
                  {client.activeTreatmentCount !== null && client.activeTreatmentCount !== undefined && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Tratamientos activos</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {client.activeTreatmentCount}
                      </p>
                    </div>
                  )}
                  {client.linkedClient && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Cliente vinculado</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white inline-flex items-center">
                        <Link2 className="w-4 h-4 mr-1" />
                        {client.linkedClient.firstName} {client.linkedClient.lastName}
                        {client.relationshipType ? ` (${client.relationshipType})` : ''}
                      </p>
                    </div>
                  )}
                </div>
                {client.activeTreatmentNames && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Nombres de tratamientos activos</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {client.activeTreatmentNames}
                    </p>
                  </div>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-primary-600" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Notas</p>
                    </div>
                    <span className="badge badge-secondary">{clientNotes.length}</span>
                  </div>

                  <div className="space-y-3">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      className="input resize-none min-h-[96px]"
                      rows={4}
                      placeholder="Escribe una nueva nota del cliente..."
                      disabled={noteSaving}
                    />

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Pulsa una nota guardada para eliminarla.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleAddClientNote()}
                        className="btn btn-primary btn-sm"
                        disabled={noteSaving || !noteDraft.trim()}
                      >
                        {noteSaving ? 'Guardando...' : 'Añadir nota'}
                      </button>
                    </div>

                    {clientNotes.length > 0 ? (
                      <div className="space-y-2">
                        {clientNotes.map((note, index) => (
                          <button
                            key={`${note}-${index}`}
                            type="button"
                            onClick={() => void handleDeleteClientNote(index)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-red-200 hover:bg-red-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-red-900 dark:hover:bg-red-950/20"
                            disabled={noteSaving}
                            title="Eliminar nota"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
                                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                                  {note}
                                </p>
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <Trash2 className="h-3.5 w-3.5" />
                                Eliminar
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        Todavía no hay notas guardadas para este cliente.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <ClientAssetExplorer
                clientId={client.id}
                clientName={`${client.firstName} ${client.lastName}`}
                clientAssets={clientAssets}
                assetsLoading={assetsLoading}
                onAssetsChange={setClientAssets}
                onAssetsLoadingChange={setAssetsLoading}
              />
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Citas
            </h3>
            <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Próximas citas
              </p>
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-2">
                  {upcomingAppointments.map((appointment: any, index: number) => {
                    const displayStatus = getAppointmentDisplayStatus(appointment)

                    return (
                      <div
                        key={`upcoming-${appointment.id}`}
                        className="rounded-md bg-white/80 px-4 py-3 dark:bg-gray-900/40"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {index === 0 ? 'Próxima:' : 'Siguiente:'} {appointment.service?.name || 'Servicio'}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {formatAppointmentCabin(appointment.cabin)} · {appointment.user?.name || 'Sin profesional'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                            <p className="text-sm text-blue-900 dark:text-blue-200">
                              {formatDate(appointment.date)}
                              <span className="text-blue-300 dark:text-blue-700"> · </span>
                              {appointment.startTime} - {appointment.endTime}
                            </p>
                            <span className={`badge ${getAppointmentStatusBadgeClassName(displayStatus)}`}>
                              {getAppointmentStatusLabel(displayStatus)}
                            </span>
                            {renderAppointmentActions(appointment)}
                          </div>
                        </div>
                        {appointment.notes && (
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {appointment.notes}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  No hay próximas citas registradas.
                </p>
              )}
            </div>
            {remainingAppointments.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Resto de citas</p>
                </div>
                <div className="space-y-3">
                  {remainingAppointments.map((appointment: any) => {
                    const displayStatus = getAppointmentDisplayStatus(appointment)

                    return (
                      <div
                        key={appointment.id}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Calendar className="h-5 w-5 shrink-0 text-primary-600" />
                            <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {appointment.service.name}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                Con {appointment.user.name} · {formatAppointmentCabin(appointment.cabin)}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                            <p className="text-sm text-gray-900 dark:text-white">
                              {formatDate(appointment.date)}
                              <span className="text-gray-400"> · </span>
                              {appointment.startTime} - {appointment.endTime}
                            </p>

                            <span className={`badge ${getAppointmentStatusBadgeClassName(displayStatus)}`}>
                              {getAppointmentStatusLabel(displayStatus)}
                            </span>

                            {renderAppointmentActions(appointment)}
                          </div>
                        </div>
                        {appointment.notes && (
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {appointment.notes}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : upcomingAppointments.length === 0 ? (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay citas registradas
              </p>
            ) : null}
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Historial de Ventas
            </h3>
            {client.sales && client.sales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Número
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Fecha
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Items
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Tratamiento
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Notas
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Total
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Estado
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Ticket
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.sales.map((sale: any) => (
                      <tr
                        key={sale.id}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                          {sale.saleNumber}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {formatDateTime(sale.date)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {sale.items.length} items
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          <span className="block max-w-xs line-clamp-2">{getSaleTreatmentLabel(sale)}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          <span className="block max-w-xs whitespace-pre-wrap break-words line-clamp-3">
                            {sale.notes?.trim() || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(Number(sale.total))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`badge ${getSaleDisplayStatusBadgeClassName(sale)}`}>
                            {getSaleDisplayStatusLabel(sale)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {getSaleDisplayStatus(sale) !== 'PENDING' ? (
                            <button onClick={() => handlePrintSale(sale.id)} className="btn btn-sm btn-secondary">
                              Ticket
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay ventas registradas
              </p>
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Historial de pendientes
              </h3>
              <span className="badge badge-secondary">{clientPendingPayments.length}</span>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                      Importado
                    </p>
                    <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
                      Importe heredado del perfil del cliente o de un backup
                    </p>
                  </div>
                  {manualPendingAmount > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleOpenManualPendingModal(manualPendingAmount)}
                      className="rounded-lg border border-amber-300 bg-white p-2 text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                      title="Editar pendiente de ficha"
                      aria-label="Editar pendiente de ficha"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 text-lg font-semibold text-amber-900 dark:text-amber-100">
                  {formatCurrency(manualPendingAmount)}
                </p>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 dark:border-sky-900 dark:bg-sky-950/30">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                  Leyenda · Ventas
                </p>
                <p className="mt-2 text-sm text-sky-900 dark:text-sky-100">
                  Pendientes creados de una venta.
                </p>
                <p className="mt-3 text-lg font-semibold text-sky-900 dark:text-sky-100">
                  {formatCurrency(salePendingAmount)}
                </p>
              </div>
            </div>

            {clientPendingPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Origen
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Referencia
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Tratamiento / producto
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Registrado
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Importe
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Estado
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Saldado
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Editar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPendingPayments.map((pendingPayment) => (
                      <tr
                        key={pendingPayment.id}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="py-3 px-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              pendingPayment.source === 'MANUAL'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                            }`}
                          >
                            {pendingPayment.source === 'MANUAL' ? 'Ficha / importado' : 'Ventas'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {pendingPayment.label || pendingPayment.sale?.saleNumber || 'Venta pendiente'}
                            </p>
                            {pendingPayment.note ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {pendingPayment.note}
                              </p>
                            ) : pendingPayment.sale?.notes ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {pendingPayment.sale.notes}
                              </p>
                            ) : null}
                            {pendingPayment.collections.length > 0 ? (
                              <div className="pt-2 space-y-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                  Cobros registrados
                                </p>
                                {pendingPayment.collections.map((collection) => (
                                  <p
                                    key={collection.id}
                                    className="text-xs text-gray-500 dark:text-gray-400"
                                  >
                                    {formatDateTime(collection.operationDate)} · {formatCurrency(collection.amount)} ·{' '}
                                    {paymentMethodLabel(collection.paymentMethod)}
                                    {collection.paymentMethod === 'CASH' && !collection.showInOfficialCash
                                      ? ' · Sin ticket'
                                      : ''}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {pendingPayment.sale?.items?.length ? (
                            <span className="block max-w-xs line-clamp-2">
                              {getSaleTreatmentLabel(pendingPayment.sale)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {formatDateTime(pendingPayment.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          <div className="space-y-1">
                            <p>{formatCurrency(Number(pendingPayment.amount || 0))}</p>
                            {pendingPayment.status === 'OPEN' && pendingPayment.collections.length > 0 ? (
                              <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                Restante
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`badge ${
                              pendingPayment.status === 'SETTLED'
                                ? 'badge-success'
                                : pendingPayment.status === 'CANCELLED'
                                  ? 'badge-danger'
                                  : 'badge-warning'
                            }`}
                          >
                            {pendingPaymentStatusLabel[pendingPayment.status] || pendingPayment.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {pendingPayment.settledAt ? (
                            <div className="space-y-1">
                              <p>{formatDateTime(pendingPayment.settledAt)}</p>
                              {pendingPayment.settledPaymentMethod ? (
                                <p className="text-xs">
                                  {paymentMethodLabel(pendingPayment.settledPaymentMethod)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {pendingPayment.status === 'OPEN' && pendingPayment.source === 'MANUAL' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenManualPendingModal(pendingPayment.amount)}
                              className="inline-flex rounded-lg border border-amber-300 bg-white p-2 text-amber-700 transition hover:bg-amber-50 dark:border-amber-700 dark:bg-gray-900 dark:text-amber-200 dark:hover:bg-amber-950/20"
                              title="Editar pendiente de ficha"
                              aria-label="Editar pendiente de ficha"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : pendingPayment.status === 'OPEN' && pendingPayment.sale?.id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/sales?pendingSaleId=${pendingPayment.sale?.id}`)}
                              className="inline-flex rounded-lg border border-sky-300 bg-white p-2 text-sky-700 transition hover:bg-sky-50 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-200 dark:hover:bg-sky-950/20"
                              title="Cobrar pendiente"
                              aria-label="Cobrar pendiente"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay pendientes registrados
              </p>
            )}
          </div>
        )}

        {activeTab === 'abonos' && (
          <div className="space-y-6">
            <div className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo abono</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Registra una recarga del cliente (ejemplo: regalo para mi hija) para su saldo.
                  </p>
                </div>
                <span className="badge badge-primary">
                  Saldo actual: {formatCurrency(Number(client.accountBalance || 0))}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-3">
                  <label className="label">Descripción</label>
                  <input
                    type="text"
                    value={accountBalanceDraft.description}
                    onChange={(event) =>
                      setAccountBalanceDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    className="input"
                    placeholder="Ejemplo: Regalo para mi hija"
                  />
                </div>
                <div>
                  <label className="label">Importe a regalar</label>
                  <input
                    type="text"
                    value={accountBalanceDraft.amount}
                    onChange={(event) =>
                      setAccountBalanceDraft((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="input"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="label">Fecha</label>
                  <input
                    type="date"
                    value={accountBalanceDraft.operationDate}
                    onChange={(event) =>
                      setAccountBalanceDraft((current) => ({ ...current, operationDate: event.target.value }))
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Cobrado mediante</label>
                  <select
                    value={accountBalanceDraft.paymentMethod}
                    onChange={(event) =>
                      setAccountBalanceDraft((current) => ({
                        ...current,
                        paymentMethod: event.target.value as 'CASH' | 'CARD' | 'BIZUM'
                      }))
                    }
                    className="input"
                  >
                    <option value="CASH">Efectivo</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="BIZUM">Bizum</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="label">Notas</label>
                  <textarea
                    value={accountBalanceDraft.notes}
                    onChange={(event) =>
                      setAccountBalanceDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="input resize-none"
                    rows={3}
                    placeholder="Observaciones del abono..."
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateAccountBalanceTopUp}
                  className="btn btn-primary"
                  disabled={accountBalanceSaving}
                >
                  {accountBalanceSaving ? 'Guardando...' : 'Registrar abono'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de abonos</h3>
                <span className="badge badge-secondary">{accountBalanceHistory.length}</span>
              </div>

              {accountBalanceLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando historial...</p>
              ) : accountBalanceHistory.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Este cliente todavía no tiene movimientos de abono.
                </p>
              ) : (
                <div className="space-y-3">
                  {accountBalanceHistory.map((movement) => {
                    const isConsumption = movement.type === 'CONSUMPTION'
                    return (
                      <div
                        key={movement.id}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`badge ${
                                  isConsumption
                                    ? 'badge-danger'
                                    : movement.type === 'TOP_UP'
                                      ? 'badge-success'
                                      : 'badge-secondary'
                                }`}
                              >
                                {accountBalanceMovementTypeLabel[movement.type]}
                              </span>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(movement.operationDate)}
                              </p>
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">
                              {movement.description}
                            </p>
                            {movement.referenceItem && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Tratamiento / Producto: {movement.referenceItem}
                              </p>
                            )}
                            {movement.type === 'TOP_UP' && movement.paymentMethod && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Cobrado mediante: {paymentMethodLabel(movement.paymentMethod)}
                              </p>
                            )}
                            {movement.notes && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Notas: {movement.notes}
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <p className={`text-sm font-bold ${isConsumption ? 'text-red-600' : 'text-green-600'}`}>
                              {isConsumption ? '-' : '+'}
                              {formatCurrency(Number(movement.amount || 0))}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Restante: {formatCurrency(Number(movement.balanceAfter || 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'bonos' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bonos del cliente</h3>
                <div className="flex items-center gap-2">
                  <span className="badge badge-secondary">{clientBonoPacks.length}</span>
                    <button
                      type="button"
                      onClick={handleOpenBonoPackCreateModal}
                      className="btn btn-primary btn-sm"
                    >
                      Nuevo bono
                  </button>
                </div>
              </div>

              {clientBonoPacks.length > 0 ? (
                <div className="space-y-4">
                  {clientBonoPacks.map((bonoPack: any) => (
                    <BonoCard
                      key={bonoPack.id}
                      bonoPack={bonoPack}
                      onConsume={handleConsumeBonoSession}
                      onDelete={handleDeleteBono}
                      onEdit={handleOpenBonoPackEditModal}
                      onScheduleAppointment={handleOpenBonoAppointmentModal}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Este cliente todavía no tiene bonos asignados.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'quotes' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Presupuestos emitidos</h3>
                <span className="badge badge-secondary">{clientQuotes.length}</span>
              </div>

              {quotesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : clientQuotes.length > 0 ? (
                <div className="space-y-3">
                  {clientQuotes.map((quote: any) => {
                    const isExpired = new Date(quote.validUntil) < new Date() && quote.status === 'ISSUED'
                    const statusLabel: Record<string, string> = {
                      ISSUED: isExpired ? 'Expirado' : 'Emitido',
                      ACCEPTED: 'Aceptado',
                      EXPIRED: 'Expirado',
                      CANCELLED: 'Cancelado'
                    }
                    const statusColor: Record<string, string> = {
                      ISSUED: isExpired ? 'text-red-600' : 'text-blue-600',
                      ACCEPTED: 'text-green-600',
                      EXPIRED: 'text-red-600',
                      CANCELLED: 'text-gray-500'
                    }
                    const itemLabels = (quote.items || [])
                      .map((item: any) => String(item.service?.name || item.product?.name || item.description || '').trim())
                      .filter(Boolean)
                      .join(', ')

                    return (
                      <div key={quote.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {quote.quoteNumber}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {itemLabels || 'Sin detalle'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatDate(quote.date)} — Válido hasta: {formatDate(quote.validUntil)}
                            </p>
                            <p className="text-xs mt-1">
                              Profesional: <strong>{quote.professional}</strong>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-primary-600">{formatCurrency(Number(quote.total))}</p>
                            <p className={`text-xs font-medium ${statusColor[quote.status] || 'text-gray-500'}`}>
                              {statusLabel[quote.status] || quote.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handlePrintQuote(quote)}
                            className="btn btn-sm btn-primary"
                          >
                            <Printer className="w-3 h-3 mr-1" />
                            Imprimir
                          </button>
                          <button
                            onClick={() => void handleDeleteQuote(quote.id)}
                            className="btn btn-sm btn-secondary text-red-600"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Este cliente no tiene presupuestos emitidos.
                </p>
              )}
            </div>
          </div>
        )}

      </div>

      <BonoPackModal
        isOpen={showBonoPackModal}
        onClose={handleCloseBonoPackModal}
        clientId={client.id}
        onSuccess={handleBonoPackSuccess}
        bonoPack={editingBonoPack}
      />

      <Modal
        isOpen={showBonoAppointmentModal}
        onClose={handleCloseBonoAppointmentModal}
        title={selectedBonoForAppointment ? `Nueva cita desde bono: ${selectedBonoForAppointment.name}` : 'Nueva cita desde bono'}
        maxWidth="xl"
      >
        {selectedBonoForAppointment && (
          <AppointmentForm
            onSuccess={handleBonoAppointmentSuccess}
            onCancel={handleCloseBonoAppointmentModal}
            fromBono={{
              bonoPackId: selectedBonoForAppointment.id,
              clientId: client.id,
              serviceId: selectedBonoForAppointment.service?.id || null,
              lockClient: true,
              lockService: Boolean(selectedBonoForAppointment.service?.id)
            }}
            initialCabin="LUCY"
          />
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Cliente"
        maxWidth="2xl"
      >
        <ClientForm
          client={client}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>

      <Modal
        isOpen={pendingSettlementModalOpen}
        onClose={handleClosePendingSettlementModal}
        title="Cobro pendiente"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Gestiona aquí el cobro del pendiente de {pendingSettlementTarget?.sale?.saleNumber || 'la venta'}.
            El importe que no se cobre ahora seguirá abierto para más adelante.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Pendiente actual</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(pendingSettlementOpenAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Restará pendiente</p>
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(pendingSettlementRemainingAfterCharge)}
              </p>
            </div>
          </div>

          <div>
            <label className="label">Importe a cobrar ahora</label>
            <input
              type="text"
              value={pendingSettlementDraft.amount}
              onChange={(event) =>
                setPendingSettlementDraft((current) => ({
                  ...current,
                  amount: event.target.value
                }))
              }
              className="input"
              placeholder="0,00"
            />
          </div>

          <div>
            <label className="label">Fecha y hora de cobro</label>
            <input
              type="datetime-local"
              value={pendingSettlementDraft.settledAt}
              onChange={(event) =>
                setPendingSettlementDraft((current) => ({
                  ...current,
                  settledAt: event.target.value
                }))
              }
              className="input"
            />
          </div>

          <div>
            <label className="label">Método de pago</label>
            <select
              value={pendingSettlementDraft.paymentMethod}
              onChange={(event) =>
                setPendingSettlementDraft((current) => ({
                  ...current,
                  paymentMethod: event.target.value as 'CASH' | 'CARD' | 'BIZUM' | 'ABONO'
                }))
              }
              className="input"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="BIZUM">Bizum</option>
              <option value="ABONO">Abono</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClosePendingSettlementModal}
              className="btn btn-secondary"
              disabled={pendingSettlementSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmPendingSettlement()}
              className="btn btn-primary"
              disabled={pendingSettlementSaving}
            >
              {pendingSettlementSaving ? 'Guardando...' : 'Cobro'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pendingRemainderModalOpen}
        onClose={() => {
          if (pendingSettlementSaving) return
          setPendingRemainderModalOpen(false)
          setPendingAccountBalanceUsage(0)
          setPendingRemainderAmount(0)
        }}
        title="Abono insuficiente"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            El abono cubrirá {formatCurrency(pendingAccountBalanceUsage)} y quedarán{' '}
            {formatCurrency(pendingRemainderAmount)} por cobrar.
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            ¿Cómo se va a cobrar el importe restante?
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => void handlePendingRemainderPaymentSelection('CASH')}
              className="btn btn-secondary"
              disabled={pendingSettlementSaving}
            >
              Efectivo
            </button>
            <button
              onClick={() => void handlePendingRemainderPaymentSelection('CARD')}
              className="btn btn-secondary"
              disabled={pendingSettlementSaving}
            >
              Tarjeta
            </button>
            <button
              onClick={() => void handlePendingRemainderPaymentSelection('BIZUM')}
              className="btn btn-secondary"
              disabled={pendingSettlementSaving}
            >
              Bizum
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pendingCashDecisionModalOpen}
        onClose={() => {
          if (pendingSettlementSaving) return
          setPendingCashDecisionModalOpen(false)
          setPendingCollectionExecution(null)
        }}
        title="Cobro en efectivo"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            ¿Quieres imprimir ticket para este cobro en efectivo?
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Si eliges <strong>No imprimir ticket</strong>, el cobro quedará en la sección privada y no afectará a los movimientos oficiales.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => {
                setPendingCashDecisionModalOpen(false)
                void executePendingCollection({
                  paymentMethod: pendingCollectionExecution?.paymentMethod || 'CASH',
                  accountBalanceUsageAmount: pendingCollectionExecution?.accountBalanceUsageAmount,
                  printTicketAfterCollection: true,
                  showInOfficialCash: true
                })
              }}
              className="btn btn-primary"
              disabled={pendingSettlementSaving}
            >
              Imprimir ticket
            </button>
            <button
              onClick={() => {
                setPendingCashDecisionModalOpen(false)
                void executePendingCollection({
                  paymentMethod: pendingCollectionExecution?.paymentMethod || 'CASH',
                  accountBalanceUsageAmount: pendingCollectionExecution?.accountBalanceUsageAmount,
                  printTicketAfterCollection: false,
                  showInOfficialCash: false
                })
              }}
              className="btn btn-secondary"
              disabled={pendingSettlementSaving}
            >
              Sin imprimir
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={manualPendingModalOpen}
        onClose={handleCloseManualPendingModal}
        title="Editar pendiente de ficha"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Este importe corresponde al pendiente guardado en la ficha del cliente o importado desde otro sistema.
            No modifica los pendientes generados desde ventas.
          </div>

          <div>
            <label className="label">Importe pendiente de ficha</label>
            <input
              type="text"
              value={manualPendingDraft}
              onChange={(event) => setManualPendingDraft(event.target.value)}
              className="input"
              placeholder="0,00"
            />
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Pendiente abierto en ventas: {formatCurrency(salePendingAmount)}
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCloseManualPendingModal}
              className="btn btn-secondary"
              disabled={manualPendingSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmManualPendingUpdate()}
              className="btn btn-primary"
              disabled={manualPendingSaving}
            >
              {manualPendingSaving ? 'Guardando...' : 'Guardar pendiente'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
