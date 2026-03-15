import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  Edit,
  Phone,
  Mail,
  MapPin,
  Calendar,
  History,
  ShoppingBag,
  CalendarCheck,
  User,
  Cake,
  Link2,
  AlertTriangle,
  Ticket,
  BarChart3,
  Scale,
  ClipboardList,
  FileText,
  FolderOpen,
  Printer,
  StickyNote
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
import { buildSaleTicketPayload, paymentMethodLabel } from '../utils/tickets'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ClientForm from '../components/ClientForm'
import BonoCard from '../components/BonoCard'
import BonoPackModal from '../components/BonoPackModal'
import AppointmentForm from '../components/AppointmentForm'
import ClientAssetExplorer from '../components/ClientAssetExplorer'

const toolbarItems = [
  { icon: CreditCard, label: 'Abonos', tab: 'abonos' as const },
  { icon: Ticket, label: 'Bonos', tab: 'bonos' as const },
  { icon: BarChart3, label: 'Análisis' },
  { icon: Scale, label: 'Control Peso' },
  { icon: ClipboardList, label: 'Ficha Bio' },
  { icon: FileText, label: 'Plantillas' },
  { icon: FolderOpen, label: 'Documentos' }
]

type AccountBalanceMovement = {
  id: string
  type: 'TOP_UP' | 'CONSUMPTION' | 'ADJUSTMENT'
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

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'sales' | 'history' | 'bonos' | 'abonos'>('overview')
  const [clientAssets, setClientAssets] = useState<ClientAssetsResponse | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [accountBalanceHistory, setAccountBalanceHistory] = useState<AccountBalanceMovement[]>([])
  const [accountBalanceLoading, setAccountBalanceLoading] = useState(false)
  const [accountBalanceSaving, setAccountBalanceSaving] = useState(false)
  const [accountBalanceDraft, setAccountBalanceDraft] = useState({
    description: '',
    amount: '',
    operationDate: accountBalanceDateInput(),
    notes: ''
  })
  const [showBonoPackModal, setShowBonoPackModal] = useState(false)
  const [showBonoAppointmentModal, setShowBonoAppointmentModal] = useState(false)
  const [selectedBonoForAppointment, setSelectedBonoForAppointment] = useState<any | null>(null)

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

  const handleFormSuccess = () => {
    setShowEditModal(false)
    fetchClient()
  }

  const handleBonoCreateSuccess = () => {
    fetchClient()
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
        operationDate: accountBalanceDraft.operationDate,
        notes: accountBalanceDraft.notes.trim() || null
      })
      toast.success('Abono registrado correctamente')
      setAccountBalanceDraft({
        description: '',
        amount: '',
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

  const upcomingAppointments = useMemo(() => {
    const now = new Date()
    const source = Array.isArray(client?.appointments) ? client.appointments : []

    return source
      .filter((appointment: any) => {
        const status = String(appointment.status || '').toUpperCase()
        if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'COMPLETED') {
          return false
        }

        const startAt = new Date(appointment.date)
        const [hour, minute] = String(appointment.startTime || '00:00')
          .split(':')
          .map((value) => Number.parseInt(value, 10))
        startAt.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0)

        return startAt >= now
      })
      .sort((a: any, b: any) => {
        const aStart = new Date(a.date)
        const bStart = new Date(b.date)
        const [aHour, aMinute] = String(a.startTime || '00:00')
          .split(':')
          .map((value) => Number.parseInt(value, 10))
        const [bHour, bMinute] = String(b.startTime || '00:00')
          .split(':')
          .map((value) => Number.parseInt(value, 10))
        aStart.setHours(Number.isFinite(aHour) ? aHour : 0, Number.isFinite(aMinute) ? aMinute : 0, 0, 0)
        bStart.setHours(Number.isFinite(bHour) ? bHour : 0, Number.isFinite(bMinute) ? bMinute : 0, 0, 0)
        return aStart.getTime() - bStart.getTime()
      })
      .slice(0, 3)
  }, [client?.appointments])

  const clientBonoPacks = useMemo(() => {
    if (!Array.isArray(client?.bonoPacks)) return []
    return client.bonoPacks.filter((bonoPack: any) => !bonoPack?.clientId || bonoPack.clientId === client?.id)
  }, [client?.bonoPacks, client?.id])

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
    { id: 'overview', label: 'Resumen', icon: User },
    { id: 'appointments', label: 'Citas', icon: CalendarCheck, count: client.appointments?.length || 0 },
    { id: 'sales', label: 'Ventas', icon: ShoppingBag, count: client.sales?.length || 0 },
    { id: 'abonos', label: 'Abonos', icon: CreditCard, count: accountBalanceHistory.length },
    { id: 'bonos', label: 'Bonos', icon: Ticket, count: clientBonoPacks.length },
    { id: 'history', label: 'Historial', icon: History, count: client.clientHistory?.length || 0 }
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
            <CreditCard className="w-5 h-5 mr-2" />
            Cobrar
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="btn btn-primary"
          >
            <Edit className="w-5 h-5 mr-2" />
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
            {client.allergies && (
              <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">ALERGIAS: </span>
                    <span className="text-sm text-red-700 dark:text-red-300">{client.allergies}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {client.notes && (
              <div className="mb-3 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <StickyNote className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="line-clamp-2">{client.notes}</p>
              </div>
            )}

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
                  <p className={`text-lg font-bold ${Number(client.pendingAmount || 0) > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {formatCurrency(Number(client.pendingAmount || 0))}
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
            const Icon = tab.icon
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
                <Icon className="w-5 h-5" />
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
          <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
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
              Historial de Citas
            </h3>
            <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Próximas citas
              </p>
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-2">
                  {upcomingAppointments.map((appointment: any, index: number) => (
                    <div
                      key={`upcoming-${appointment.id}`}
                      className="flex items-center justify-between rounded-md bg-white/80 px-3 py-2 text-sm dark:bg-gray-900/40"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {index === 0 ? 'Próxima:' : 'Siguiente:'} {appointment.service?.name || 'Servicio'}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {appointment.startTime} - {appointment.endTime} ·{' '}
                          {appointment.cabin?.replace('CABINA_', 'Cabina ') || 'Sin cabina'}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {formatDate(appointment.date)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  No hay próximas citas registradas.
                </p>
              )}
            </div>
            {client.appointments && client.appointments.length > 0 ? (
              <div className="space-y-3">
                {client.appointments.map((appointment: any) => (
                  <div
                    key={appointment.id}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-5 h-5 text-primary-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {appointment.service.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Con {appointment.user.name} · {appointment.cabin?.replace('CABINA_', 'Cabina ') || 'Sin cabina'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {formatDate(appointment.date)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {appointment.startTime} - {appointment.endTime}
                        </p>
                        <span className={`badge mt-1 ${
                          appointment.status === 'COMPLETED' ? 'badge-success' :
                          appointment.status === 'CANCELLED' ? 'badge-danger' :
                          appointment.status === 'CONFIRMED' ? 'badge-primary' :
                          'badge-secondary'
                        }`}>
                          {appointment.status}
                        </span>
                        {appointment.sale?.status === 'COMPLETED' ? (
                          <div className="mt-2 text-xs text-green-600">
                            Cobrada · {paymentMethodLabel(appointment.sale.paymentMethod)}
                          </div>
                        ) : (
                          <button
                            onClick={() => navigate(`/sales?clientId=${client.id}&serviceId=${appointment.serviceId}&appointmentId=${appointment.id}`)}
                            className="btn btn-secondary btn-sm mt-2"
                          >
                            <CreditCard className="w-3.5 h-3.5 mr-1" />
                            Cobrar
                          </button>
                        )}
                      </div>
                    </div>
                    {appointment.notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        {appointment.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay citas registradas
              </p>
            )}
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
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(Number(sale.total))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`badge ${
                            sale.status === 'COMPLETED' ? 'badge-success' :
                            sale.status === 'CANCELLED' ? 'badge-danger' :
                            'badge-secondary'
                          }`}>
                            {sale.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => handlePrintSale(sale.id)} className="btn btn-sm btn-secondary">
                            <Printer className="w-4 h-4 mr-2" />
                            Ticket
                          </button>
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
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
                <div className="md:col-span-2">
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
                    onClick={() => setShowBonoPackModal(true)}
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

        {activeTab === 'history' && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Historial de Servicios
            </h3>
            {client.clientHistory && client.clientHistory.length > 0 ? (
              <div className="space-y-4">
                {client.clientHistory.map((history: any) => (
                  <div
                    key={history.id}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {history.service}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(history.date)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-primary-600">
                        {formatCurrency(Number(history.amount))}
                      </p>
                    </div>
                    {history.notes && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {history.notes}
                      </p>
                    )}
                    {history.photoUrl && (
                      <img
                        src={normalizeDesktopAssetUrl(history.photoUrl) || history.photoUrl}
                        alt="Servicio"
                        className="mt-3 rounded-lg w-full max-w-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay historial de servicios
              </p>
            )}
          </div>
        )}
      </div>

      <BonoPackModal
        isOpen={showBonoPackModal}
        onClose={() => setShowBonoPackModal(false)}
        clientId={client.id}
        onSuccess={handleBonoCreateSuccess}
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
    </div>
  )
}
