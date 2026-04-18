import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
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

export default function BonoTemplateForm({ onSuccess, onCancel }: BonoTemplateFormProps) {
  const [services, setServices] = useState<AppointmentServiceCatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [saving, setSaving] = useState(false)
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
        setServices(nextServices)
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement
    const { name, value, type } = target

    setFormData((current) => {
      if (name === 'serviceId') {
        const nextService = services.find((service) => service.id === value) || null
        const previousServiceCategory = String(selectedService?.category || '').trim()
        const currentCategory = current.category.trim()
        const nextCategory =
          !currentCategory || currentCategory === previousServiceCategory
            ? String(nextService?.category || '').trim()
            : current.category

        return {
          ...current,
          serviceId: value,
          category: nextCategory
        }
      }

      return {
        ...current,
        [name]: type === 'checkbox' ? target.checked : value
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const description = formData.description.trim()
    const category = formData.category.trim()
    const totalSessions = Number.parseInt(formData.totalSessions, 10)
    const price = Number.parseFloat(String(formData.price || '0').replace(',', '.'))

    if (!description) {
      toast.error('Indica la descripción del bono')
      return
    }

    if (!formData.serviceId) {
      toast.error('Selecciona el tratamiento base')
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label">Categoría</label>
          <input
            type="text"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="input"
            placeholder="Ej: Corporal"
            maxLength={120}
          />
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
                {service.name}
                {service.serviceCode ? ` · ${service.serviceCode}` : ''}
                {service.category ? ` · ${service.category}` : ''}
              </option>
            ))}
          </select>
        </div>
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
          placeholder="Ej: Bono de 6 sesiones"
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
  )
}
