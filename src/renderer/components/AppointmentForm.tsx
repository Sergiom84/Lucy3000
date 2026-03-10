import { useState, useEffect, useMemo } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'

interface AppointmentFormProps {
  appointment?: any
  onSuccess: () => void
  onCancel: () => void
  preselectedDate?: Date
  initialCabin?: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
}

const statusOptions = [
  { value: 'SCHEDULED', label: 'Programada', color: 'secondary' },
  { value: 'CONFIRMED', label: 'Confirmada', color: 'primary' },
  { value: 'IN_PROGRESS', label: 'En Progreso', color: 'warning' },
  { value: 'COMPLETED', label: 'Completada', color: 'success' },
  { value: 'CANCELLED', label: 'Cancelada', color: 'danger' },
  { value: 'NO_SHOW', label: 'No Asistió', color: 'danger' }
]

type SearchableOption = {
  id: string
  label: string
  detail?: string
  searchText: string
}

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

function SearchableSelect({
  value,
  options,
  onSelect,
  placeholder,
  emptyText
}: {
  value: string
  options: SearchableOption[]
  onSelect: (id: string) => void
  placeholder: string
  emptyText: string
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) || null,
    [options, value]
  )

  useEffect(() => {
    if (!value) {
      if (!isOpen) {
        setQuery('')
      }
      return
    }

    if (selectedOption && !isOpen) {
      setQuery(selectedOption.label)
    }
  }, [value, selectedOption, isOpen])

  const filteredOptions = useMemo(() => {
    const term = normalizeText(query)
    if (!term) return options
    return options.filter((option) => normalizeText(option.searchText).includes(term))
  }, [options, query])

  const handleSelect = (option: SearchableOption) => {
    onSelect(option.id)
    setQuery(option.label)
    setIsOpen(false)
  }

  return (
    <div
      className="relative"
      onFocus={() => setIsOpen(true)}
      onBlur={() => {
        window.setTimeout(() => setIsOpen(false), 120)
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const nextQuery = e.target.value
          setQuery(nextQuery)
          setIsOpen(true)
          if (value) {
            onSelect('')
          }
        }}
        className="input"
        placeholder={placeholder}
      />

      {isOpen && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {emptyText}
            </div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(option)
                }}
                className="w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {option.label}
                </p>
                {option.detail && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.detail}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const cabinOptions = [
  { value: 'LUCY', label: 'Lucy' },
  { value: 'TAMARA', label: 'Tamara' },
  { value: 'CABINA_1', label: 'Cabina 1' },
  { value: 'CABINA_2', label: 'Cabina 2' }
]

