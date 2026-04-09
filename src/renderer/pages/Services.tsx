import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Euro,
  Package,
  Plus,
  Scissors,
  Search,
  Trash2,
  TrendingUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ServiceForm from '../components/ServiceForm'
import api from '../utils/api'
import { formatCurrency } from '../utils/format'

type ViewMode = 'all' | 'active' | null
type CatalogMode = 'services' | 'bonos'

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

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

const formatPrice = (value: unknown) => formatCurrency(Number(value || 0)).replace('€', '').trim()

export default function Services() {
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('services')
  const [services, setServices] = useState<any[]>([])
  const [bonoTemplates, setBonoTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceSelectedCategory, setServiceSelectedCategory] = useState<string | null>(null)
  const [serviceViewMode, setServiceViewMode] = useState<ViewMode>(null)
  const [serviceShowCategories, setServiceShowCategories] = useState(false)
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<any>(null)

  const [bonoSearch, setBonoSearch] = useState('')
  const [bonoSelectedCategory, setBonoSelectedCategory] = useState<string | null>(null)
  const [bonoShowCategories, setBonoShowCategories] = useState(false)

  useEffect(() => {
    void loadCatalogs()
  }, [])

  const loadServices = async () => {
    try {
      const response = await api.get('/services')
      setServices(response.data || [])
    } catch (error) {
      console.error('Error fetching services:', error)
      toast.error('Error al cargar tratamientos')
    }
  }

  const loadBonoTemplates = async () => {
    try {
      const response = await api.get('/bonos/templates')
      setBonoTemplates(response.data || [])
    } catch (error) {
      console.error('Error fetching bono templates:', error)
      toast.error('Error al cargar bonos')
    }
  }

  const loadCatalogs = async () => {
    setLoading(true)
    try {
      await Promise.all([loadServices(), loadBonoTemplates()])
    } finally {
      setLoading(false)
    }
  }

  const refreshServices = async () => {
    await loadServices()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este tratamiento?')) return

    try {
      await api.delete(`/services/${id}`)
      toast.success('Tratamiento eliminado')
      await refreshServices()
    } catch (error) {
      toast.error('Error al eliminar tratamiento')
    }
  }

  const handleEdit = (service: any) => {
    setEditingService(service)
    setServiceModalOpen(true)
  }

  const handleCloseModal = () => {
    setServiceModalOpen(false)
    setEditingService(null)
  }

  const handleFormSuccess = async () => {
    handleCloseModal()
    await refreshServices()
  }

  const activeServices = useMemo(
    () => services.filter((service) => service.isActive),
    [services]
  )

  const serviceAverageDuration = useMemo(() => {
    if (!services.length) return 0
    return Math.round(
      services.reduce((sum, item) => sum + Number(item.duration || 0), 0) / services.length
    )
  }, [services])

  const serviceCategoryCards = useMemo(() => {
    const grouped = services.reduce<Record<string, number>>((acc, service) => {
      const category = String(service.category || '').trim() || 'Sin categoría'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([category, total]) => ({
        category,
        label: formatCategoryLabel(category),
        total
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [services])

  const filteredServices = useMemo(() => {
    const searchLower = serviceSearch.toLowerCase().trim()

    if (searchLower) {
      return services
        .filter((service) => {
          const matchesSearch =
            String(service.serviceCode || '').toLowerCase().includes(searchLower) ||
            String(service.name || '').toLowerCase().includes(searchLower) ||
            String(service.category || '').toLowerCase().includes(searchLower)
          const matchesCategory = serviceSelectedCategory
            ? String(service.category || '') === serviceSelectedCategory
            : true
          const matchesMode = serviceViewMode === 'active' ? service.isActive : true
          return matchesSearch && matchesCategory && matchesMode
        })
        .sort((a, b) => String(a.serviceCode || '').localeCompare(String(b.serviceCode || '')))
    }

    if (serviceViewMode === 'all') {
      const base = serviceSelectedCategory
        ? services.filter((service) => String(service.category || '') === serviceSelectedCategory)
        : services
      return [...base].sort((a, b) => String(a.serviceCode || '').localeCompare(String(b.serviceCode || '')))
    }

    if (serviceViewMode === 'active') {
      const base = serviceSelectedCategory
        ? activeServices.filter((service) => String(service.category || '') === serviceSelectedCategory)
        : activeServices
      return [...base].sort((a, b) => String(a.serviceCode || '').localeCompare(String(b.serviceCode || '')))
    }

    if (serviceSelectedCategory) {
      return services
        .filter((service) => String(service.category || '') === serviceSelectedCategory)
        .sort((a, b) => String(a.serviceCode || '').localeCompare(String(b.serviceCode || '')))
    }

    return []
  }, [services, serviceSearch, serviceSelectedCategory, serviceViewMode, activeServices])

  const serviceHasActiveFilter =
    serviceSearch.trim() !== '' || serviceViewMode !== null || serviceSelectedCategory !== null

  const serviceTableTitle = useMemo(() => {
    if (serviceSearch.trim()) return 'Resultados de búsqueda'
    if (serviceViewMode === 'all') {
      return serviceSelectedCategory
        ? `Todos: ${formatCategoryLabel(serviceSelectedCategory)}`
        : 'Todos los tratamientos'
    }
    if (serviceViewMode === 'active') {
      return serviceSelectedCategory
        ? `Activos: ${formatCategoryLabel(serviceSelectedCategory)}`
        : 'Tratamientos activos'
    }
    if (serviceSelectedCategory) return `Familia: ${formatCategoryLabel(serviceSelectedCategory)}`
    return ''
  }, [serviceSearch, serviceViewMode, serviceSelectedCategory])

  const bonoCategoryCards = useMemo(() => {
    const grouped = bonoTemplates.reduce<Record<string, number>>((acc, template) => {
      const category = String(template.category || '').trim() || 'Bonos'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([category, total]) => ({
        category,
        label: formatCategoryLabel(category),
        total
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [bonoTemplates])

  const bonoAverageSessions = useMemo(() => {
    if (!bonoTemplates.length) return 0
    return Math.round(
      bonoTemplates.reduce((sum, template) => sum + Number(template.totalSessions || 0), 0) /
        bonoTemplates.length
    )
  }, [bonoTemplates])

  const bonoLinkedServices = useMemo(() => {
    return new Set(
      bonoTemplates.map((template) => String(template.serviceId || '').trim()).filter(Boolean)
    ).size
  }, [bonoTemplates])

  const filteredBonos = useMemo(() => {
    const searchLower = normalizeText(bonoSearch)

    return bonoTemplates
      .filter((template) => {
        const matchesSearch =
          !searchLower ||
          [template.category, template.description, template.serviceName, template.serviceLookup]
            .map(normalizeText)
            .some((value) => value.includes(searchLower))

        const matchesCategory = bonoSelectedCategory
          ? String(template.category || 'Bonos') === bonoSelectedCategory
          : true

        return matchesSearch && matchesCategory
      })
      .sort((a, b) => {
        const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''), 'es', {
          sensitivity: 'base'
        })
        if (categoryCompare !== 0) return categoryCompare
        return String(a.description || '').localeCompare(String(b.description || ''), 'es', {
          sensitivity: 'base'
        })
      })
  }, [bonoTemplates, bonoSearch, bonoSelectedCategory])

  const bonoTableTitle = useMemo(() => {
    if (bonoSearch.trim()) return 'Resultados de búsqueda'
    if (bonoSelectedCategory) return `Categoría: ${formatCategoryLabel(bonoSelectedCategory)}`
    return 'Catálogo de bonos'
  }, [bonoSearch, bonoSelectedCategory])

  const handleViewMode = (mode: ViewMode) => {
    setServiceViewMode((prev) => (prev === mode ? null : mode))
  }

  const handleSelectServiceCategory = (category: string) => {
    setServiceSelectedCategory((prev) => (prev === category ? null : category))
  }

  const handleSelectBonoCategory = (category: string) => {
    setBonoSelectedCategory((prev) => (prev === category ? null : category))
  }

  const isServiceMode = catalogMode === 'services'

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCatalogMode('services')}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
              isServiceMode
                ? 'bg-primary-600 text-white shadow'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Tratamientos
          </button>
          <button
            type="button"
            onClick={() => setCatalogMode('bonos')}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
              !isServiceMode
                ? 'bg-primary-600 text-white shadow'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Bonos
          </button>
        </div>
      </div>

      {isServiceMode ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tratamientos</h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Gestiona código, descripción, tarifa, IVA y tiempo
              </p>
            </div>
            <button
              onClick={() => {
                setEditingService(null)
                setServiceModalOpen(true)
              }}
              className="btn btn-primary"
            >
              <Plus className="mr-2 h-5 w-5" />
              Nuevo Tratamiento
            </button>
          </div>

          <div className="card">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Buscar por código, familia o descripción..."
                className="input pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <button
              type="button"
              onClick={() => handleViewMode('all')}
              className={`card border text-left transition-all ${
                serviceViewMode === 'all'
                  ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Tratamientos</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{services.length}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500">
                  <Scissors className="h-6 w-6 text-white" />
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleViewMode('active')}
              className={`card border text-left transition-all ${
                serviceViewMode === 'active'
                  ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-green-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tratamientos Activos</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {activeServices.length}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </button>

            <div className="card border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tiempo Promedio</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {serviceAverageDuration} min
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setServiceShowCategories((prev) => !prev)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
            >
              {serviceShowCategories ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {serviceShowCategories ? 'Ocultar familias' : 'Mostrar familias'}
              {serviceSelectedCategory && (
                <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                  {formatCategoryLabel(serviceSelectedCategory)}
                </span>
              )}
            </button>

            {serviceShowCategories && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {serviceCategoryCards.map((item) => (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() => handleSelectServiceCategory(item.category)}
                    className={`card border text-left transition-all ${
                      serviceSelectedCategory === item.category
                        ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                      <Scissors className="h-4 w-4 text-primary-600" />
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {item.total} tratamientos
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!serviceHasActiveFilter ? (
            <div className="card">
              <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                Usa el buscador o pulsa una tarjeta para ver tratamientos
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{serviceTableTitle}</h3>
                <span className="badge badge-secondary">{filteredServices.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                        Código
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                        Familia
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                        Descripción
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                        Tarifa
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                        IVA
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                        Tiempo
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500 dark:text-gray-400">
                          No hay tratamientos registrados
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((service) => (
                        <tr
                          key={service.id}
                          className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                        >
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                            {service.serviceCode || '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                            {service.category ? formatCategoryLabel(service.category) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{service.name}</p>
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                            <span className="inline-flex items-center justify-end">
                              <Euro className="mr-1 h-3 w-3" />
                              {formatPrice(service.price)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">
                            {formatTaxRate(service.taxRate)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">
                            <span className="inline-flex items-center justify-end">
                              <Clock className="mr-1 h-3 w-3" />
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
                                className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                              </button>
                              <button
                                onClick={() => handleDelete(service.id)}
                                className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
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

          <Modal
            isOpen={serviceModalOpen}
            onClose={handleCloseModal}
            title={editingService ? 'Editar Tratamiento' : 'Nuevo Tratamiento'}
            maxWidth="lg"
          >
            <ServiceForm service={editingService} onSuccess={handleFormSuccess} onCancel={handleCloseModal} />
          </Modal>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bonos</h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Catálogo de plantillas activas para crear bonos. Esta vista es de solo lectura.
              </p>
            </div>
            <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              Catálogo de solo lectura
            </div>
          </div>

          <div className="card">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={bonoSearch}
                onChange={(e) => setBonoSearch(e.target.value)}
                placeholder="Buscar por descripción, servicio o categoría..."
                className="input pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="card border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Plantillas visibles</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {bonoTemplates.length}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500">
                  <Package className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            <div className="card border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Servicios enlazados</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{bonoLinkedServices}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500">
                  <Scissors className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            <div className="card border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Sesiones promedio</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {bonoAverageSessions} sesiones
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setBonoShowCategories((prev) => !prev)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
            >
              {bonoShowCategories ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {bonoShowCategories ? 'Ocultar categorías' : 'Mostrar categorías'}
              {bonoSelectedCategory && (
                <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                  {formatCategoryLabel(bonoSelectedCategory)}
                </span>
              )}
            </button>

            {bonoShowCategories && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {bonoCategoryCards.map((item) => (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() => handleSelectBonoCategory(item.category)}
                    className={`card border text-left transition-all ${
                      bonoSelectedCategory === item.category
                        ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                      <Package className="h-4 w-4 text-primary-600" />
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{item.total} bonos</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{bonoTableTitle}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  La tabla refleja plantillas activas de bonos y no permite editar desde aquí.
                </p>
              </div>
              <span className="badge badge-secondary">{filteredBonos.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Categoría
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Tratamiento base
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                      Sesiones
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                      Precio
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBonos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">
                        No hay bonos que coincidan con el filtro actual
                      </td>
                    </tr>
                  ) : (
                    filteredBonos.map((template) => (
                      <tr
                        key={template.id}
                        className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                      >
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {template.category ? formatCategoryLabel(template.category) : 'Bonos'}
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {template.description || '-'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {template.serviceLookup
                              ? `Código/Referencia: ${template.serviceLookup}`
                              : 'Sin referencia adicional'}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-900 dark:text-white">
                            {template.serviceName || 'Sin tratamiento base'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">
                          {Number(template.totalSessions || 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                          <span className="inline-flex items-center justify-end">
                            <Euro className="mr-1 h-3 w-3" />
                            {formatPrice(template.price)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`badge ${template.isActive === false ? 'badge-danger' : 'badge-success'}`}>
                            {template.isActive === false ? 'Inactivo' : 'Activo'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
