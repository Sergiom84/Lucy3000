import { useState, useEffect, useMemo } from 'react'
import { Clock, Save, X } from 'lucide-react'
import api from '../utils/api'
import { loadAppointmentClients, loadAppointmentServices } from '../utils/appointmentCatalogs'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/format'
import {
  buildTimeOptions,
  BUSINESS_BREAK_END_MINUTES,
  BUSINESS_BREAK_START_MINUTES,
  BUSINESS_END_MINUTES,
  BUSINESS_START_MINUTES,
  getAppointmentTimeInputState,
  padTime,
  TIME_STEP_MINUTES,
  timeToMinutes,
  minutesToTime
} from '../utils/appointmentTime'
import {
  buildSearchTokens,
  filterSearchableOptions,
  type SearchableOption
} from '../utils/searchableOptions'

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
  preselectedStartTime?: string
  initialCabin?: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
  fromBono?: BonoAppointmentContext | null
}

type ClientBonoSummary = {
  id: string
  name: string
  totalSessions: number
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  sessions: Array<{ status: 'AVAILABLE' | 'CONSUMED' }>
}

const SEARCH_RESULTS_LIMIT = 50

const professionalOptions = [
  { value: 'LUCY', label: 'Lucy' },
  { value: 'TAMARA', label: 'Tamara' },
  { value: 'CHEMA', label: 'Chema' },
  { value: 'OTROS', label: 'Otros' }
]

const getLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear()
  const month = padTime(value.getMonth() + 1)
  const day = padTime(value.getDate())
  return `${year}-${month}-${day}`
}