export default function AppointmentForm({
  appointment,
  onSuccess,
  onCancel,
  preselectedDate,
  initialCabin = 'LUCY'
}: AppointmentFormProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<any>(null)

  const [formData, setFormData] = useState({
    clientId: '',
    serviceId: '',
      userId: user?.id || '',
      cabin: 'LUCY',
      date: '',
      startTime: '',
      endTime: '',
    status: 'SCHEDULED',
    notes: '',
    reminder: true
  })

  useEffect(() => {
    fetchClients()
    fetchServices()
  }, [])

  useEffect(() => {
    if (appointment) {
      const appointmentDate = new Date(appointment.date)
      setFormData({
        clientId: appointment.clientId || '',
        serviceId: appointment.serviceId || '',
        userId: appointment.userId || user?.id || '',
        cabin: appointment.cabin || initialCabin,
        date: appointmentDate.toISOString().split('T')[0],
        startTime: appointment.startTime || '',
        endTime: appointment.endTime || '',
        status: appointment.status || 'SCHEDULED',
        notes: appointment.notes || '',
        reminder: appointment.reminder ?? true
      })
      if (appointment.service) {
        setSelectedService(appointment.service)
      }
    } else if (preselectedDate) {
      setFormData(prev => ({
        ...prev,
        cabin: initialCabin,
        date: preselectedDate.toISOString().split('T')[0]
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        cabin: initialCabin
      }))
    }
  }, [appointment, preselectedDate, user, initialCabin])

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients?isActive=true')
      // Ordenar alfabéticamente por nombre
      const sortedClients = response.data.sort((a: any, b: any) => {
        const fullNameA = `${a.firstName} ${a.lastName}`
        const fullNameB = `${b.firstName} ${b.lastName}`
        return fullNameA.localeCompare(fullNameB, 'es', { sensitivity: 'base' })
      })
      setClients(sortedClients)
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchServices = async () => {
    try {
      const response = await api.get('/services?isActive=true')
      // Ordenar alfabéticamente por nombre
      const sortedServices = response.data.sort((a: any, b: any) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
      setServices(sortedServices)
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const clientOptions = useMemo<SearchableOption[]>(() => {
    return clients.map((client) => {
      const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim()
      const phone = String(client.phone || 'Sin teléfono')
      const email = client.email ? String(client.email) : ''
      const detail = email ? `${phone} · ${email}` : phone

      return {
        id: client.id,
        label: fullName,
        detail,
        searchText: `${fullName} ${phone} ${email}`
      }
    })
  }, [clients])

  const serviceOptions = useMemo<SearchableOption[]>(() => {
    return services.map((service) => {
      const name = String(service.name || '')
      const category = String(service.category || '')
      const duration = Number(service.duration || 0)

      return {
        id: service.id,
        label: name,
        detail: `${duration} min${category ? ` · ${category}` : ''}`,
        searchText: `${name} ${category} ${duration}`
      }
    })
  }, [services])

  const calculateEndTime = (startTime: string, duration: number) => {
    const [hours, minutes] = startTime.split(':')
    const startDate = new Date()
    startDate.setHours(parseInt(hours), parseInt(minutes))
    startDate.setMinutes(startDate.getMinutes() + duration)
    return `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
  }

  const handleClientSelect = (clientId: string) => {
    setFormData((prev) => ({
      ...prev,
      clientId
    }))
  }

  const handleServiceSelect = (serviceId: string) => {
    const service = services.find((item) => item.id === serviceId) || null
    setSelectedService(service)

    setFormData((prev) => ({
      ...prev,
      serviceId,
      endTime: service && prev.startTime ? calculateEndTime(prev.startTime, service.duration) : prev.endTime
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))

    // Si cambia startTime y hay un servicio seleccionado, recalcular endTime
    if (name === 'startTime' && selectedService) {
      const endTime = calculateEndTime(value, selectedService.duration)
      setFormData(prev => ({ ...prev, endTime }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validaciones
      if (!formData.clientId) {
        toast.error('Debe seleccionar un cliente')
        setLoading(false)
        return
      }

      if (!formData.serviceId) {
        toast.error('Debe seleccionar un servicio')
        setLoading(false)
        return
      }

      if (!formData.date) {
        toast.error('Debe seleccionar una fecha')
        setLoading(false)
        return
      }

      if (!formData.startTime || !formData.endTime) {
        toast.error('Debe seleccionar horario de inicio y fin')
        setLoading(false)
        return
      }

      // Preparar datos
      const dataToSend = {
        clientId: formData.clientId,
        serviceId: formData.serviceId,
        userId: formData.userId || user?.id,
        cabin: formData.cabin,
        date: new Date(formData.date).toISOString(),
        startTime: formData.startTime,
        endTime: formData.endTime,
        status: formData.status,
        notes: formData.notes.trim() || null,
        reminder: formData.reminder
      }

      if (appointment) {
        await api.put(`/appointments/${appointment.id}`, dataToSend)
        toast.success('Cita actualizada exitosamente')
      } else {
        await api.post('/appointments', dataToSend)
        toast.success('Cita creada exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving appointment:', error)
      toast.error(error.response?.data?.error || 'Error al guardar la cita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente y Servicio */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Cliente y Servicio
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">
              Cliente <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={formData.clientId}
              options={clientOptions}
              onSelect={handleClientSelect}
              placeholder="Buscar cliente por nombre, teléfono o email..."
              emptyText="No se encontraron clientes"
            />
          </div>

          <div>
            <label className="label">
              Servicio <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={formData.serviceId}
              options={serviceOptions}
              onSelect={handleServiceSelect}
              placeholder="Buscar servicio por nombre o categoría..."
              emptyText="No se encontraron servicios"
            />
          </div>
        </div>
      </div>

      {/* Fecha y Hora */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
          Fecha y Horario
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">
              Hora Inicio <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">
              Hora Fin <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">
              Cabina <span className="text-red-500">*</span>
            </label>
            <select
              name="cabin"
              value={formData.cabin}
              onChange={handleChange}
              className="input"
              required
            >
              {cabinOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Estado */}
      <div>
        <label className="label">Estado</label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="input"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notas */}
      <div>
        <label className="label">Notas</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
          placeholder="Instrucciones especiales, preferencias del cliente..."
        />
      </div>

      {/* Recordatorio */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="reminder"
          name="reminder"
          checked={formData.reminder}
          onChange={handleChange}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="reminder" className="ml-2 text-sm text-gray-900 dark:text-white">
          Enviar recordatorio al cliente
        </label>
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Guardando...' : appointment ? 'Actualizar Cita' : 'Crear Cita'}
        </button>
      </div>
    </form>
  )
}
