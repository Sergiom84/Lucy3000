import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Euro,
  Search,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import BonoTemplateForm from '../components/BonoTemplateForm'
import ServiceForm from '../components/ServiceForm'
import api from '../utils/api'
import { exportBonoTemplatesWorkbook, exportServicesWorkbook } from '../utils/exports'
import { formatCurrency } from '../utils/format'
import { buildSearchTokens, filterRankedItems } from '../utils/searchableOptions'
import {
  loadAppointmentLegendItems,
  type AppointmentLegendCatalogItem,
  invalidateAppointmentLegendsCache,
  invalidateAppointmentServicesCache,
  invalidateBonoTemplatesCache
} from '../utils/appointmentCatalogs'
import { resolveAppointmentLegend } from '../utils/appointmentColors'
import { useAuthStore } from '../stores/authStore'

type ViewMode = 'all' | 'active' | null
type CatalogMode = 'services' | 'bonos'
const ImportServicesModal = lazy(() => import('../components/ImportServicesModal'))
const ImportBonosModal = lazy(() => import('../components/ImportBonosModal'))

function LazyPanelLoader() {
  return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</div>
}

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
const DEFAULT_SERVICE_CATEGORY = 'Sin categoría'
const DEFAULT_BONO_CATEGORY = 'Bonos'

