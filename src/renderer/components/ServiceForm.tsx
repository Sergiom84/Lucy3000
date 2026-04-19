import { useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { invalidateAppointmentServicesCache } from '../utils/appointmentCatalogs'

interface ServiceFormProps {
  service?: any
  categories?: string[]
  onSaved?: (savedService: any) => void
  onSuccess: () => void
  onCancel: () => void
}

const NEW_CATEGORY_OPTION = '__new_category__'

const parseDecimalInput = (value: string): number | null => {
  if (!value.trim()) return null
  const normalized = value.trim().replace(/\s*€\s*/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const parseDurationInput = (value: string): number | null => {
  if (!value.trim()) return null
  const digits = value.replace(/[^0-9]/g, '')
  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export default function ServiceForm({
  service,
  categories = [],
  onSaved,
  onSuccess,
  onCancel
}: ServiceFormProps) {
  const [loading, setLoading] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>('existing')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [formData, setFormData] = useState({
    serviceCode: '',
    category: '',
    name: '',
    price: '',
    taxRate: '',
    duration: '',
    isActive: true
  })

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...categories, String(service?.category || '').trim()]
            .map((category) => String(category || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [categories, service?.category]
  )

  useEffect(() => {
    if (service) {
      setFormData({
        serviceCode: service.serviceCode || '',
        category: String(service.category || '').trim(),
        name: service.name || '',
        price: service.price?.toString() || '',
        taxRate: service.taxRate?.toString() || '',
        duration: service.duration?.toString() || '',
        isActive: service.isActive ?? true
      })
      setCategoryMode('existing')
      setNewCategoryName('')
      return
    }

    setFormData({
      serviceCode: '',
      category: '',
      name: '',
      price: '',
      taxRate: '',
      duration: '',
      isActive: true
    })
    setCategoryMode('existing')
    setNewCategoryName('')
  }, [service])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleCategorySelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target

    if (value === NEW_CATEGORY_OPTION) {
      setCategoryMode('new')
      return
    }

    setCategoryMode('existing')
    setFormData((prev) => ({
      ...prev,
      category: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const resolvedCategory =
        categoryMode === 'new' ? newCategoryName.trim() : formData.category.trim()

      if (!resolvedCategory) {
        toast.error('La categoría es obligatoria')
        setLoading(false)
        return
      }

      if (!formData.name.trim()) {
        toast.error('La descripción es requerida')
        setLoading(false)
        return
      }

      const priceValue = parseDecimalInput(formData.price)
      if (priceValue === null || priceValue <= 0) {
        toast.error('La tarifa debe ser mayor a 0')
        setLoading(false)
        return
      }

      const durationValue = parseDurationInput(formData.duration)
      if (durationValue === null || durationValue <= 0) {
        toast.error('El tiempo debe ser mayor a 0 minutos')
        setLoading(false)
        return
      }

      const taxRateValue = parseDecimalInput(formData.taxRate)
      if (formData.taxRate.trim() && taxRateValue === null) {
        toast.error('El IVA no tiene un formato válido')
        setLoading(false)
        return
      }

      const dataToSend = {
        serviceCode: formData.serviceCode.trim() || null,
        category: resolvedCategory,
        name: formData.name.trim(),
        price: formData.price.trim(),
        taxRate: formData.taxRate.trim() || null,
        duration: formData.duration.trim(),
        isActive: formData.isActive
      }

      let savedService: any

      if (service) {
        const response = await api.put(`/services/${service.id}`, dataToSend)
        savedService = response.data
        invalidateAppointmentServicesCache()
        toast.success('Tratamiento actualizado')
      } else {
        const response = await api.post('/services', dataToSend)
        savedService = response.data
        invalidateAppointmentServicesCache()
        toast.success('Tratamiento creado')
      }

      if (savedService) {
        onSaved?.(savedService)
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving service:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el tratamiento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Tratamiento
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Código de identificación</label>
            <input
              type="text"
              name="serviceCode"
              value={formData.serviceCode}
              onChange={handleChange}
              className="input"
              placeholder="Ej: TRAT-001"
            />
          </div>
          <div>
            <label className="label">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryMode === 'new' ? NEW_CATEGORY_OPTION : formData.category}
              onChange={handleCategorySelection}
              className="input"
            >
              <option value="">Selecciona una categoría</option>
              <option value={NEW_CATEGORY_OPTION}>Crear nueva categoría</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          {categoryMode === 'new' && (
            <div>
              <label className="label">
                Nueva categoría <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                className="input"
                placeholder="Ej: Cejas y pestañas"
                maxLength={120}
                required
              />
            </div>
          )}
          <div className={categoryMode === 'new' ? 'md:col-span-2' : 'md:col-span-1'}>
            <label className="label">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input"
              placeholder="Ej: Higiene facial"
              required
            />
          </div>
          <div>
            <label className="label">
              Tarifa (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="input"
              placeholder="45,00"
              required
            />
          </div>
          <div>
            <label className="label">IVA</label>
            <input
              type="text"
              name="taxRate"
              value={formData.taxRate}
              onChange={handleChange}
              className="input"
              placeholder="21"
            />
          </div>
          <div>
            <label className="label">
              Tiempo (minutos) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="duration"
              value={formData.duration}
              onChange={handleChange}
              className="input"
              placeholder="60"
              required
            />
          </div>
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="isActive"
          name="isActive"
          checked={formData.isActive}
          onChange={handleChange}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
          Tratamiento activo
        </label>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={loading}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Guardando...' : service ? 'Actualizar' : 'Crear Tratamiento'}
        </button>
      </div>
    </form>
  )
}
