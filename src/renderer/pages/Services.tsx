import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, Clock, DollarSign, Tag } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ServiceForm from '../components/ServiceForm'

export default function Services() {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState<any>(null)

  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    try {
      const response = await api.get('/services')
      setServices(response.data)
    } catch (error) {
      console.error('Error fetching services:', error)
      toast.error('Error al cargar servicios')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este servicio?')) return

    try {
      await api.delete(`/services/${id}`)
      toast.success('Servicio eliminado')
      fetchServices()
    } catch (error) {
      toast.error('Error al eliminar servicio')
    }
  }

  const handleEdit = (service: any) => {
    setEditingService(service)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingService(null)
  }

  const handleFormSuccess = () => {
    handleCloseModal()
    fetchServices()
  }

  // Filtrar servicios
  const filteredServices = services.filter(service => {
    const matchesSearch =
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.description?.toLowerCase().includes(search.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || service.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  // Obtener categorías únicas
  const categories = ['all', ...Array.from(new Set(services.map(s => s.category)))]

  // Agrupar servicios por categoría
  const servicesByCategory = filteredServices.reduce((acc: any, service) => {
    if (!acc[service.category]) {
      acc[service.category] = []
    }
    acc[service.category].push(service)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Servicios
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona el catálogo de servicios
          </p>
        </div>
        <button
          onClick={() => {
            setEditingService(null)
            setShowModal(true)
          }}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Servicio
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Search */}
        <div className="card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar servicios..."
              className="input pl-10"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="card">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input"
          >
            <option value="all">Todas las categorías</option>
            {categories.filter(c => c !== 'all').map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total Servicios
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {services.length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Servicios Activos
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {services.filter(s => s.isActive).length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Precio Promedio
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(
              services.length > 0
                ? services.reduce((sum, s) => sum + Number(s.price), 0) / services.length
                : 0
            )}
          </p>
        </div>
      </div>

      {/* Services by Category */}
      <div className="space-y-6">
        {Object.keys(servicesByCategory).length === 0 ? (
          <div className="card">
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay servicios registrados
            </p>
          </div>
        ) : (
          Object.entries(servicesByCategory).map(([category, categoryServices]: [string, any]) => (
            <div key={category} className="card">
              <div className="flex items-center mb-4">
                <Tag className="w-5 h-5 text-primary-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {category}
                </h2>
                <span className="ml-2 badge badge-secondary">
                  {categoryServices.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryServices.map((service: any) => (
                  <div
                    key={service.id}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                  >
                    {/* Service Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {service.name}
                        </h3>
                        {service.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {service.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`badge ${
                          service.isActive ? 'badge-success' : 'badge-danger'
                        }`}
                      >
                        {service.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    {/* Service Info */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center text-sm">
                        <DollarSign className="w-4 h-4 mr-2 text-green-600" />
                        <span className="font-bold text-gray-900 dark:text-white">
                          {formatCurrency(Number(service.price))}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>{service.duration} minutos</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() => handleEdit(service)}
                        className="flex-1 btn btn-secondary text-xs py-2"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(service.id)}
                        className="btn btn-secondary text-xs py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Formulario */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
        maxWidth="lg"
      >
        <ServiceForm
          service={editingService}
          onSuccess={handleFormSuccess}
          onCancel={handleCloseModal}
        />
      </Modal>
    </div>
  )
}
