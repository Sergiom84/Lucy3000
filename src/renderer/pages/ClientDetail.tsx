import { useEffect, useState } from 'react'
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

const toolbarItems = [
  { icon: Ticket, label: 'Bonos' },
  { icon: BarChart3, label: 'Análisis' },
  { icon: Scale, label: 'Control Peso' },
  { icon: ClipboardList, label: 'Ficha Bio' },
  { icon: FileText, label: 'Plantillas' },
  { icon: FolderOpen, label: 'Documentos' }
]

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'sales' | 'history' | 'bonos'>('overview')
  const [clientAssets, setClientAssets] = useState<ClientAssetsResponse | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)

  useEffect(() => {
    if (id) {
      fetchClient()
    }
  }, [id])

  const fetchClient = async () => {
    try {
      const response = await api.get(`/clients/${id}`)
      setClient(response.data)
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
          return (
            <button
              key={item.label}
              disabled
              title="Próximamente"
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-50 cursor-not-allowed"
            >
              <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
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
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Consentimientos</p>
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
