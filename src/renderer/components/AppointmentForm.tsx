import { useState, useEffect, useMemo } from 'react'
import { Save, X } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/format'

interface BonoAppointmentContext {
  bonoPackId: string
  clientId: string
  serviceId?: string | null
  lockClient?: boolean
  lockService?: boolean
}

interface AppointmentFormProps {
  appointment?: any
  onSuccess: () => void
  onCancel: () => void
  preselectedDate?: Date
  initialCabin?: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
  fromBono?: BonoAppointmentContext | null
}

type SearchableOption = {
  id: string
  label: string
  detail?: string
  searchText: string
}

type ClientBonoSummary = {
  id: string
  name: string
  totalSessions: number
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  sessions: Array<{ status: 'AVAILABLE' | 'CONSUMED' }>
}

const professionalOptions = [
  { value: 'LUCY', label: 'Lucy' },
  { value: 'TAMARA', label: 'Tamara' },
  { value: 'CHEMA', label: 'Chema' },
  { value: 'OTROS', label: 'Otros' }
]

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
  emptyText,
  disabled = false
}: {
  value: string
  options: SearchableOption[]
  onSelect: (id: string) => void
  placeholder: string
  emptyText: string
  disabled?: boolean
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

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
      if (selectedOption) {
        setQuery(selectedOption.label)
      }
    }
  }, [disabled, selectedOption])

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
      onFocus={() => {
        if (!disabled) setIsOpen(true)
      }}
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
        className="input disabled:cursor-not-allowed disabled:opacity-70"
        placeholder={placeholder}
        disabled={disabled}
      />

      {!disabled && isOpen && (
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

const getRemainingSessions = (bonoPack: ClientBonoSummary) => {
  const consumed = bonoPack.sessions.filter((session) => session.status === 'CONSUMED').length
  return Math.max(Number(bonoPack.totalSessions || 0) - consumed, 0)
}

export default function AppointmentForm({
  appointment,
  onSuccess,
  onCancel,
  preselectedDate,
  initialCabin = 'LUCY',
  fromBono = null
}: AppointmentFormProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<any>(null)
  const [clientBonos, setClientBonos] = useState<ClientBonoSummary[]>([])

  const isCreatingFromBono = !appointment && Boolean(fromBono?.bonoPackId)
  const lockClient = isCreatingFromBono && Boolean(fromBono?.lockClient)
  const lockService = isCreatingFromBono && Boolean(fromBono?.lockService)

  const [formData, setFormData] = useState({
    clientId: fromBono?.clientId || '',
    serviceId: fromBono?.serviceId || '',
    userId: user?.id || '',
    cabin: initialCabin,
    professional: 'LUCY',
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
        professional: appointment.professional || 'LUCY',
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
      return
    }

    setFormData((prev) => ({
      ...prev,
      clientId: fromBono?.clientId || prev.clientId,
      serviceId: fromBono?.serviceId || prev.serviceId,
      userId: user?.id || prev.userId || '',
      cabin: initialCabin,
      professional: prev.professional || 'LUCY',
      date: preselectedDate ? preselectedDate.toISOString().split('T')[0] : prev.date
    }))
  }, [appointment, preselectedDate, user, initialCabin, fromBono])

  useEffect(() => {
    if (!formData.clientId) {
      setClientBonos([])
      return
    }

    let cancelled = false
    const fetchBonos = async () => {
      try {
        const response = await api.get(`/bonos/client/${formData.clientId}`)
        if (!cancelled) {
          setClientBonos(Array.isArray(response.data) ? response.data : [])
        }
      } catch (error) {
        if (!cancelled) {
          setClientBonos([])
        }
      }
    }

    void fetchBonos()

    return () => {
      cancelled = true
    }
  }, [formData.clientId])

  useEffect(() => {
    if (!formData.serviceId) {
      setSelectedService(null)
      return
    }

    const matchedService = services.find((service) => service.id === formData.serviceId) || null
    setSelectedService(matchedService)
  }, [formData.serviceId, services])

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients?isActive=true')
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
      const sortedServices = response.data.sort((a: any, b: any) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
      setServices(sortedServices)
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === formData.clientId) || null,
    [clients, formData.clientId]
  )

  const accountBalance = Number(selectedClient?.accountBalance || 0)

  const activeBonos = useMemo(() => {
    return clientBonos
      .map((bonoPack) => ({
        ...bonoPack,
        remainingSessions: getRemainingSessions(bonoPack)
      }))
      .filter((bonoPack) => bonoPack.status === 'ACTIVE' && bonoPack.remainingSessions > 0)
  }, [clientBonos])

  const showClientFinancialSummary = Boolean(formData.clientId) && (accountBalance > 0 || activeBonos.length > 0)

  const clientOptions = useMemo<SearchableOption[]>(() => {
    return clients.map((client) => {
      const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim()
      const phone = String(client.phone || 'Sin telefono')
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
    startDate.setHours(parseInt(hours, 10), parseInt(minutes, 10))
    startDate.setMinutes(startDate.getMinutes() + duration)
    return `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
  }

  const handleClientSelect = (clientId: string) => {
    if (lockClient) return
    setFormData((prev) => ({
      ...prev,
      clientId
    }))
  }

  const handleServiceSelect = (serviceId: string) => {
    if (lockService) return
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
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))

    if (name === 'startTime' && selectedService) {
      const endTime = calculateEndTime(value, selectedService.duration)
      setFormData((prev) => ({ ...prev, endTime }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    let requestPayload: Record<string, unknown> | null = null

    try {
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

      // Validate start < end
      if (formData.startTime >= formData.endTime) {
        toast.error('La hora de inicio debe ser anterior a la hora de fin')
        setLoading(false)
        return
      }

      // Validate not in the past
      const todayStr = new Date().toISOString().split('T')[0]
      if (formData.date < todayStr) {
        toast.error('No se puede crear una cita en el pasado')
        setLoading(false)
        return
      }
      if (formData.date === todayStr) {
        const now = new Date()
        const nowMinutes = now.getHours() * 60 + now.getMinutes()
        const [sh, sm] = formData.startTime.split(':').map(Number)
        if (sh * 60 + sm < nowMinutes) {
          toast.error('No se puede crear una cita en una hora que ya ha pasado')
          setLoading(false)
          return
        }
      }

      const dataToSend: Record<string, unknown> = {
        clientId: formData.clientId,
        serviceId: formData.serviceId,
        userId: formData.userId || user?.id,
        cabin: formData.cabin,
        professional: formData.professional,
        date: new Date(formData.date).toISOString(),
        startTime: formData.startTime,
        endTime: formData.endTime,
        status: formData.status,
        notes: formData.notes.trim() || null,
        reminder: formData.reminder
      }
      requestPayload = dataToSend

      if (appointment) {
        await api.put(`/appointments/${appointment.id}`, dataToSend)
        toast.success('Cita actualizada exitosamente')
      } else if (isCreatingFromBono && fromBono?.bonoPackId) {
        const bonoPayload = {
          userId: dataToSend.userId,
          serviceId: dataToSend.serviceId,
          cabin: dataToSend.cabin,
          professional: dataToSend.professional,
          date: dataToSend.date,
          startTime: dataToSend.startTime,
          endTime: dataToSend.endTime,
          status: dataToSend.status,
          notes: dataToSend.notes,
          reminder: dataToSend.reminder
        }
        await api.post(`/bonos/${fromBono.bonoPackId}/appointments`, bonoPayload)
        toast.success('Cita creada y sesion reservada')
      } else {
        await api.post('/appointments', dataToSend)
        toast.success('Cita creada exitosamente')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Error saving appointment:', {
        error,
        appointmentId: appointment?.id || null,
        fromBonoPackId: fromBono?.bonoPackId || null,
        requestPayload
      })
      toast.error(error.response?.data?.error || 'Error al guardar la cita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
              placeholder="Buscar cliente por nombre, telefono o email..."
              emptyText="No se encontraron clientes"
              disabled={lockClient}
            />
            {lockClient && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Cliente fijado por el bono seleccionado.
              </p>
            )}
          </div>

          <div>
            <label className="label">
              Servicio <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={formData.serviceId}
              options={serviceOptions}
              onSelect={handleServiceSelect}
              placeholder="Buscar servicio por nombre o categoria..."
              emptyText="No se encontraron servicios"
              disabled={lockService}
            />
            {lockService && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Servicio fijado por el bono seleccionado.
              </p>
            )}
          </div>
        </div>
      </div>

      {showClientFinancialSummary && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-900/20">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Resumen del cliente</h4>
          <div className="space-y-3">
            {accountBalance > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Abono disponible</p>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {formatCurrency(accountBalance)}
                </p>
              </div>
            )}

            {activeBonos.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/30">
                <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">
                  Bonos activos
                </p>
                <div className="space-y-1.5">
                  {activeBonos.map((bonoPack) => (
                    <div
                      key={bonoPack.id}
                      className="flex items-center justify-between text-sm text-blue-900 dark:text-blue-100"
                    >
                      <span className="truncate pr-3">{bonoPack.name}</span>
                      <span className="font-semibold whitespace-nowrap">
                        {bonoPack.remainingSessions} sesiones
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              min={new Date().toISOString().split('T')[0]}
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
              min="09:00"
              max="20:30"
              step="900"
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
              min="09:00"
              max="21:00"
              step="900"
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
        {formData.startTime && (() => {
          const [h, m] = formData.startTime.split(':').map(Number)
          const mins = h * 60 + m
          if (mins >= 840 && mins < 960) {
            return (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                Aviso: Esta hora esta fuera del horario habitual (descanso 14:00-16:00)
              </p>
            )
          }
          return null
        })()}
      </div>

      <div>
        <label className="label">Profesional <span className="text-red-500">*</span></label>
        <select
          name="professional"
          value={formData.professional}
          onChange={handleChange}
          className="input"
          required
        >
          {professionalOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Notas internas</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
          placeholder="Observaciones privadas para el equipo..."
        />
      </div>

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
          Crear recordatorio interno para el equipo
        </label>
      </div>

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