export default function Services() {
  const { user } = useAuthStore()
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('services')
  const [services, setServices] = useState<any[]>([])
  const [bonoTemplates, setBonoTemplates] = useState<any[]>([])
  const [legendItems, setLegendItems] = useState<AppointmentLegendCatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceSelectedCategory, setServiceSelectedCategory] = useState<string | null>(null)
  const [serviceViewMode, setServiceViewMode] = useState<ViewMode>(null)
  const [serviceShowCategories, setServiceShowCategories] = useState(true)
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [serviceImportModalOpen, setServiceImportModalOpen] = useState(false)
  const [serviceCategoryModalOpen, setServiceCategoryModalOpen] = useState(false)
  const [managingServiceCategory, setManagingServiceCategory] = useState<string | null>(null)
  const [renameServiceCategoryValue, setRenameServiceCategoryValue] = useState('')
  const [replacementServiceCategoryValue, setReplacementServiceCategoryValue] =
    useState(DEFAULT_SERVICE_CATEGORY)
  const [serviceCategorySaving, setServiceCategorySaving] = useState(false)
  const [editingService, setEditingService] = useState<any>(null)
  const isAdmin = user?.role === 'ADMIN'

  const [bonoSearch, setBonoSearch] = useState('')
  const [bonoSelectedCategory, setBonoSelectedCategory] = useState<string | null>(null)
  const [bonoShowCategories, setBonoShowCategories] = useState(false)
  const [bonoModalOpen, setBonoModalOpen] = useState(false)
  const [bonoImportModalOpen, setBonoImportModalOpen] = useState(false)
  const [bonoCategoryModalOpen, setBonoCategoryModalOpen] = useState(false)
  const [managingBonoCategory, setManagingBonoCategory] = useState<string | null>(null)
  const [renameBonoCategoryValue, setRenameBonoCategoryValue] = useState('')
  const [replacementBonoCategoryValue, setReplacementBonoCategoryValue] =
    useState(DEFAULT_BONO_CATEGORY)
  const [bonoCategorySaving, setBonoCategorySaving] = useState(false)

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
      await Promise.all([loadServices(), loadBonoTemplates(), loadAppointmentLegendPalette()])
    } finally {
      setLoading(false)
    }
  }

  const loadAppointmentLegendPalette = async () => {
    try {
      const nextLegendItems = await loadAppointmentLegendItems()
      setLegendItems(nextLegendItems)
    } catch (error) {
      console.error('Error fetching appointment legends for services:', error)
    }
  }

  const refreshServices = async () => {
    await loadServices()
  }

  const refreshServiceCatalogContext = async () => {
    invalidateAppointmentServicesCache()
    invalidateAppointmentLegendsCache()
    await Promise.all([loadServices(), loadAppointmentLegendPalette()])
  }

  const refreshBonoCatalogContext = async () => {
    invalidateBonoTemplatesCache()
    await loadBonoTemplates()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este tratamiento?')) return

    try {
      await api.delete(`/services/${id}`)
      toast.success('Tratamiento eliminado')
      await refreshServiceCatalogContext()
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

  const handleOpenServiceCategoryModal = () => {
    if (!serviceSelectedCategory) return

    const suggestedReplacement =
      serviceCategoryOptions.find((category) => category !== serviceSelectedCategory) ||
      (serviceSelectedCategory !== DEFAULT_SERVICE_CATEGORY ? DEFAULT_SERVICE_CATEGORY : '')

    setManagingServiceCategory(serviceSelectedCategory)
    setRenameServiceCategoryValue(serviceSelectedCategory)
    setReplacementServiceCategoryValue(suggestedReplacement)
    setServiceCategoryModalOpen(true)
  }

  const handleCloseServiceCategoryModal = () => {
    setServiceCategoryModalOpen(false)
    setManagingServiceCategory(null)
    setRenameServiceCategoryValue('')
    setReplacementServiceCategoryValue(DEFAULT_SERVICE_CATEGORY)
    setServiceCategorySaving(false)
  }

  const handleFormSuccess = async () => {
    handleCloseModal()
    await refreshServiceCatalogContext()
  }

  const handleRenameServiceCategory = async () => {
    const currentCategory = String(managingServiceCategory || '').trim()
    const nextCategory = renameServiceCategoryValue.trim()

    if (!currentCategory) return

    if (!nextCategory) {
      toast.error('Indica el nuevo nombre de la familia')
      return
    }

    if (nextCategory === currentCategory) {
      toast.error('La familia debe tener un nombre distinto')
      return
    }

    setServiceCategorySaving(true)
    try {
      await api.patch('/services/categories', {
        currentCategory,
        nextCategory
      })
      await refreshServiceCatalogContext()
      setServiceSelectedCategory(nextCategory)
      toast.success('Familia actualizada')
      handleCloseServiceCategoryModal()
    } catch (error: any) {
      console.error('Rename service category error:', error)
      toast.error(error.response?.data?.error || 'No se pudo actualizar la familia')
      setServiceCategorySaving(false)
    }
  }

  const handleDeleteServiceCategory = async () => {
    const category = String(managingServiceCategory || '').trim()
    const replacementCategory = replacementServiceCategoryValue.trim()

    if (!category) return

    if (!replacementCategory) {
      toast.error('Indica a qué familia mover los tratamientos')
      return
    }

    if (replacementCategory === category) {
      toast.error('La familia de destino debe ser distinta')
      return
    }

    setServiceCategorySaving(true)
    try {
      await api.delete('/services/categories', {
        data: {
          category,
          replacementCategory
        }
      })
      await refreshServiceCatalogContext()
      setServiceSelectedCategory(replacementCategory)
      toast.success('Familia eliminada')
      handleCloseServiceCategoryModal()
    } catch (error: any) {
      console.error('Delete service category error:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar la familia')
      setServiceCategorySaving(false)
    }
  }

  const handleDeleteServiceCategoryWithServices = async () => {
    const category = String(managingServiceCategory || '').trim()

    if (!category) return

    const confirmed = confirm(
      `Se eliminará la familia "${formatCategoryLabel(category)}" y todos sus tratamientos. Esta acción no se puede deshacer.`
    )

    if (!confirmed) return

    setServiceCategorySaving(true)
    try {
      await api.delete('/services/categories/with-services', {
        data: {
          category
        }
      })
      await refreshServiceCatalogContext()
      setServiceSelectedCategory(null)
      toast.success('Familia y tratamientos eliminados')
      handleCloseServiceCategoryModal()
    } catch (error: any) {
      console.error('Delete service category with services error:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar la familia con sus tratamientos')
      setServiceCategorySaving(false)
    }
  }

  const handleBonoTemplateSuccess = (templates: any[]) => {
    setBonoTemplates(templates)
    invalidateBonoTemplatesCache()
    setBonoModalOpen(false)
  }

  const handleOpenBonoCategoryModal = () => {
    if (!bonoSelectedCategory) return

    const suggestedReplacement =
      bonoCategoryOptions.find((category) => category !== bonoSelectedCategory) ||
      (bonoSelectedCategory !== DEFAULT_BONO_CATEGORY ? DEFAULT_BONO_CATEGORY : '')

    setManagingBonoCategory(bonoSelectedCategory)
    setRenameBonoCategoryValue(bonoSelectedCategory)
    setReplacementBonoCategoryValue(suggestedReplacement)
    setBonoCategoryModalOpen(true)
  }

  const handleCloseBonoCategoryModal = () => {
    setBonoCategoryModalOpen(false)
    setManagingBonoCategory(null)
    setRenameBonoCategoryValue('')
    setReplacementBonoCategoryValue(DEFAULT_BONO_CATEGORY)
    setBonoCategorySaving(false)
  }

  const handleRenameBonoCategory = async () => {
    const currentCategory = String(managingBonoCategory || '').trim()
    const nextCategory = renameBonoCategoryValue.trim()

    if (!currentCategory) return

    if (!nextCategory) {
      toast.error('Indica el nuevo nombre de la familia de bonos')
      return
    }

    if (nextCategory === currentCategory) {
      toast.error('La familia de bonos debe tener un nombre distinto')
      return
    }

    setBonoCategorySaving(true)
    try {
      await api.patch('/bonos/templates/categories', {
        currentCategory,
        nextCategory
      })
      await refreshBonoCatalogContext()
      setBonoSelectedCategory(nextCategory)
      toast.success('Familia de bonos actualizada')
      handleCloseBonoCategoryModal()
    } catch (error: any) {
      console.error('Rename bono category error:', error)
      toast.error(error.response?.data?.error || 'No se pudo actualizar la familia de bonos')
      setBonoCategorySaving(false)
    }
  }

  const handleDeleteBonoCategory = async () => {
    const category = String(managingBonoCategory || '').trim()
    const replacementCategory = replacementBonoCategoryValue.trim()

    if (!category) return

    if (!replacementCategory) {
      toast.error('Indica a qué familia mover los bonos')
      return
    }

    if (replacementCategory === category) {
      toast.error('La familia de destino debe ser distinta')
      return
    }

    setBonoCategorySaving(true)
    try {
      await api.delete('/bonos/templates/categories', {
        data: {
          category,
          replacementCategory
        }
      })
      await refreshBonoCatalogContext()
      setBonoSelectedCategory(replacementCategory)
      toast.success('Familia de bonos eliminada')
      handleCloseBonoCategoryModal()
    } catch (error: any) {
      console.error('Delete bono category error:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar la familia de bonos')
      setBonoCategorySaving(false)
    }
  }

  const handleDeleteBonoCategoryWithTemplates = async () => {
    const category = String(managingBonoCategory || '').trim()

    if (!category) return

    const confirmed = confirm(
      `Se eliminará la familia de bonos "${formatCategoryLabel(category)}" y todos sus bonos. Esta acción no se puede deshacer.`
    )

    if (!confirmed) return

    setBonoCategorySaving(true)
    try {
      await api.delete('/bonos/templates/categories/with-templates', {
        data: {
          category
        }
      })
      await refreshBonoCatalogContext()
      setBonoSelectedCategory(null)
      toast.success('Familia y bonos eliminados')
      handleCloseBonoCategoryModal()
    } catch (error: any) {
      console.error('Delete bono category with templates error:', error)
      toast.error(error.response?.data?.error || 'No se pudo eliminar la familia con sus bonos')
      setBonoCategorySaving(false)
    }
  }

  const activeServices = useMemo(
    () => services.filter((service) => service.isActive),
    [services]
  )

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

  const serviceCategoryOptions = useMemo(
    () => serviceCategoryCards.map((item) => item.category),
    [serviceCategoryCards]
  )

  const serviceReplacementCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [DEFAULT_SERVICE_CATEGORY, ...serviceCategoryOptions]
            .map((category) => String(category || '').trim())
            .filter((category) => category && category !== managingServiceCategory)
        )
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [serviceCategoryOptions, managingServiceCategory]
  )

  const managedServiceCategoryCount = useMemo(
    () =>
      managingServiceCategory
        ? services.filter(
            (service) => String(service.category || '').trim() === String(managingServiceCategory || '').trim()
          ).length
        : 0,
    [services, managingServiceCategory]
  )

  const filteredServices = useMemo(() => {
    if (serviceSearch.trim()) {
      const categoryFiltered = serviceSelectedCategory
        ? services.filter((service) => String(service.category || '') === serviceSelectedCategory)
        : services
      const modeFiltered =
        serviceViewMode === 'active'
          ? categoryFiltered.filter((service) => service.isActive)
          : categoryFiltered

      return filterRankedItems(modeFiltered, serviceSearch, (service) => {
        const label = String(service.name || '')

        return {
          label,
          labelTokens: buildSearchTokens(label),
          searchText: [
            service.serviceCode,
            service.name,
            service.category,
            service.description
          ]
            .filter(Boolean)
            .join(' ')
        }
      }).sort((a, b) => String(a.serviceCode || '').localeCompare(String(b.serviceCode || '')))
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
      const category = String(template.category || '').trim() || DEFAULT_BONO_CATEGORY
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

  const bonoCategoryOptions = useMemo(
    () => bonoCategoryCards.map((item) => item.category),
    [bonoCategoryCards]
  )

  const bonoReplacementCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [DEFAULT_BONO_CATEGORY, ...bonoCategoryOptions]
            .map((category) => String(category || '').trim())
            .filter((category) => category && category !== managingBonoCategory)
        )
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [bonoCategoryOptions, managingBonoCategory]
  )

  const managedBonoCategoryCount = useMemo(
    () =>
      managingBonoCategory
        ? bonoTemplates.filter(
            (template) => String(template.category || DEFAULT_BONO_CATEGORY).trim() === String(managingBonoCategory).trim()
          ).length
        : 0,
    [bonoTemplates, managingBonoCategory]
  )

  const filteredBonos = useMemo(() => {
    const categoryFiltered = bonoSelectedCategory
      ? bonoTemplates.filter((template) => String(template.category || DEFAULT_BONO_CATEGORY) === bonoSelectedCategory)
      : bonoTemplates

    return filterRankedItems(categoryFiltered, bonoSearch, (template) => ({
      label: String(template.description || ''),
      labelTokens: buildSearchTokens(template.description || ''),
      searchText: [
        template.category,
        template.description,
        template.serviceName,
        template.serviceLookup
      ]
        .filter(Boolean)
        .join(' ')
    }))
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

  const handleExportServices = async () => {
    const rowsToExport = serviceHasActiveFilter ? filteredServices : services

    if (rowsToExport.length === 0) {
      toast.error('No hay tratamientos para exportar con el filtro actual')
      return
    }

    try {
      await exportServicesWorkbook(rowsToExport)
      toast.success('Tratamientos exportados a Excel')
    } catch (error) {
      console.error('Services export error:', error)
      toast.error('No se pudo exportar el catálogo de tratamientos')
    }
  }

  const bonoHasActiveFilter = bonoSearch.trim() !== '' || bonoSelectedCategory !== null

  const handleExportBonos = async () => {
    const rowsToExport = bonoHasActiveFilter ? filteredBonos : bonoTemplates

    if (rowsToExport.length === 0) {
      toast.error('No hay bonos para exportar con el filtro actual')
      return
    }

    try {
      await exportBonoTemplatesWorkbook(rowsToExport)
      toast.success('Bonos exportados a Excel')
    } catch (error) {
      console.error('Bonos export error:', error)
      toast.error('No se pudo exportar el catálogo de bonos')
    }
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
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAdmin ? (
                <>
                  <button
                    onClick={() => setServiceImportModalOpen(true)}
                    className="btn btn-secondary"
                  >
                    Importar
                  </button>
                  <button
                    onClick={() => void handleExportServices()}
                    className="btn btn-secondary"
                  >
                    Exportar
                  </button>
                </>
              ) : null}
              <button
                onClick={() => {
                  setEditingService(null)
                  setServiceModalOpen(true)
                }}
                className="btn btn-primary"
              >
                Nuevo Tratamiento
              </button>
            </div>
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

          <div className="flex">
            <button
              type="button"
              onClick={() => handleViewMode('all')}
              className={`card w-full max-w-[14rem] border text-left transition-all ${
                serviceViewMode === 'all'
                  ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
              }`}
            >
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Tratamientos</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{services.length}</p>
            </button>
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
                  (() => {
                    const matchedLegend = resolveAppointmentLegend(legendItems, item.category)
                    const isSelected = serviceSelectedCategory === item.category

                    return (
                      <button
                        key={item.category}
                        type="button"
                        onClick={() => handleSelectServiceCategory(item.category)}
                        className={`card border text-left transition-all ${
                          matchedLegend
                            ? 'hover:brightness-[0.98]'
                            : isSelected
                              ? 'border-primary-600 ring-2 ring-primary-200 dark:ring-primary-800'
                              : 'border-gray-200 dark:border-gray-700 hover:border-primary-500'
                        }`}
                        style={
                          matchedLegend
                            ? {
                                borderColor: matchedLegend.color,
                                boxShadow: isSelected ? `0 0 0 2px ${matchedLegend.color}33` : undefined
                              }
                            : undefined
                        }
                      >
                        <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {item.total} tratamientos
                        </p>
                      </button>
                    )
                  })()
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
                <div className="flex items-center gap-2">
                  {serviceSelectedCategory ? (
                    <button
                      type="button"
                      onClick={handleOpenServiceCategoryModal}
                      className="btn btn-secondary btn-sm"
                    >
                      Gestionar familia
                    </button>
                  ) : null}
                  <span className="badge badge-secondary">{filteredServices.length}</span>
                </div>
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
            <ServiceForm
              service={editingService}
              categories={serviceCategoryOptions}
              onSuccess={handleFormSuccess}
              onCancel={handleCloseModal}
            />
          </Modal>

          <Modal
            isOpen={serviceCategoryModalOpen}
            onClose={handleCloseServiceCategoryModal}
            title="Gestionar Familia"
            maxWidth="md"
          >
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Familia seleccionada</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {managingServiceCategory ? formatCategoryLabel(managingServiceCategory) : '-'}
                </p>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                    Renombrar familia
                  </h3>
                </div>
                <div>
                  <label className="label">Nuevo nombre</label>
                  <input
                    type="text"
                    value={renameServiceCategoryValue}
                    onChange={(event) => setRenameServiceCategoryValue(event.target.value)}
                    className="input"
                    placeholder="Ej: Cejas y pestañas"
                    maxLength={120}
                    disabled={serviceCategorySaving}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleRenameServiceCategory()}
                    className="btn btn-primary"
                    disabled={serviceCategorySaving}
                  >
                    Guardar familia
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                    Mover tratamientos
                  </h3>
                </div>
                <div>
                  <label className="label">Mover tratamientos a</label>
                  <select
                    value={replacementServiceCategoryValue}
                    onChange={(event) => setReplacementServiceCategoryValue(event.target.value)}
                    className="input"
                    disabled={serviceCategorySaving}
                  >
                    <option value="">Selecciona una familia</option>
                    {serviceReplacementCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDeleteServiceCategory()}
                    className="btn btn-primary"
                    disabled={serviceCategorySaving}
                  >
                    Mover tratamientos
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-red-300 bg-red-50/40 p-4 dark:border-red-900 dark:bg-red-950/20">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                    Eliminar familia con tratamientos
                  </h3>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDeleteServiceCategoryWithServices()}
                    className="btn btn-danger"
                    disabled={serviceCategorySaving || managedServiceCategoryCount === 0}
                  >
                    {managedServiceCategoryCount > 0
                      ? `Eliminar todo (${managedServiceCategoryCount})`
                      : 'Eliminar todo'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          {isAdmin ? (
            <Modal
              isOpen={serviceImportModalOpen}
              onClose={() => setServiceImportModalOpen(false)}
              title="Importar Tratamientos desde Excel"
              maxWidth="xl"
            >
              {serviceImportModalOpen ? (
                <Suspense fallback={<LazyPanelLoader />}>
                  <ImportServicesModal
                    onSuccess={() => {
                      setServiceImportModalOpen(false)
                      void refreshServices()
                    }}
                    onCancel={() => setServiceImportModalOpen(false)}
                  />
                </Suspense>
              ) : null}
            </Modal>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bonos</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setBonoImportModalOpen(true)}
                className="btn btn-secondary"
              >
                Importar bonos
              </button>
              <button onClick={() => void handleExportBonos()} className="btn btn-secondary">
                Exportar
              </button>
              <button onClick={() => setBonoModalOpen(true)} className="btn btn-primary">
                Nuevo Bono
              </button>
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
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
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
              </div>
              <div className="flex items-center gap-2">
                {bonoSelectedCategory ? (
                  <button
                    type="button"
                    onClick={handleOpenBonoCategoryModal}
                    className="btn btn-secondary btn-sm"
                  >
                    Gestionar familia
                  </button>
                ) : null}
                <span className="badge badge-secondary">{filteredBonos.length}</span>
              </div>
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

          <Modal
            isOpen={bonoModalOpen}
            onClose={() => setBonoModalOpen(false)}
            title="Nuevo Bono"
            maxWidth="lg"
          >
            <BonoTemplateForm
              categories={bonoCategoryOptions}
              onSuccess={handleBonoTemplateSuccess}
              onCancel={() => setBonoModalOpen(false)}
            />
          </Modal>

          <Modal
            isOpen={bonoCategoryModalOpen}
            onClose={handleCloseBonoCategoryModal}
            title="Gestionar Familia"
            maxWidth="md"
          >
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Familia de bonos seleccionada</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {managingBonoCategory ? formatCategoryLabel(managingBonoCategory) : '-'}
                </p>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                    Renombrar familia
                  </h3>
                </div>
                <div>
                  <label className="label">Nuevo nombre</label>
                  <input
                    type="text"
                    value={renameBonoCategoryValue}
                    onChange={(event) => setRenameBonoCategoryValue(event.target.value)}
                    className="input"
                    placeholder="Ej: Cera premium"
                    maxLength={120}
                    disabled={bonoCategorySaving}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleRenameBonoCategory()}
                    className="btn btn-primary"
                    disabled={bonoCategorySaving}
                  >
                    Guardar familia
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                    Mover bonos
                  </h3>
                </div>
                <div>
                  <label className="label">Mover bonos a</label>
                  <select
                    value={replacementBonoCategoryValue}
                    onChange={(event) => setReplacementBonoCategoryValue(event.target.value)}
                    className="input"
                    disabled={bonoCategorySaving}
                  >
                    <option value="">Selecciona una familia</option>
                    {bonoReplacementCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDeleteBonoCategory()}
                    className="btn btn-primary"
                    disabled={bonoCategorySaving}
                  >
                    Mover bonos
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-red-300 bg-red-50/40 p-4 dark:border-red-900 dark:bg-red-950/20">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                    Eliminar familia con bonos
                  </h3>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDeleteBonoCategoryWithTemplates()}
                    className="btn btn-danger"
                    disabled={bonoCategorySaving || managedBonoCategoryCount === 0}
                  >
                    {managedBonoCategoryCount > 0
                      ? `Eliminar todo (${managedBonoCategoryCount})`
                      : 'Eliminar todo'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          <Modal
            isOpen={bonoImportModalOpen}
            onClose={() => setBonoImportModalOpen(false)}
            title="Importar Catálogo de Bonos"
            maxWidth="xl"
          >
            {bonoImportModalOpen ? (
              <Suspense fallback={<LazyPanelLoader />}>
                <ImportBonosModal
                  onSuccess={() => {
                    setBonoImportModalOpen(false)
                    void loadBonoTemplates()
                  }}
                  onCancel={() => setBonoImportModalOpen(false)}
                />
              </Suspense>
            ) : null}
          </Modal>
        </>
      )}
    </div>
  )
}
