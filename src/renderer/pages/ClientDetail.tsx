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
  CheckCircle2,
  Search,
  Star,
  StickyNote,
  Trash2,
  Upload
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatDate, formatPhone, formatDateTime, getInitials } from '../utils/format'
import {
  ClientAssetsResponse,
  deleteClientAsset,
  importClientAssets,
  isDesktop,
  listClientAssets,
  openClientFolder,
  printTicket,
  setPrimaryClientPhoto
} from '../utils/desktop'
import { buildSaleTicketPayload, paymentMethodLabel } from '../utils/tickets'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ClientForm from '../components/ClientForm'
import BonoCard from '../components/BonoCard'

const toolbarItems = [
  { icon: CreditCard, label: 'Abonos', tab: 'abonos' as const },
  { icon: Ticket, label: 'Bonos', tab: 'bonos' as const },
  { icon: BarChart3, label: 'Análisis' },
  { icon: Scale, label: 'Control Peso' },
  { icon: ClipboardList, label: 'Ficha Bio' },
  { icon: FileText, label: 'Plantillas' },
  { icon: FolderOpen, label: 'Documentos' }
]

const BONO_FAMILY_META = [
  { key: 'ELECTRICA', label: 'Depilación eléctrica', keywords: ['dep', 'electr'] },
  { key: 'CORPORAL', label: 'Tratamiento corporal', keywords: ['corporal'] },
  { key: 'FACIAL', label: 'Tratamientos faciales', keywords: ['facial'] }
] as const

type BonoFamilyKey = (typeof BONO_FAMILY_META)[number]['key']

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

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const accountBalanceMovementTypeLabel: Record<AccountBalanceMovement['type'], string> = {
  TOP_UP: 'Recarga',
  CONSUMPTION: 'Consumo',
  ADJUSTMENT: 'Ajuste'
}

const accountBalanceDateInput = () => new Date().toISOString().split('T')[0]

