import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import ServiceForm from './ServiceForm'
import {
  createBonoTemplateItem,
  loadAppointmentServices,
  type AppointmentServiceCatalogItem,
  type BonoTemplateCatalogItem
} from '../utils/appointmentCatalogs'

interface BonoTemplateFormProps {
  onSuccess: (templates: BonoTemplateCatalogItem[]) => void
  onCancel: () => void
}

const normalizePriceInput = (value: string) => value.replace('.', ',')

const buildServiceDisplayLabel = (service: AppointmentServiceCatalogItem) =>
  [
    String(service.name || '').trim(),
    String(service.serviceCode || '').trim(),
    String(service.category || '').trim()
  ]
    .filter(Boolean)
    .join(' · ')

const sortServices = (items: AppointmentServiceCatalogItem[]) =>
  [...items].sort((left, right) => {
    const nameCompare = String(left.name || '').localeCompare(String(right.name || ''), 'es', {
      sensitivity: 'base'
    })
    if (nameCompare !== 0) return nameCompare

    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
    if (categoryCompare !== 0) return categoryCompare

    return String(left.serviceCode || '').localeCompare(String(right.serviceCode || ''), 'es', {
      sensitivity: 'base'
    })
  })

const dedupeServices = (items: AppointmentServiceCatalogItem[]) => {
  const seen = new Set<string>()

  return sortServices(
    items.filter((service) => {
      const dedupeKey = [
        String(service.name || '').trim().toLowerCase(),
        String(service.serviceCode || '').trim().toLowerCase(),
        String(service.category || '').trim().toLowerCase()
      ].join('::')

      if (seen.has(dedupeKey)) {
        return false
      }

      seen.add(dedupeKey)
      return true
    })
  )
}

export default function BonoTemplateForm({ onSuccess, onCancel }: BonoTemplateFormProps) {
  const [services, setServices] = useState<AppointmentServiceCatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    serviceId: '',
    totalSessions: '5',
    price: '',
    isActive: true
  })

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        setLoadingCatalog(true)
        const nextServices = await loadAppointmentServices()
        setServices(dedupeServices(nextServices))
      } catch (error) {
        console.error('Error loading services for bono template form:', error)
        toast.error('No se pudieron cargar los tratamientos')
      } finally {
        setLoadingCatalog(false)
      }
    }

    void loadCatalog()
  }, [])

  const selectedService = useMemo(
    () => services.find((service) => service.id === formData.serviceId) || null,
    [services, formData.serviceId]
  )

  const serviceCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          services
            .map((service) => String(service.category || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [services]
  )

  const handleBaseServiceSelection = (serviceId: string) => {
    const nextService = services.find((service) => service.id === serviceId) || null
    const previousServiceCategory = String(selectedService?.category || '').trim()
    const currentCategory = formData.category.trim()
    const nextServiceCategory = String(nextService?.category || '').trim()
    const shouldSyncCategory =
      !currentCategory || currentCategory === previousServiceCategory

    setFormData((current) => ({
      ...current,
      serviceId,
      category: shouldSyncCategory ? nextServiceCategory : current.category
    }))
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement
    const { name, value, type } = target

    if (name === 'serviceId') {
      handleBaseServiceSelection(value)
      return
    }

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? target.checked : value
    }))
  }

  const handleServiceCreated = (savedService: AppointmentServiceCatalogItem) => {
    const nextServices = dedupeServices([...services, savedService])
    setServices(nextServices)
    handleBaseServiceSelection(savedService.id)

    const savedCategory = String(savedService.category || '').trim()
    if (savedCategory) {
      setFormData((current) => ({
        ...current,
        category: savedCategory
      }))
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const description = formData.description.trim()
    const category = formData.category.trim()
    const totalSessions = Number.parseInt(formData.totalSessions, 10)
    const price = Number.parseFloat(String(formData.price || '0').replace(',', '.'))

    if (!category) {
      toast.error('Selecciona una categoría')
      return
    }

    if (!description) {
      toast.error('Indica la descripción del bono')
      return
    }

    if (!formData.serviceId) {
      toast.error('Selecciona o crea el tratamiento base')
      return
    }

    if (!Number.isFinite(totalSessions) || totalSessions < 1) {
      toast.error('Indica un número válido de sesiones')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      toast.error('Indica un precio válido')
      return
    }

    setSaving(true)

    try {
      const nextTemplates = await createBonoTemplateItem({
        category,
        description,
        serviceId: formData.serviceId,
        totalSessions,
        price,
        isActive: formData.isActive
      })
      onSuccess(nextTemplates)
      toast.success('Bono añadido al catálogo')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'No se pudo crear el bono')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Selecciona una categoría</option>
              {serviceCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">
              Tratamiento base <span className="text-red-500">*</span>
            </label>
            <select
              name="serviceId"
              value={formData.serviceId}
              onChange={handleChange}
              className="input"
              disabled={loadingCatalog}
              required
            >
              <option value="">
                {loadingCatalog ? 'Cargando tratamientos...' : 'Selecciona un tratamiento'}
              </option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {buildServiceDisplayLabel(service)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setServiceModalOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            Crear tratamiento base
          </button>
        </div>

        <div>
          <label className="label">
            Descripción <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="input"
            placeholder="Ej: Bono de 10 sesiones"
            maxLength={200}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">
              Sesiones <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="totalSessions"
              value={formData.totalSessions}
              onChange={handleChange}
              className="input"
              min="1"
              max="200"
              required
            />
          </div>
          <div>
            <label className="label">Precio</label>
            <input
              type="text"
              name="price"
              value={formData.price}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  price: normalizePriceInput(event.target.value)
                }))
              }
              className="input"
              placeholder="0,00"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Activo
            </label>
          </div>
        </div>

        {selectedService && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
            Tratamiento base: {selectedService.name}
            {selectedService.category ? ` · ${selectedService.category}` : ''}
            {selectedService.serviceCode ? ` · Código ${selectedService.serviceCode}` : ''}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || loadingCatalog}>
            {saving ? 'Guardando...' : 'Crear Bono'}
          </button>
        </div>
      </form>

      <Modal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title="Nuevo Tratamiento Base"
        maxWidth="lg"
      >
        <ServiceForm
          categories={serviceCategoryOptions}
          onSaved={handleServiceCreated}
          onSuccess={() => setServiceModalOpen(false)}
          onCancel={() => setServiceModalOpen(false)}
        />
      </Modal>
    </>
  )
}
