import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Edit, Trash2, Clock, Euro, Scissors } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ServiceForm from '../components/ServiceForm'

const formatTaxRate = (value: unknown): string => {
  if (value === null || value === undefined || String(value).trim() === '') return '-'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  const percent = parsed <= 1 ? parsed * 100 : parsed
  const formatted = percent.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  return `${formatted}%`
}

const formatCategoryLabel = (value: string): string =>
  value
    .toLowerCase()
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

export default function Services() {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
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
      toast.error('Error al cargar tratamientos')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este tratamiento?')) return

    try {
      await api.delete(`/services/${id}`)
      toast.success('Tratamiento eliminado')
      fetchServices()
    } catch (error) {
      toast.error('Error al eliminar tratamiento')
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

  const filteredServices = useMemo(
    () =>
      services.filter((service) => {
        if (!selectedCategory) return false
        const category = String(service.category || '')
        const matchesCategory = category === selectedCategory
        const searchText = `${service.serviceCode || ''} ${service.name || ''} ${service.category || ''}`
          .toLowerCase()
        const matchesSearch = searchText.includes(search.toLowerCase())
        return matchesCategory && matchesSearch
      }),
    [services, search, selectedCategory]
  )

  const averagePrice = useMemo(() => {
    if (!services.length) return 0
    return services.reduce((sum, item) => sum + Number(item.price), 0) / services.length
  }, [services])

  const averageDuration = useMemo(() => {
    if (!services.length) return 0
    return Math.round(services.reduce((sum, item) => sum + Number(item.duration || 0), 0) / services.length)
  }, [services])

  const categoryCards = useMemo(() => {
    const grouped = services.reduce<Record<string, { total: number }>>((acc, service) => {
      const category = String(service.category || '').trim() || 'Sin categoría'
      if (!acc[category]) {
        acc[category] = { total: 0 }
      }
      acc[category].total += 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([category, data]) => ({
        category,
        label: formatCategoryLabel(category),
        total: data.total
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [services])

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
            Tratamientos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona código, descripción, tarifa, IVA y tiempo
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
          Nuevo Tratamiento
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              selectedCategory
                ? 'Buscar por código o descripción en la categoría seleccionada...'
                : 'Selecciona una tarjeta para ver y buscar tratamientos...'
            }
            className="input pl-10"
            disabled={!selectedCategory}
          />
        </div>
      </div>

      {/* Category Home */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Acceso por tratamiento
          </h2>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 dark:text-gray-300 hover:border-primary-500 transition-colors"
            >
              Ocultar listado
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {categoryCards.map((item) => (
            <button
              key={item.category}
              type="button"
              onClick={() =>
                setSelectedCategory((prev) => (prev === item.category ? null : item.category))
              }
              className={`text-left card transition-all border ${
                selectedCategory === item.category
                  ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                <Scissors className="w-4 h-4 text-primary-600" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {item.total} tratamientos
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Total Tratamientos
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {services.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Scissors className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Activos
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {services.filter(s => s.isActive).length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tarifa Promedio
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(averagePrice)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tiempo Promedio
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {averageDuration} min
          </p>
        </div>
      </div>

      {/* Services Table */}
      {!selectedCategory ? (
        <div className="card">
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">
            Pulsa una tarjeta para mostrar los tratamientos de esa categoría.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {`Tratamientos: ${formatCategoryLabel(selectedCategory)}`}
            </h3>
            <span className="badge badge-secondary">{filteredServices.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Código
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Descripción
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Tarifa
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    IVA
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Tiempo
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Estado
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No hay tratamientos registrados
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr
                      key={service.id}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {service.serviceCode || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {service.name}
                        </p>
                        {service.category && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {service.category}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                        <span className="inline-flex items-center">
                          <Euro className="w-3 h-3 mr-1" />
                          {formatCurrency(Number(service.price)).replace('€', '').trim()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                        {formatTaxRate(service.taxRate)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                        <span className="inline-flex items-center justify-end">
                          <Clock className="w-3 h-3 mr-1" />
                          {service.duration} min
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${service.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {service.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(service)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(service.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Formulario */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingService ? 'Editar Tratamiento' : 'Nuevo Tratamiento'}
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
