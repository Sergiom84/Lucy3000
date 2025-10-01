import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Award,
  History,
  ShoppingBag,
  CalendarCheck,
  User,
  Cake
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatDate, formatPhone, formatDateTime, getInitials } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ClientForm from '../components/ClientForm'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'sales' | 'history'>('overview')

  useEffect(() => {
    if (id) {
      fetchClient()
    }
  }, [id])

  const fetchClient = async () => {
    try {
      const response = await api.get(`/clients/${id}`)
      setClient(response.data)
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Cliente desde {formatDate(client.createdAt)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="btn btn-primary"
        >
          <Edit className="w-5 h-5 mr-2" />
          Editar Cliente
        </button>
      </div>

      {/* Client Overview Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="lg:col-span-1">
          <div className="card">
            {/* Avatar */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-3xl font-bold text-white">
                  {getInitials(`${client.firstName} ${client.lastName}`)}
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center mb-6">
              <span className={`badge ${client.isActive ? 'badge-success' : 'badge-danger'}`}>
                {client.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            {/* Contact Info */}
            <div className="space-y-4">
              {client.phone && (
                <div className="flex items-center text-sm">
                  <Phone className="w-4 h-4 mr-3 text-gray-400" />
                  <span className="text-gray-900 dark:text-white">{formatPhone(client.phone)}</span>
                </div>
              )}

              {client.email && (
                <div className="flex items-center text-sm">
                  <Mail className="w-4 h-4 mr-3 text-gray-400" />
                  <span className="text-gray-900 dark:text-white">{client.email}</span>
                </div>
              )}

              {client.birthDate && (
                <div className="flex items-center text-sm">
                  <Cake className="w-4 h-4 mr-3 text-gray-400" />
                  <span className="text-gray-900 dark:text-white">{formatDate(client.birthDate)}</span>
                </div>
              )}

              {(client.address || client.city) && (
                <div className="flex items-start text-sm">
                  <MapPin className="w-4 h-4 mr-3 text-gray-400 mt-0.5" />
                  <div className="text-gray-900 dark:text-white">
                    {client.address && <div>{client.address}</div>}
                    {client.city && (
                      <div>
                        {client.city}
                        {client.postalCode && ` - ${client.postalCode}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            {client.notes && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Notas
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {client.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Gastado
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(Number(client.totalSpent))}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Puntos de Lealtad
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {client.loyaltyPoints}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                  <Award className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Citas
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {client.appointments?.length || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                  <CalendarCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Ventas
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {client.sales?.length || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 pb-4 border-b-2 transition-colors ${
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
              </div>
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
                            Con {appointment.user.name}
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
