import { useState, useEffect, useMemo } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { loadAppointmentServices, loadBonoTemplates } from '../utils/appointmentCatalogs'
import { buildSearchTokens, filterRankedItems } from '../utils/searchableOptions'

interface BonoPackModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  onSuccess: () => void
}

type BonoSearchOption = {
  type: 'template' | 'service'
  id: string
  label: string
  detail: string
  searchText: string
  labelTokens: string[]
  template?: any
  service?: any
}

export default function BonoPackModal({ isOpen, onClose, clientId, onSuccess }: BonoPackModalProps) {
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [bonoSearchQuery, setBonoSearchQuery] = useState('')
  const [isBonoDropdownOpen, setIsBonoDropdownOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    serviceId: '',
    totalSessions: '5',
    price: '',
    expiryDate: '',
    notes: ''
  })

  useEffect(() => {
    if (isOpen) {
      setCatalogLoading(true)
      Promise.allSettled([loadAppointmentServices(), loadBonoTemplates()])
        .then(([servicesResult, templatesResult]) => {
          setServices(servicesResult.status === 'fulfilled' ? servicesResult.value || [] : [])
          setTemplates(templatesResult.status === 'fulfilled' ? templatesResult.value || [] : [])
        })
        .finally(() => {
          setCatalogLoading(false)
        })
      setFormData({ name: '', serviceId: '', totalSessions: '5', price: '', expiryDate: '', notes: '' })
      setBonoSearchQuery('')
      setIsBonoDropdownOpen(false)
    }
  }, [isOpen])

  const selectedService = useMemo(
    () => services.find((service) => service.id === formData.serviceId) || null,
    [services, formData.serviceId]
  )

  const hasTemplateCatalog = templates.length > 0

  const filteredOptions = useMemo(() => {
    const templateOptions: BonoSearchOption[] = templates.map((template) => ({
      type: 'template' as const,
      id: `template-${template.id}`,
      label: `${template.description} - ${template.serviceName}`,
      detail: `${template.serviceLookup ? `Código: ${template.serviceLookup} · ` : ''}${template.category || 'Bonos'} · ${template.totalSessions} sesiones`,
      searchText: `${template.description} ${template.serviceName} ${template.serviceLookup || ''} ${template.category || ''} ${template.totalSessions}`,
      labelTokens: buildSearchTokens(`${template.description} ${template.serviceName}`),
      template
    }))
    const serviceOptions: BonoSearchOption[] = services.map((service) => ({
      type: 'service' as const,
      id: `service-${service.id}`,
      label: String(service.name || ''),
      detail: `${service.serviceCode ? `Código: ${service.serviceCode} · ` : ''}${service.category || 'Sin categoría'}`,
      searchText: `${service.name || ''} ${service.serviceCode || ''} ${service.category || ''}`,
      labelTokens: buildSearchTokens(service.name || ''),
      service
    }))

    const source: BonoSearchOption[] = (hasTemplateCatalog ? templateOptions : serviceOptions).sort((a, b) =>
      a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
    )

    return filterRankedItems(source, bonoSearchQuery, (option) => ({
      label: option.label,
      labelTokens: option.labelTokens,
      searchText: `${option.label} ${option.detail} ${option.searchText}`
    }))
  }, [services, templates, bonoSearchQuery, hasTemplateCatalog])

  const handleSelectServiceFromSearch = (service: any) => {
    const serviceName = String(service.name || '').trim()
    const servicePrice = Number(service.price || 0)

    setBonoSearchQuery(serviceName)
    setIsBonoDropdownOpen(false)
    setFormData((prev) => ({
      ...prev,
      serviceId: service.id,
      name: `Bono ${serviceName}`,
      price: prev.price.trim()
        ? prev.price
        : Number.isFinite(servicePrice)
          ? servicePrice.toFixed(2).replace('.', ',')
          : ''
    }))
  }

  const handleSelectTemplate = (template: any) => {
    setBonoSearchQuery(`${template.description} - ${template.serviceName}`)
    setIsBonoDropdownOpen(false)
    setFormData((prev) => ({
      ...prev,
      serviceId: template.serviceId || '',
      name: `${template.description} - ${template.serviceName}`,
      totalSessions: String(template.totalSessions || 1),
      price: Number(template.price || 0).toFixed(2).replace('.', ',')
    }))
  }

  const handleBonoSearchChange = (value: string) => {
    setBonoSearchQuery(value)
    setIsBonoDropdownOpen(true)
    setFormData((prev) => ({
      ...prev,
      serviceId: '',
      name: value
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('El nombre del bono es requerido')
      return
    }
    const totalSessions = parseInt(formData.totalSessions, 10)
    if (!totalSessions || totalSessions < 1) {
      toast.error('El número de sesiones debe ser al menos 1')
      return
    }

    setLoading(true)
    try {
      await api.post('/bonos', {
        clientId,
        name: formData.name.trim(),
        serviceId: formData.serviceId || null,
        totalSessions,
        price: formData.price ? parseFloat(formData.price.replace(',', '.')) : 0,
        expiryDate: formData.expiryDate || null,
        notes: formData.notes.trim() || null
      })
      toast.success('Bono creado exitosamente')
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error creating bono:', error)
      toast.error(error.response?.data?.error || 'Error al crear el bono')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Bono" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className="relative"
          onFocus={() => setIsBonoDropdownOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsBonoDropdownOpen(false), 120)
          }}
        >
          <label className="label">Buscar bono <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={bonoSearchQuery}
            onChange={(event) => handleBonoSearchChange(event.target.value)}
            className="input"
            placeholder="Escribe para buscar por nombre, código o familia..."
            required
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {hasTemplateCatalog
              ? 'Se muestran los bonos del catálogo importado.'
              : 'No hay catálogo de bonos importado; se usan tratamientos como base.'}
          </p>

          {isBonoDropdownOpen && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
              {catalogLoading ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Cargando catálogo...
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {hasTemplateCatalog
                    ? 'No se encontraron bonos del catálogo'
                    : 'No se encontraron tratamientos para crear el bono'}
                </div>
              ) : (
                filteredOptions.slice(0, 30).map((option: any) => (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      if (option.type === 'template') {
                        handleSelectTemplate(option.template)
                      } else {
                        handleSelectServiceFromSearch(option.service)
                      }
                    }}
                    className="w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{option.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {option.detail}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

        </div>

        <div>
          <label className="label">Servicio asociado</label>
          <input
            type="text"
            className="input"
            value={selectedService ? `${selectedService.name} - ${selectedService.category || 'Sin categoría'}` : 'Sin servicio específico'}
            readOnly
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nº sesiones <span className="text-red-500">*</span></label>
            <input
              type="number"
              name="totalSessions"
              value={formData.totalSessions}
              onChange={handleChange}
              className="input"
              min="1"
              max="100"
              required
            />
          </div>
          <div>
            <label className="label">Precio total</label>
            <input
              type="text"
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="input"
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          <label className="label">Fecha de expiración</label>
          <input
            type="date"
            name="expiryDate"
            value={formData.expiryDate}
            onChange={handleChange}
            className="input"
          />
        </div>

        <div>
          <label className="label">Notas</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input resize-none"
            rows={2}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Creando...' : 'Crear Bono'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
