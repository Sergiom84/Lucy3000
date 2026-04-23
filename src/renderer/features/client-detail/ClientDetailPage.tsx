import { useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, CreditCard, FileText, Ticket } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import {
  getPrintTicketSuccessMessage,
  normalizeDesktopAssetUrl,
  printTicket
} from '../../utils/desktop'
import {
  buildPendingCollectionTicketPayload,
  buildSaleTicketPayload,
  buildQuoteHtml,
  salePaymentMethodLabel
} from '../../utils/tickets'
import { buildClientPendingSummary, type PendingPaymentRow } from '../../utils/clientPendingPayments'
import toast from 'react-hot-toast'
import Modal from '../../components/Modal'
import ClientForm from '../../components/ClientForm'
import BonoPackModal from '../../components/BonoPackModal'
import AppointmentForm from '../../components/AppointmentForm'
import {
  collectPendingSale,
  consumeBonoPack,
  createAccountBalanceTopUp,
  deleteBonoPack,
  deleteClientQuote,
  fetchSaleDetail,
  updateClientAppointmentStatus,
  updateClientRecord
} from './clientDetailApi'
import ClientDetailAbonosPanel from './components/ClientDetailAbonosPanel'
import ClientDetailAppointmentsPanel from './components/ClientDetailAppointmentsPanel'
import ClientDetailBonosPanel from './components/ClientDetailBonosPanel'
import ClientDetailHeader from './components/ClientDetailHeader'
import ClientDetailOverviewPanel from './components/ClientDetailOverviewPanel'
import ClientDetailPendingPanel from './components/ClientDetailPendingPanel'
import ClientDetailProfileCard from './components/ClientDetailProfileCard'
import ClientDetailQuickToolbar from './components/ClientDetailQuickToolbar'
import ClientDetailQuotesPanel from './components/ClientDetailQuotesPanel'
import ClientDetailSalesPanel from './components/ClientDetailSalesPanel'
import ClientDetailTabs from './components/ClientDetailTabs'
import type {
  ClientDetailAccountBalanceDraft,
  ClientDetailAppointment,
  ClientDetailBonoPack,
  ClientDetailQuote,
  ClientDetailSale,
  ClientDetailSaleLabelSource,
  ClientDetailTab,
  ClientDetailTabOption,
  ClientDetailToolbarItem
} from './types'
import { useClientDetailData } from './useClientDetailData'

const toolbarItems: ClientDetailToolbarItem[] = [
  { icon: AlertTriangle, label: 'Pendientes', tab: 'pending' },
  { icon: CreditCard, label: 'Abonos', tab: 'abonos' },
  { icon: Ticket, label: 'Bonos', tab: 'bonos' },
  { icon: FileText, label: 'Presupuestos', tab: 'quotes' }
]

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

const getAppointmentStartAt = (appointment: ClientDetailAppointment) => {
  const startAt = new Date(appointment?.date || new Date())
  const [hour, minute] = String(appointment?.startTime || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))

  startAt.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0)
  return startAt
}

const getAppointmentDisplayStatus = (appointment: ClientDetailAppointment) => {
  const normalizedStatus = String(appointment?.status || '').toUpperCase()

  if (appointment?.sale?.status === 'COMPLETED' && !['CANCELLED', 'NO_SHOW'].includes(normalizedStatus)) {
    return 'COMPLETED'
  }

  if (!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(normalizedStatus) && getAppointmentStartAt(appointment) < new Date()) {
    return 'PENDING_REVIEW'
  }

  return normalizedStatus
}

const isChargeableAppointment = (appointment: ClientDetailAppointment) => {
  const status = getAppointmentDisplayStatus(appointment)
  return !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
}

const isMutableAppointment = (appointment: ClientDetailAppointment) => {
  const status = getAppointmentDisplayStatus(appointment)
  return !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
}