function TimeInput({
  value,
  onChange,
  onBlur,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  placeholder: string
}) {
  const listId = placeholder === '08:00' ? 'appointment-start-time-options' : 'appointment-end-time-options'
  const options = useMemo(() => {
    return listId === 'appointment-start-time-options'
      ? buildTimeOptions(BUSINESS_START_MINUTES, BUSINESS_END_MINUTES - TIME_STEP_MINUTES)
      : buildTimeOptions(BUSINESS_START_MINUTES + TIME_STEP_MINUTES, BUSINESS_END_MINUTES)
  }, [listId])

  return (
    <div className="relative">
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="input pl-10"
        placeholder={placeholder}
        list={listId}
        inputMode="numeric"
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}

function SearchableSelect({
  value,
  options,
  onSelect,
  placeholder,
  emptyText,
  disabled = false,
  loading = false,
  loadingText = 'Cargando opciones...'
}: {
  value: string
  options: SearchableOption[]
  onSelect: (id: string) => void
  placeholder: string
  emptyText: string
  disabled?: boolean
  loading?: boolean
  loadingText?: string
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

  const filteredOptions = useMemo(() => filterSearchableOptions(options, query), [options, query])
  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, SEARCH_RESULTS_LIMIT),
    [filteredOptions]
  )
  const hiddenResultsCount = Math.max(filteredOptions.length - visibleOptions.length, 0)
  const hasQuery = buildSearchTokens(query).length > 0

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
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {loadingText}
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {emptyText}
            </div>
          ) : (
            <>
              {visibleOptions.map((option) => (
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
              ))}

              {(hiddenResultsCount > 0 || !hasQuery) && (
                <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {hiddenResultsCount > 0
                    ? `Mostrando ${visibleOptions.length} resultados. Escribe mas para afinar la busqueda.`
                    : 'Escribe varias letras para encontrar antes al cliente.'}
                </div>
              )}
            </>
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
  preselectedStartTime,
  initialCabin = 'LUCY',
  fromBono = null
}: AppointmentFormProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(true)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<any>(null)
  const [clientBonos, setClientBonos] = useState<ClientBonoSummary[]>([])

  const isCreatingFromBono = !appointment && Boolean(fromBono?.bonoPackId)
  const isEditingGuestAppointment = Boolean(appointment?.id) && !appointment?.clientId
  const lockClient = isCreatingFromBono && Boolean(fromBono?.lockClient)
  const lockService = isCreatingFromBono && Boolean(fromBono?.lockService)
  const canToggleGuestMode = !appointment && !isCreatingFromBono
  const [guestMode, setGuestMode] = useState(isEditingGuestAppointment)

  const [formData, setFormData] = useState({
    clientId: fromBono?.clientId || '',
    guestName: '',
    guestPhone: '',
    serviceId: fromBono?.serviceId || '',
    userId: user?.id || '',
    cabin: initialCabin,
    professional: 'LUCY',
    date: '',
    status: 'SCHEDULED',
    notes: '',
    reminder: true
  })
  const [startTimeInput, setStartTimeInput] = useState('')
  const [endTimeInput, setEndTimeInput] = useState('')

  const startTimeState = useMemo(
    () => getAppointmentTimeInputState(startTimeInput, 'start'),
    [startTimeInput]
  )

  const endTimeState = useMemo(
    () => getAppointmentTimeInputState(endTimeInput, 'end', startTimeState.normalized || undefined),
    [endTimeInput, startTimeState.normalized]
  )

  const normalizedStartTime = startTimeState.error ? '' : startTimeState.normalized
  const normalizedEndTime = endTimeState.error ? '' : endTimeState.normalized

  useEffect(() => {
    let cancelled = false

    const loadCatalogs = async () => {
      setClientsLoading(true)
      setServicesLoading(true)

      const [clientsResult, servicesResult] = await Promise.allSettled([
        loadAppointmentClients(),
        loadAppointmentServices()
      ])

      if (cancelled) {
        return
      }

      if (clientsResult.status === 'fulfilled') {
        setClients(clientsResult.value)
      } else {
        console.error('Error fetching clients:', clientsResult.reason)
      }

      if (servicesResult.status === 'fulfilled') {
        setServices(servicesResult.value)
      } else {
        console.error('Error fetching services:', servicesResult.reason)
      }

      setClientsLoading(false)
      setServicesLoading(false)
    }

    void loadCatalogs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (appointment) {
      const appointmentDate = new Date(appointment.date)
      setGuestMode(!appointment.clientId)
      setFormData({
        clientId: appointment.clientId || '',
        guestName: appointment.guestName || '',
        guestPhone: appointment.guestPhone || '',
        serviceId: appointment.serviceId || '',
        userId: appointment.userId || user?.id || '',
        cabin: appointment.cabin || initialCabin,
        professional: appointment.professional || 'LUCY',
        date: getLocalDateInputValue(appointmentDate),
        status: appointment.status || 'SCHEDULED',
        notes: appointment.notes || '',
        reminder: appointment.reminder ?? true
      })
      setStartTimeInput(appointment.startTime || '')
      setEndTimeInput(appointment.endTime || '')
      if (appointment.service) {
        setSelectedService(appointment.service)
      }
      return
    }

    if (isCreatingFromBono) {
      setGuestMode(false)
    }

    setFormData((prev) => ({
      ...prev,
      clientId: fromBono?.clientId || prev.clientId,
      guestName: isCreatingFromBono ? '' : prev.guestName,
      guestPhone: isCreatingFromBono ? '' : prev.guestPhone,
      serviceId: fromBono?.serviceId || prev.serviceId,
      userId: user?.id || prev.userId || '',
      cabin: initialCabin,
      professional: prev.professional || 'LUCY',
      date: preselectedDate ? getLocalDateInputValue(preselectedDate) : prev.date
    }))
    setStartTimeInput(preselectedStartTime || '')
    setEndTimeInput(
      preselectedStartTime
        ? minutesToTime(Math.min(timeToMinutes(preselectedStartTime) + TIME_STEP_MINUTES, BUSINESS_END_MINUTES))
        : ''
    )
  }, [appointment, preselectedDate, preselectedStartTime, user, initialCabin, fromBono, isCreatingFromBono])

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

  const showClientFinancialSummary =
    !guestMode && Boolean(formData.clientId) && (accountBalance > 0 || activeBonos.length > 0)

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
        labelTokens: buildSearchTokens(fullName),
        searchText: `${fullName} ${phone} ${email}`,
        searchTokens: buildSearchTokens(`${fullName} ${phone} ${email}`)
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
        labelTokens: buildSearchTokens(name),
        searchText: `${name} ${category} ${duration}`,
        searchTokens: buildSearchTokens(`${name} ${category} ${duration}`)
      }
    })
  }, [services])

  const calculateEndTime = (startTime: string, duration: number) => {
    return minutesToTime(timeToMinutes(startTime) + Math.max(0, Number(duration || 0)))
  }

  const getServiceEndTime = (startTime: string, duration: number) => {
    const exactEndTime = calculateEndTime(startTime, duration)
    return timeToMinutes(exactEndTime) > BUSINESS_END_MINUTES ? '' : exactEndTime
  }

  const getSuggestedEndTime = (startTime: string) => {
    if (!startTime) return ''

    if (selectedService?.duration) {
      return getServiceEndTime(startTime, selectedService.duration)
    }

    const startMinutes = timeToMinutes(startTime)
    return minutesToTime(Math.min(startMinutes + TIME_STEP_MINUTES, BUSINESS_END_MINUTES))
  }

  const handleStartTimeInputChange = (value: string) => {
    setStartTimeInput(value)

    const nextStartState = getAppointmentTimeInputState(value, 'start')
    const nextStartTime = nextStartState.error ? '' : nextStartState.normalized

    if (!nextStartTime) {
      setEndTimeInput('')
      return
    }

    const nextSuggestedEndTime = selectedService
      ? getServiceEndTime(nextStartTime, Number(selectedService.duration || 0))
      : getSuggestedEndTime(nextStartTime)

    if (selectedService || !normalizedEndTime || timeToMinutes(normalizedEndTime) <= timeToMinutes(nextStartTime)) {
      setEndTimeInput(nextSuggestedEndTime)
    }
  }

  const handleStartTimeBlur = () => {
    if (startTimeState.normalized) {
      setStartTimeInput(startTimeState.normalized)
    }
  }

  const handleEndTimeInputChange = (value: string) => {
    setEndTimeInput(value)
  }

  const handleEndTimeBlur = () => {
    if (endTimeState.normalized) {
      setEndTimeInput(endTimeState.normalized)
    }
  }

  const handleClientSelect = (clientId: string) => {
    if (lockClient) return
    setFormData((prev) => ({
      ...prev,
      clientId,
      guestName: '',
      guestPhone: ''
    }))
  }

  const handleGuestModeToggle = () => {
    if (!canToggleGuestMode) return
    setGuestMode(true)
    setFormData((prev) => ({
      ...prev,
      clientId: ''
    }))
  }

  const handleRegisteredModeToggle = () => {
    if (!canToggleGuestMode) return
    setGuestMode(false)
    setFormData((prev) => ({
      ...prev,
      guestName: '',
      guestPhone: ''
    }))
  }

  const handleServiceSelect = (serviceId: string) => {
    if (lockService) return
    const service = services.find((item) => item.id === serviceId) || null
    setSelectedService(service)

    setFormData((prev) => ({
      ...prev,
      serviceId
    }))

    if (service && normalizedStartTime) {
      setEndTimeInput(getServiceEndTime(normalizedStartTime, Number(service.duration || 0)))
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const showCalendarSyncWarning = (savedAppointment: any, successMessage: string) => {
    const syncError = String(savedAppointment?.googleCalendarSyncError || '').trim()
    if (savedAppointment?.googleCalendarSyncStatus !== 'ERROR' || !syncError) {
      toast.success(successMessage)
      return
    }

    toast.success(successMessage)
    toast(`${successMessage}, pero Google Calendar no se pudo sincronizar. ${syncError}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    let requestPayload: Record<string, unknown> | null = null

    try {
      if (!guestMode && !formData.clientId) {
        toast.error('Debe seleccionar un cliente')
        setLoading(false)
        return
      }

      if (guestMode && !formData.guestName.trim()) {
        toast.error('Debe indicar el nombre del cliente puntual')
        setLoading(false)
        return
      }

      if (guestMode && !formData.guestPhone.trim()) {
        toast.error('Debe indicar el telefono del cliente puntual')
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

      if (startTimeState.error || endTimeState.error) {
        toast.error(startTimeState.error || endTimeState.error || 'Debe indicar un horario valido')
        setLoading(false)
        return
      }

      if (!normalizedStartTime || !normalizedEndTime) {
        toast.error('Debe indicar horario de inicio y fin')
        setLoading(false)
        return
      }

      // Validate start < end
      if (normalizedStartTime >= normalizedEndTime) {
        toast.error('La hora de inicio debe ser anterior a la hora de fin')
        setLoading(false)
        return
      }

      const startMinutes = timeToMinutes(normalizedStartTime)
      const endMinutes = timeToMinutes(normalizedEndTime)
      if (startMinutes < BUSINESS_START_MINUTES || startMinutes >= BUSINESS_END_MINUTES || endMinutes > BUSINESS_END_MINUTES) {
        toast.error('El horario debe estar entre 08:00 y 22:00')
        setLoading(false)
        return
      }

      // Validate not in the past
      const todayStr = getLocalDateInputValue(new Date())
      if (formData.date < todayStr) {
        toast.error('No se puede crear una cita en el pasado')
        setLoading(false)
        return
      }
      if (formData.date === todayStr) {
        const now = new Date()
        const nowMinutes = now.getHours() * 60 + now.getMinutes()
        if (startMinutes < nowMinutes) {
          toast.error('No se puede crear una cita en el pasado')
          setLoading(false)
          return
        }
      }

      const normalizedGuestName = formData.guestName.trim()
      const normalizedGuestPhone = formData.guestPhone.trim()
      const dataToSend: Record<string, unknown> = {
        clientId: guestMode ? null : formData.clientId,
        guestName: guestMode ? normalizedGuestName : null,
        guestPhone: guestMode ? normalizedGuestPhone : null,
        serviceId: formData.serviceId,
        userId: formData.userId || user?.id,
        cabin: formData.cabin,
        professional: formData.professional,
        date: new Date(formData.date).toISOString(),
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        status: formData.status,
        notes: formData.notes.trim() || null,
        reminder: formData.reminder
      }
      requestPayload = dataToSend

      if (appointment) {
        const response = await api.put(`/appointments/${appointment.id}`, dataToSend)
        showCalendarSyncWarning(response.data, 'Cita actualizada exitosamente')
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
        const response = await api.post(`/bonos/${fromBono.bonoPackId}/appointments`, bonoPayload)
        showCalendarSyncWarning(response.data, 'Cita creada y sesion reservada')
      } else {
        const response = await api.post('/appointments', dataToSend)
        showCalendarSyncWarning(response.data, 'Cita creada exitosamente')
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
            <div className="flex items-center justify-between gap-3">
              <label className="label">
                Cliente <span className="text-red-500">*</span>
              </label>
              {canToggleGuestMode && !guestMode && (
                <button
                  type="button"
                  onClick={handleGuestModeToggle}
                  className="text-xs font-medium text-gray-500 transition hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-300"
                >
                  Cliente puntual
                </button>
              )}
              {canToggleGuestMode && guestMode && (
                <button
                  type="button"
                  onClick={handleRegisteredModeToggle}
                  className="text-xs font-medium text-gray-500 transition hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-300"
                >
                  Usar cliente registrado
                </button>
              )}
            </div>

            {guestMode ? (
              <div className="space-y-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Cita para cliente puntual. No se creará ficha en el registro.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Nombre</label>
                    <input
                      type="text"
                      name="guestName"
                      value={formData.guestName}
                      onChange={handleChange}
                      className="input"
                      placeholder="Nombre del cliente puntual"
                    />
                  </div>
                  <div>
                    <label className="label">Telefono</label>
                    <input
                      type="text"
                      name="guestPhone"
                      value={formData.guestPhone}
                      onChange={handleChange}
                      className="input"
                      placeholder="Telefono de contacto"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <SearchableSelect
                  value={formData.clientId}
                  options={clientOptions}
                  onSelect={handleClientSelect}
                  placeholder="Buscar cliente por nombre, telefono o email..."
                  emptyText="No se encontraron clientes"
                  loading={clientsLoading}
                  loadingText="Cargando clientes..."
                  disabled={lockClient}
                />
                {lockClient && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Cliente fijado por el bono seleccionado.
                  </p>
                )}
              </>
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
              loading={servicesLoading}
              loadingText="Cargando servicios..."
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
              min={getLocalDateInputValue(new Date())}
              required
            />
          </div>

          <div>
            <label className="label">
              Hora Inicio <span className="text-red-500">*</span>
            </label>
            <TimeInput
              value={startTimeInput}
              onChange={handleStartTimeInputChange}
              onBlur={handleStartTimeBlur}
              placeholder="08:00"
            />
            {startTimeState.error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {startTimeState.error}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              Hora Fin <span className="text-red-500">*</span>
            </label>
            <TimeInput
              value={endTimeInput}
              onChange={handleEndTimeInputChange}
              onBlur={handleEndTimeBlur}
              placeholder="08:15"
            />
            {endTimeState.error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {endTimeState.error}
              </p>
            )}
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
        {normalizedStartTime && (() => {
          const mins = timeToMinutes(normalizedStartTime)
          if (mins >= BUSINESS_BREAK_START_MINUTES && mins < BUSINESS_BREAK_END_MINUTES) {
            return (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                Aviso: Esta hora esta fuera del horario habitual (descanso 14:00-16:00)
              </p>
            )
          }
          return null
        })()}
        {selectedService?.duration && normalizedStartTime && !normalizedEndTime && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            La duracion del servicio supera el horario de cierre. Elige una hora de inicio anterior.
          </p>
        )}
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