const resolveBonoFamily = (service: any): BonoFamilyKey | null => {
  const category = normalizeText(service?.category)
  const name = normalizeText(service?.name)
  const haystack = `${category} ${name}`

  if (haystack.includes('facial')) return 'FACIAL'
  if (haystack.includes('corporal')) return 'CORPORAL'
  if ((haystack.includes('dep') && haystack.includes('electr')) || haystack.includes('electrica')) {
    return 'ELECTRICA'
  }

  return null
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
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [bonoSearch, setBonoSearch] = useState('')
  const [selectedBonoFamily, setSelectedBonoFamily] = useState<BonoFamilyKey | null>(null)
  const [selectedBonoServiceId, setSelectedBonoServiceId] = useState('')
  const [creatingBono, setCreatingBono] = useState(false)
  const [bonoDraft, setBonoDraft] = useState({
    name: '',
    totalSessions: '12',
    price: '',
    expiryDate: '',
    notes: ''
  })

  useEffect(() => {
    if (id) {
      fetchClient()
      fetchBonoServices()
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

  const fetchBonoServices = async () => {
    try {
      setServicesLoading(true)
      const response = await api.get('/services?isActive=true')
      setServicesCatalog(response.data || [])
    } catch (error) {
      console.error('Error loading services for bono sale:', error)
      toast.error('No se pudo cargar el catálogo de tratamientos')
    } finally {
      setServicesLoading(false)
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

  const handleImportAssets = async (kind: 'photos' | 'consents') => {
    if (!client) return
    try {
      setAssetsLoading(true)
      const assets = await importClientAssets(client.id, `${client.firstName} ${client.lastName}`, kind)
      setClientAssets(assets)
      toast.success(kind === 'photos' ? 'Fotos importadas' : 'Consentimientos importados')
    } catch (error: any) {
      toast.error(error.message || 'No se pudo importar el archivo')
    } finally {
      setAssetsLoading(false)
    }
  }

  const handleDeleteAsset = async (assetId: string) => {
    if (!client) return
    try {
      setAssetsLoading(true)
      const assets = await deleteClientAsset(client.id, `${client.firstName} ${client.lastName}`, assetId)
      setClientAssets(assets)
      toast.success('Archivo eliminado')
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar el archivo')
    } finally {
      setAssetsLoading(false)
    }
  }

  const handleSetPrimaryPhoto = async (assetId: string) => {
    if (!client) return
    try {
      setAssetsLoading(true)
      const assets = await setPrimaryClientPhoto(client.id, `${client.firstName} ${client.lastName}`, assetId)
      setClientAssets(assets)
      toast.success('Foto principal actualizada')
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar la foto principal')
    } finally {
      setAssetsLoading(false)
    }
  }

  const handleOpenClientFolder = async () => {
    if (!client) return
    try {
      await openClientFolder(client.id, `${client.firstName} ${client.lastName}`)
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir la carpeta local')
    }
  }

  const handlePrintSale = async (saleId: string) => {
    try {
      const response = await api.get(`/sales/${saleId}`)
      await printTicket(buildSaleTicketPayload(response.data))
      toast.success('Ticket enviado a la impresora')
    } catch (error: any) {
      toast.error(error.message || 'No se pudo imprimir el ticket')
    }
  }

  const familyServiceCounts = useMemo(
    () =>
      BONO_FAMILY_META.map((family) => ({
        ...family,
        total: servicesCatalog.filter((service) => resolveBonoFamily(service) === family.key).length
      })),
    [servicesCatalog]
  )

  const filteredBonoServices = useMemo(() => {
    const term = normalizeText(bonoSearch)

    return servicesCatalog
      .filter((service) => {
        const family = resolveBonoFamily(service)
        if (!family) return false
        if (selectedBonoFamily && family !== selectedBonoFamily) return false
        if (!term) return true

        const haystack = normalizeText(
          `${service.serviceCode || ''} ${service.name || ''} ${service.category || ''} ${service.description || ''}`
        )
        return haystack.includes(term)
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }))
  }, [servicesCatalog, bonoSearch, selectedBonoFamily])

  const selectedBonoService = useMemo(
    () => servicesCatalog.find((service) => service.id === selectedBonoServiceId) || null,
    [servicesCatalog, selectedBonoServiceId]
  )

  const formatTaxRate = (value: unknown): string => {
    if (value === null || value === undefined || String(value).trim() === '') return '-'
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return '-'
    const percent = parsed <= 1 ? parsed * 100 : parsed
    return `${percent.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`
  }

  const handleSelectBonoService = (service: any) => {
    setSelectedBonoServiceId(service.id)
    setBonoDraft((prev) => {
      const normalizedPrice = Number(service.price || 0)
      const fallbackPrice = Number.isFinite(normalizedPrice)
        ? normalizedPrice.toFixed(2).replace('.', ',')
        : ''
      return {
        ...prev,
        name: prev.name.trim() ? prev.name : `Bono ${service.name}`,
        price: prev.price.trim() ? prev.price : fallbackPrice
      }
    })
  }

  const handleCreateBonoSale = async () => {
    if (!client) return
    if (!selectedBonoService) {
      toast.error('Selecciona un tratamiento para crear el bono')
      return
    }

    const totalSessions = Number.parseInt(bonoDraft.totalSessions, 10)
    if (!Number.isFinite(totalSessions) || totalSessions < 1) {
      toast.error('Indica un número de sesiones válido')
      return
    }

    const parsedPrice = bonoDraft.price
      ? Number.parseFloat(bonoDraft.price.replace(',', '.'))
      : Number.parseFloat(String(selectedBonoService.price || '0'))

    setCreatingBono(true)
    try {
      await api.post('/bonos', {
        clientId: client.id,
        serviceId: selectedBonoService.id,
        name: bonoDraft.name.trim() || `Bono ${selectedBonoService.name}`,
        totalSessions,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        expiryDate: bonoDraft.expiryDate || null,
        notes: bonoDraft.notes.trim() || null
      })

      toast.success('Bono creado y asignado al cliente')
      setBonoDraft({
        name: '',
        totalSessions: '12',
        price: '',
        expiryDate: '',
        notes: ''
      })
      setSelectedBonoServiceId('')
      await fetchClient()
    } catch (error: any) {
      console.error('Error creating bono from client detail:', error)
      toast.error(error.response?.data?.error || 'No se pudo crear el bono')
    } finally {
      setCreatingBono(false)
    }
  }

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
    { id: 'bonos', label: 'Bonos', icon: Ticket, count: client.bonoPacks?.length || 0 },
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
            {clientAssets?.primaryPhotoUrl || client.photoUrl ? (
              <img
                src={clientAssets?.primaryPhotoUrl || client.photoUrl}
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
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
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

            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Carpeta local</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Fotos del cliente y consentimientos guardados en el equipo.
                  </p>
                </div>
                {isDesktop() && (
                  <button onClick={handleOpenClientFolder} className="btn btn-secondary btn-sm">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Abrir carpeta
                  </button>
                )}
              </div>

              {!isDesktop() ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                  Disponible solo en la app de escritorio Electron.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => handleImportAssets('photos')} className="btn btn-primary btn-sm" disabled={assetsLoading}>
                      <Upload className="w-4 h-4 mr-2" />
                      Añadir fotos
                    </button>
                    <button onClick={() => handleImportAssets('consents')} className="btn btn-secondary btn-sm" disabled={assetsLoading}>
                      <Upload className="w-4 h-4 mr-2" />
                      Añadir consentimiento
                    </button>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Fotos</p>
                    {assetsLoading ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Cargando archivos...</p>
                    ) : clientAssets?.photos.length ? (
                      <div className="grid grid-cols-2 gap-3">
                        {clientAssets.photos.map((asset) => (
                          <div key={asset.id} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <img src={asset.previewUrl} alt={asset.originalName} className="h-28 w-full object-cover" />
                            <div className="p-3 space-y-2">
                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{asset.originalName}</p>
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => handleSetPrimaryPhoto(asset.id)} className={`btn btn-sm ${asset.isPrimaryPhoto ? 'btn-primary' : 'btn-secondary'}`}>
                                  <Star className="w-3.5 h-3.5 mr-1" />
                                  Principal
                                </button>
                                <button onClick={() => handleDeleteAsset(asset.id)} className="btn btn-sm btn-secondary text-red-600">
                                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                                  Borrar
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay fotos locales.</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Consentimientos</p>
                      {(clientAssets?.consents.length || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          OK
                        </span>
                      )}
                    </div>
                    {clientAssets?.consents.length ? (
                      <div className="space-y-2">
                        {clientAssets.consents.map((asset) => (
                          <div key={asset.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                            <a href={asset.previewUrl} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline">
                              {asset.originalName}
                            </a>
                            <button onClick={() => handleDeleteAsset(asset.id)} className="btn btn-sm btn-secondary text-red-600">
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Borrar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay consentimientos locales.</p>
                    )}
                  </div>
                </>
              )}
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
            <div className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva venta de bono</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Busca tratamientos, filtra por familia y crea el bono para este cliente.
                  </p>
                </div>
                <span className="badge badge-secondary">{filteredBonoServices.length} resultados</span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bonoSearch}
                  onChange={(event) => setBonoSearch(event.target.value)}
                  className="input pl-9"
                  placeholder="Buscar bono por código, familia o tratamiento..."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {familyServiceCounts.map((family) => (
                  <button
                    key={family.key}
                    type="button"
                    onClick={() => setSelectedBonoFamily((current) => (current === family.key ? null : family.key))}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      selectedBonoFamily === family.key
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-400'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{family.label}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{family.total} tratamientos</p>
                  </button>
                ))}
              </div>

              {servicesLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando tratamientos...</p>
              ) : filteredBonoServices.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay tratamientos para ese criterio en Depilación eléctrica, Corporal o Facial.
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredBonoServices.map((service) => {
                    const familyKey = resolveBonoFamily(service)
                    const familyLabel =
                      BONO_FAMILY_META.find((family) => family.key === familyKey)?.label || service.category || 'Sin familia'
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectBonoService(service)}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                          selectedBonoServiceId === service.id
                            ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{service.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Código: {service.serviceCode || '-'} · {familyLabel}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Duración: {service.duration || 0} min · IVA: {formatTaxRate(service.taxRate)}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary-600">
                            {formatCurrency(Number(service.price || 0))}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedBonoService && (
                <div className="border border-primary-200 dark:border-primary-800 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Bono seleccionado: {selectedBonoService.name}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Define sesiones, precio y caducidad para registrar la venta.
                      </p>
                    </div>
                    <span className="badge badge-primary">Cliente #{client.externalCode || client.id.slice(0, 6)}</span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Nombre del bono</label>
                      <input
                        type="text"
                        value={bonoDraft.name}
                        onChange={(event) => setBonoDraft((prev) => ({ ...prev, name: event.target.value }))}
                        className="input"
                        placeholder={`Bono ${selectedBonoService.name}`}
                      />
                    </div>
                    <div>
                      <label className="label">Sesiones</label>
                      <input
                        type="number"
                        min="1"
                        value={bonoDraft.totalSessions}
                        onChange={(event) => setBonoDraft((prev) => ({ ...prev, totalSessions: event.target.value }))}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Precio total</label>
                      <input
                        type="text"
                        value={bonoDraft.price}
                        onChange={(event) => setBonoDraft((prev) => ({ ...prev, price: event.target.value }))}
                        className="input"
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="label">Caducidad</label>
                      <input
                        type="date"
                        value={bonoDraft.expiryDate}
                        onChange={(event) => setBonoDraft((prev) => ({ ...prev, expiryDate: event.target.value }))}
                        className="input"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Notas internas del bono</label>
                      <textarea
                        value={bonoDraft.notes}
                        onChange={(event) => setBonoDraft((prev) => ({ ...prev, notes: event.target.value }))}
                        className="input resize-none"
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateBonoSale}
                      className="btn btn-primary"
                      disabled={creatingBono}
                    >
                      {creatingBono ? 'Guardando bono...' : 'Crear venta de bono'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bonos del cliente</h3>
                <span className="badge badge-secondary">{client.bonoPacks?.length || 0}</span>
              </div>

              {client.bonoPacks && client.bonoPacks.length > 0 ? (
                <div className="space-y-4">
                  {client.bonoPacks.map((bonoPack: any) => (
                    <BonoCard
                      key={bonoPack.id}
                      bonoPack={bonoPack}
                      onConsume={handleConsumeBonoSession}
                      onDelete={handleDeleteBono}
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
                        src={history.photoUrl}
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