const getSaleDisplayStatus = (sale: ClientDetailSale) => {
  if (sale?.pendingPayment?.status === 'OPEN' || String(sale?.status || '').toUpperCase() === 'PENDING') {
    return 'PENDING'
  }

  return 'COMPLETED'
}

const getSaleDisplayStatusLabel = (sale: ClientDetailSale) =>
  getSaleDisplayStatus(sale) === 'PENDING' ? 'Pendiente' : 'Cobrado'

const getSaleDisplayStatusBadgeClassName = (sale: ClientDetailSale) =>
  getSaleDisplayStatus(sale) === 'PENDING' ? 'badge-warning' : 'badge-success'

const getSaleTreatmentLabel = (sale: ClientDetailSaleLabelSource | null | undefined) => {
  const labels = Array.isArray(sale?.items)
    ? sale.items
        .map((item) => {
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
  const {
    accountBalanceHistory,
    accountBalanceLoading,
    assetsLoading,
    client,
    clientAssets,
    clientQuotes,
    loading,
    quotesLoading,
    refreshAccountBalanceHistory,
    refreshClient,
    refreshClientQuotes,
    setAssetsLoading,
    setClientAssets,
    setClient
  } = useClientDetailData({
    clientId: id,
    navigate
  })
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeTab, setActiveTab] = useState<ClientDetailTab>('overview')
  const [accountBalanceSaving, setAccountBalanceSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [accountBalanceDraft, setAccountBalanceDraft] = useState<ClientDetailAccountBalanceDraft>({
    description: '',
    amount: '',
    paymentMethod: 'CASH',
    operationDate: accountBalanceDateInput(),
    notes: ''
  })
  const [showBonoPackModal, setShowBonoPackModal] = useState(false)
  const [editingBonoPack, setEditingBonoPack] = useState<ClientDetailBonoPack | null>(null)
  const [showBonoAppointmentModal, setShowBonoAppointmentModal] = useState(false)
  const [selectedBonoForAppointment, setSelectedBonoForAppointment] = useState<ClientDetailBonoPack | null>(null)
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

  const handlePrintQuote = (quote: ClientDetailQuote) => {
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
      await deleteClientQuote(quoteId)
      toast.success('Presupuesto eliminado')
      if (client?.id) await refreshClientQuotes(client.id)
    } catch (error: any) {
      console.error('Error deleting quote:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar el presupuesto')
    }
  }

  const handleFormSuccess = () => {
    setShowEditModal(false)
    void refreshClient()
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
      await updateClientAppointmentStatus(appointmentId, status)
      toast.success(status === 'CANCELLED' ? 'Cita cancelada' : 'Cita marcada como no acudió')
      await refreshClient()
    } catch (error: any) {
      console.error('Error updating appointment status:', error)
      toast.error(error.response?.data?.error || 'No se pudo actualizar la cita')
    }
  }

  const renderAppointmentActions = (appointment: ClientDetailAppointment): ReactNode => {
    if (!client?.id) {
      return null
    }

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
    void refreshClient()
  }

  const handleOpenBonoPackCreateModal = () => {
    setEditingBonoPack(null)
    setShowBonoPackModal(true)
  }

  const handleOpenBonoPackEditModal = (bonoPackId: string) => {
    const selectedBono = clientBonoPacks.find((bonoPack) => bonoPack.id === bonoPackId) || null
    if (!selectedBono) {
      toast.error('No se encontró el bono seleccionado')
      return
    }

    setEditingBonoPack(selectedBono)
    setShowBonoPackModal(true)
  }

  const handleOpenBonoAppointmentModal = (bonoPackId: string) => {
    const selectedBono = clientBonoPacks.find((bonoPack) => bonoPack.id === bonoPackId) || null
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
    await refreshClient()
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
      const response = await collectPendingSale(pendingSettlementTarget.sale.id, {
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
              sale: response,
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
      await refreshClient()
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
      const sale = await fetchSaleDetail(saleId)
      const printResult = await printTicket(buildSaleTicketPayload(sale))
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
      await consumeBonoPack(bonoPackId)
      toast.success('Sesión descontada')
      await refreshClient()
    } catch (error: any) {
      console.error('Error consuming bono session:', error)
      toast.error(error.response?.data?.error || 'No se pudo descontar la sesión')
    }
  }

  const handleDeleteBono = async (bonoPackId: string) => {
    if (!confirm('¿Eliminar este bono del cliente?')) return
    try {
      await deleteBonoPack(bonoPackId)
      toast.success('Bono eliminado')
      await refreshClient()
    } catch (error: any) {
      console.error('Error deleting bono:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar el bono')
    }
  }

  const persistClientNotes = async (nextNotes: string[]) => {
    if (!client?.id) return false

    try {
      setNoteSaving(true)
      const response = await updateClientRecord(client.id, {
        notes: serializeClientNotes(nextNotes)
      })

      setClient((current) =>
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
      await createAccountBalanceTopUp(client.id, {
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
      await refreshAccountBalanceHistory(client.id)
    } catch (error: any) {
      console.error('Error creating account balance top-up:', error)
      toast.error(error.response?.data?.error || 'No se pudo registrar el abono')
    } finally {
      setAccountBalanceSaving(false)
    }
  }

  const sortedAppointments = useMemo(() => {
    const source = Array.isArray(client?.appointments) ? [...client.appointments] : []
    return source.sort((a, b) => getAppointmentStartAt(a).getTime() - getAppointmentStartAt(b).getTime())
  }, [client?.appointments])

  const upcomingAppointments = useMemo(() => {
    const now = new Date()

    return sortedAppointments
      .filter((appointment) => {
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
    const upcomingIds = new Set(upcomingAppointments.map((appointment) => appointment.id))
    const futureAppointments = sortedAppointments.filter(
      (appointment) => !upcomingIds.has(appointment.id) && getAppointmentStartAt(appointment) >= now
    )
    const pastAppointments = [...sortedAppointments]
      .filter((appointment) => !upcomingIds.has(appointment.id) && getAppointmentStartAt(appointment) < now)
      .sort((a, b) => getAppointmentStartAt(b).getTime() - getAppointmentStartAt(a).getTime())

    return [...futureAppointments, ...pastAppointments]
  }, [sortedAppointments, upcomingAppointments])

  const clientBonoPacks = useMemo(() => {
    if (!Array.isArray(client?.bonoPacks)) return []
    return client.bonoPacks.filter((bonoPack) => !bonoPack?.clientId || bonoPack.clientId === client?.id)
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
      await updateClientRecord(client.id, {
        pendingAmount: nextPendingAmount
      })
      toast.success(parsedManualAmount === 0 ? 'Pendiente de ficha saldado' : 'Pendiente de ficha actualizado')
      setManualPendingModalOpen(false)
      await refreshClient()
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

  const tabs: ClientDetailTabOption[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'appointments', label: 'Citas', count: client.appointments?.length || 0 },
    { id: 'sales', label: 'Ventas', count: client.sales?.length || 0 }
  ]

  const activePanel = (() => {
    switch (activeTab) {
      case 'overview':
        return (
          <ClientDetailOverviewPanel
            client={client}
            clientNotes={clientNotes}
            noteDraft={noteDraft}
            noteSaving={noteSaving}
            onAddNote={() => void handleAddClientNote()}
            onDeleteNote={(noteIndex) => void handleDeleteClientNote(noteIndex)}
            onNoteDraftChange={setNoteDraft}
            assetExplorerProps={{
              clientId: client.id,
              clientName: `${client.firstName} ${client.lastName}`,
              clientAssets,
              assetsLoading,
              onAssetsChange: setClientAssets,
              onAssetsLoadingChange: setAssetsLoading
            }}
          />
        )
      case 'appointments':
        return (
          <ClientDetailAppointmentsPanel
            upcomingAppointments={upcomingAppointments}
            remainingAppointments={remainingAppointments}
            getAppointmentDisplayStatus={getAppointmentDisplayStatus}
            getAppointmentStatusBadgeClassName={getAppointmentStatusBadgeClassName}
            getAppointmentStatusLabel={getAppointmentStatusLabel}
            formatAppointmentCabin={formatAppointmentCabin}
            renderAppointmentActions={renderAppointmentActions}
          />
        )
      case 'sales':
        return (
          <ClientDetailSalesPanel
            sales={client.sales || []}
            getSaleDisplayStatus={getSaleDisplayStatus}
            getSaleDisplayStatusBadgeClassName={getSaleDisplayStatusBadgeClassName}
            getSaleDisplayStatusLabel={getSaleDisplayStatusLabel}
            getSaleTreatmentLabel={getSaleTreatmentLabel}
            onPrintSale={(saleId) => void handlePrintSale(saleId)}
          />
        )
      case 'pending':
        return (
          <ClientDetailPendingPanel
            pendingPayments={clientPendingPayments}
            manualPendingAmount={manualPendingAmount}
            salePendingAmount={salePendingAmount}
            getSaleTreatmentLabel={getSaleTreatmentLabel}
            onEditManualPending={handleOpenManualPendingModal}
            onEditSalePending={(saleId) => navigate(`/sales?pendingSaleId=${saleId}`)}
          />
        )
      case 'abonos':
        return (
          <ClientDetailAbonosPanel
            currentBalance={Number(client.accountBalance || 0)}
            draft={accountBalanceDraft}
            history={accountBalanceHistory}
            loading={accountBalanceLoading}
            onAmountChange={(value) =>
              setAccountBalanceDraft((current) => ({ ...current, amount: value }))
            }
            onDescriptionChange={(value) =>
              setAccountBalanceDraft((current) => ({ ...current, description: value }))
            }
            onNotesChange={(value) =>
              setAccountBalanceDraft((current) => ({ ...current, notes: value }))
            }
            onOperationDateChange={(value) =>
              setAccountBalanceDraft((current) => ({ ...current, operationDate: value }))
            }
            onPaymentMethodChange={(value) =>
              setAccountBalanceDraft((current) => ({ ...current, paymentMethod: value }))
            }
            onSubmit={() => void handleCreateAccountBalanceTopUp()}
            saving={accountBalanceSaving}
          />
        )
      case 'bonos':
        return (
          <ClientDetailBonosPanel
            bonoPacks={clientBonoPacks}
            onConsume={(bonoPackId) => void handleConsumeBonoSession(bonoPackId)}
            onCreate={handleOpenBonoPackCreateModal}
            onDelete={(bonoPackId) => void handleDeleteBono(bonoPackId)}
            onEdit={handleOpenBonoPackEditModal}
            onScheduleAppointment={handleOpenBonoAppointmentModal}
          />
        )
      case 'quotes':
        return (
          <ClientDetailQuotesPanel
            quotes={clientQuotes}
            loading={quotesLoading}
            onDelete={(quoteId) => void handleDeleteQuote(quoteId)}
            onPrint={handlePrintQuote}
          />
        )
      default:
        return null
    }
  })()

  return (
    <div className="space-y-6 animate-fade-in">
      <ClientDetailHeader
        client={client}
        onBack={() => navigate('/clients')}
        onCharge={() => navigate(`/sales?clientId=${client.id}`)}
        onEdit={() => setShowEditModal(true)}
      />

      <ClientDetailProfileCard
        client={client}
        profileImageUrl={profileImageUrl}
        pendingTotal={clientPendingTotal}
      />

      <ClientDetailQuickToolbar items={toolbarItems} onSelectTab={(tab) => setActiveTab(tab)} />

      <ClientDetailTabs
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        tabs={tabs}
      />

      <div>{activePanel}</div>

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
