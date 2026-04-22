import { useState, useEffect, useMemo } from 'react'
import { Clock, X } from 'lucide-react'
import api from '../utils/api'
import {
  loadAppointmentClients,
  loadAppointmentProfessionals,
  loadAppointmentServices,
  type AppointmentServiceCatalogItem
} from '../utils/appointmentCatalogs'
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
import { getRemainingBonoSessions } from '../utils/appointmentBonos'

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
  preselectedEndTime?: string
  preselectedClientId?: string | null
  lockClientSelection?: boolean
  initialCabin?: CabinValue
  fromBono?: BonoAppointmentContext | null
}

type CabinValue = 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'

type AppointmentCopyDraft = {
  date: string
  cabin: CabinValue
  professional: string
}

type AppointmentCopyItem = AppointmentCopyDraft & {
  id: string
  startTime: string
}

type AppointmentAvailabilityItem = {
  id: string
  startTime: string
  endTime: string
  professional?: string | null
  cabin?: string | null
  status?: string | null
}

type PlannedAppointmentSlot = {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
  professional: string
  cabin: CabinValue
  excludeAppointmentId?: string
}

type ClientBonoSummary = {
  id: string
  name: string
  totalSessions: number
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  sessions: Array<{ status: 'AVAILABLE' | 'CONSUMED' }>
}

const SEARCH_RESULTS_LIMIT = 50
const ACTIVE_APPOINTMENT_STATUSES = new Set(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'])
const CABIN_LABELS: Record<CabinValue, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

const createEmptyAppointmentCopyDraft = (
  cabin: CabinValue,
  professional = ''
): AppointmentCopyDraft => ({
  date: '',
  cabin,
  professional
})

const getInitialAppointmentServiceIds = (appointment: any) => {
  if (!appointment) {
    return []
  }

  const linkedServiceIds = Array.isArray(appointment.appointmentServices)
    ? [...appointment.appointmentServices]
        .sort((left, right) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
        .map((item) => String(item?.serviceId || item?.service?.id || '').trim())
        .filter(Boolean)
    : []

  if (linkedServiceIds.length > 0) {
    return linkedServiceIds
  }

  const fallbackServiceId = String(appointment.serviceId || '').trim()
  return fallbackServiceId ? [fallbackServiceId] : []
}

const getLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear()
  const month = padTime(value.getMonth() + 1)
  const day = padTime(value.getDate())
  return `${year}-${month}-${day}`
}

const normalizeSlotMatchValue = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleUpperCase('es-ES')

const timeRangesOverlap = (leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) =>
  leftStart < rightEnd && leftEnd > rightStart

const getDayRangeParams = (date: string) => ({
  startDate: `${date}T00:00:00.000Z`,
  endDate: `${date}T23:59:59.999Z`
})

const scheduleFieldGridClassName =
  'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(10.75rem,1fr))]'

const scheduleDateInputClassName = 'input min-w-0 pr-12 text-[15px] tabular-nums'

function TimeInput({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly = false,
  disabled = false
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  placeholder: string
  readOnly?: boolean
  disabled?: boolean
}) {
  const listId = placeholder === '08:00' ? 'appointment-start-time-options' : 'appointment-end-time-options'
  const options = useMemo(() => {
    return listId === 'appointment-start-time-options'
      ? buildTimeOptions(BUSINESS_START_MINUTES, BUSINESS_END_MINUTES - TIME_STEP_MINUTES)
      : buildTimeOptions(BUSINESS_START_MINUTES + TIME_STEP_MINUTES, BUSINESS_END_MINUTES)
  }, [listId])

  return (
    <div className="relative min-w-0">
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="input min-w-0 pl-10 pr-4 text-[15px] tabular-nums disabled:cursor-not-allowed disabled:opacity-70 read-only:bg-gray-50 read-only:text-gray-600 dark:read-only:bg-gray-800/60 dark:read-only:text-gray-300"
        placeholder={placeholder}
        list={listId}
        inputMode="numeric"
        autoComplete="off"
        readOnly={readOnly}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}

function SearchableMultiSelect({
  selectedIds,
  options,
  onAdd,
  onRemove,
  placeholder,
  emptyText,
  disabled = false,
  loading = false,
  loadingText = 'Cargando opciones...'
}: {
  selectedIds: string[]
  options: SearchableOption[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  placeholder: string
  emptyText: string
  disabled?: boolean
  loading?: boolean
  loadingText?: string
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selectedOptions = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((option) => option.id === id) || null)
        .filter((option): option is SearchableOption => Boolean(option)),
    [options, selectedIds]
  )

  const availableOptions = useMemo(
    () => options.filter((option) => !selectedIds.includes(option.id)),
    [options, selectedIds]
  )

  const filteredOptions = useMemo(
    () => filterSearchableOptions(availableOptions, query),
    [availableOptions, query]
  )

  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, SEARCH_RESULTS_LIMIT),
    [filteredOptions]
  )

  const hiddenResultsCount = Math.max(filteredOptions.length - visibleOptions.length, 0)
  const hasQuery = buildSearchTokens(query).length > 0

  const handleSelect = (option: SearchableOption) => {
    onAdd(option.id)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div className="space-y-3">
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
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
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
                    onMouseDown={(event) => {
                      event.preventDefault()
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
                      : 'Puedes anadir varios servicios a la misma cita.'}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm text-primary-800 dark:border-primary-900/50 dark:bg-primary-900/30 dark:text-primary-100"
            >
              <span className="truncate max-w-[18rem]">{option.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(option.id)}
                  className="rounded-full p-0.5 transition hover:bg-primary-100 dark:hover:bg-primary-800/60"
                  aria-label={`Quitar ${option.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
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

const cabinOptions = (Object.entries(CABIN_LABELS) as Array<[CabinValue, string]>).map(
  ([value, label]) => ({
    value,
    label
  })
)

export default function AppointmentForm({
  appointment,
  onSuccess,
  onCancel,
  preselectedDate,
  preselectedStartTime,
  preselectedEndTime,
  preselectedClientId = null,
  lockClientSelection = false,
  initialCabin = 'LUCY',
  fromBono = null
}: AppointmentFormProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(true)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [professionalsLoading, setProfessionalsLoading] = useState(true)
  const [professionalTouched, setProfessionalTouched] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [professionals, setProfessionals] = useState<string[]>([])
  const [clientBonos, setClientBonos] = useState<ClientBonoSummary[]>([])

  const isCreatingFromBono = !appointment && Boolean(fromBono?.bonoPackId)
  const canCreateCopies = !appointment && !isCreatingFromBono
  const isEditingGuestAppointment = Boolean(appointment?.id) && !appointment?.clientId
  const lockClient =
    (isCreatingFromBono && Boolean(fromBono?.lockClient)) ||
    (!appointment && Boolean(lockClientSelection && preselectedClientId))
  const lockService = isCreatingFromBono && Boolean(fromBono?.lockService)
  const canToggleGuestMode = !appointment && !isCreatingFromBono && !lockClient
  const [guestMode, setGuestMode] = useState(isEditingGuestAppointment)
  const [copyAppointmentEnabled, setCopyAppointmentEnabled] = useState(false)
  const [appointmentCopies, setAppointmentCopies] = useState<AppointmentCopyItem[]>([])
  const [copyDraft, setCopyDraft] = useState<AppointmentCopyDraft>(
    createEmptyAppointmentCopyDraft(initialCabin)
  )

  const [formData, setFormData] = useState({
    clientId: fromBono?.clientId || preselectedClientId || '',
    guestName: '',
    guestPhone: '',
    serviceIds: fromBono?.serviceId ? [fromBono.serviceId] : [],
    userId: user?.id || '',
    cabin: initialCabin,
    professional: '',
    date: '',
    status: 'SCHEDULED',
    notes: '',
    reminder: true
  })
  const [startTimeInput, setStartTimeInput] = useState('')
  const [endTimeInput, setEndTimeInput] = useState('')
  const [copyStartTimeInput, setCopyStartTimeInput] = useState('')

  const startTimeState = useMemo(
    () => getAppointmentTimeInputState(startTimeInput, 'start'),
    [startTimeInput]
  )

  const endTimeState = useMemo(
    () => getAppointmentTimeInputState(endTimeInput, 'end', startTimeState.normalized || undefined),
    [endTimeInput, startTimeState.normalized]
  )

  const copyStartTimeState = useMemo(
    () => getAppointmentTimeInputState(copyStartTimeInput, 'start'),
    [copyStartTimeInput]
  )

  const normalizedStartTime = startTimeState.error ? '' : startTimeState.normalized
  const normalizedEndTime = endTimeState.error ? '' : endTimeState.normalized
  const normalizedCopyStartTime = copyStartTimeState.error ? '' : copyStartTimeState.normalized

  useEffect(() => {
    let cancelled = false

    const loadCatalogs = async () => {
      setClientsLoading(true)
      setServicesLoading(true)
      setProfessionalsLoading(true)

      const [clientsResult, servicesResult, professionalsResult] = await Promise.allSettled([
        loadAppointmentClients(),
        loadAppointmentServices(),
        loadAppointmentProfessionals()
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

      if (professionalsResult.status === 'fulfilled') {
        setProfessionals(professionalsResult.value)
      } else {
        console.error('Error fetching professionals:', professionalsResult.reason)
      }

      setClientsLoading(false)
      setServicesLoading(false)
      setProfessionalsLoading(false)
    }

    void loadCatalogs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (appointment) {
      setCopyAppointmentEnabled(false)
      setAppointmentCopies([])
      setCopyDraft(createEmptyAppointmentCopyDraft(initialCabin))
      setCopyStartTimeInput('')
      setProfessionalTouched(false)
      const appointmentDate = new Date(appointment.date)
      setGuestMode(!appointment.clientId)
      setFormData({
        clientId: appointment.clientId || '',
        guestName: appointment.guestName || '',
        guestPhone: appointment.guestPhone || '',
        serviceIds: getInitialAppointmentServiceIds(appointment),
        userId: appointment.userId || user?.id || '',
        cabin: appointment.cabin || initialCabin,
        professional: appointment.professional || '',
        date: getLocalDateInputValue(appointmentDate),
        status: appointment.status || 'SCHEDULED',
        notes: appointment.notes || '',
        reminder: appointment.reminder ?? true
      })
      setStartTimeInput(appointment.startTime || '')
      setEndTimeInput(appointment.endTime || '')
      return
    }

    if (isCreatingFromBono) {
      setGuestMode(false)
    }

    setCopyAppointmentEnabled(false)
    setAppointmentCopies([])
    setCopyDraft(createEmptyAppointmentCopyDraft(initialCabin))
    setCopyStartTimeInput('')
    setProfessionalTouched(false)
    setFormData((prev) => ({
      ...prev,
      clientId: fromBono?.clientId || preselectedClientId || prev.clientId,
      guestName: isCreatingFromBono ? '' : prev.guestName,
      guestPhone: isCreatingFromBono ? '' : prev.guestPhone,
      serviceIds: fromBono?.serviceId ? [fromBono.serviceId] : prev.serviceIds,
      userId: user?.id || prev.userId || '',
      cabin: initialCabin,
      professional: prev.professional || '',
      date: preselectedDate ? getLocalDateInputValue(preselectedDate) : prev.date
    }))
    setStartTimeInput(preselectedStartTime || '')
    setEndTimeInput(
      preselectedEndTime ||
        (preselectedStartTime
          ? minutesToTime(
              Math.min(timeToMinutes(preselectedStartTime) + TIME_STEP_MINUTES, BUSINESS_END_MINUTES)
            )
          : '')
    )
  }, [
    appointment,
    preselectedDate,
    preselectedStartTime,
    preselectedEndTime,
    user,
    initialCabin,
    fromBono,
    isCreatingFromBono,
    preselectedClientId
  ])

  useEffect(() => {
    if (appointment || professionalTouched || formData.professional.trim()) {
      return
    }

    const fallbackProfessional = professionals[0] || ''
    if (!fallbackProfessional) {
      return
    }

    setFormData((prev) => {
      if (prev.professional.trim()) {
        return prev
      }

      return {
        ...prev,
        professional: fallbackProfessional
      }
    })
  }, [appointment, formData.professional, professionalTouched, professionals])

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

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === formData.clientId) || null,
    [clients, formData.clientId]
  )

  const selectedServices = useMemo<AppointmentServiceCatalogItem[]>(
    () =>
      formData.serviceIds
        .map((serviceId) => services.find((service) => service.id === serviceId) || null)
        .filter((service): service is AppointmentServiceCatalogItem => Boolean(service)),
    [formData.serviceIds, services]
  )

  const totalSelectedServiceDuration = useMemo(
    () =>
      selectedServices.reduce(
        (total, service) => total + Math.max(0, Number(service.duration || 0)),
        0
      ),
    [selectedServices]
  )

  useEffect(() => {
    if (formData.serviceIds.length > 0 && selectedServices.length === 0 && servicesLoading) {
      return
    }

    if (!normalizedStartTime) {
      setEndTimeInput('')
      return
    }

    setEndTimeInput(getSuggestedEndTime(normalizedStartTime))
  }, [formData.serviceIds.length, normalizedStartTime, selectedServices.length, servicesLoading, totalSelectedServiceDuration])

  const accountBalance = Number(selectedClient?.accountBalance || 0)

  const activeBonos = useMemo(() => {
    return clientBonos
      .map((bonoPack) => ({
        ...bonoPack,
        remainingSessions: getRemainingBonoSessions(bonoPack)
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

  const professionalOptions = useMemo(() => {
    const baseProfessionals = professionals.filter((item) => item.trim().length > 0)
    const mergedProfessionals = formData.professional.trim()
      ? [...baseProfessionals, formData.professional.trim()]
      : baseProfessionals

    return [...new Set(mergedProfessionals)].map((professional) => ({
      value: professional,
      label: professional
    }))
  }, [formData.professional, professionals])

  const calculateEndTime = (startTime: string, duration: number) => {
    return minutesToTime(timeToMinutes(startTime) + Math.max(0, Number(duration || 0)))
  }

  const getServiceEndTime = (startTime: string, duration: number) => {
    const exactEndTime = calculateEndTime(startTime, duration)
    return timeToMinutes(exactEndTime) > BUSINESS_END_MINUTES ? '' : exactEndTime
  }

  const getSuggestedEndTime = (startTime: string) => {
    if (!startTime) return ''

    if (totalSelectedServiceDuration > 0) {
      return getServiceEndTime(startTime, totalSelectedServiceDuration)
    }

    return ''
  }

  const computedCopyEndTime = useMemo(
    () => (normalizedCopyStartTime ? getSuggestedEndTime(normalizedCopyStartTime) : ''),
    [normalizedCopyStartTime, totalSelectedServiceDuration]
  )

  const handleStartTimeInputChange = (value: string) => {
    setStartTimeInput(value)

    const nextStartState = getAppointmentTimeInputState(value, 'start')
    const nextStartTime = nextStartState.error ? '' : nextStartState.normalized

    if (!nextStartTime) {
      setEndTimeInput('')
      return
    }

    setEndTimeInput(getSuggestedEndTime(nextStartTime))
  }

  const handleStartTimeBlur = () => {
    if (startTimeState.normalized) {
      setStartTimeInput(startTimeState.normalized)
    }
  }

  const handleEndTimeBlur = () => {
    if (endTimeState.normalized) {
      setEndTimeInput(endTimeState.normalized)
    }
  }

  const handleCopyStartTimeInputChange = (value: string) => {
    setCopyStartTimeInput(value)
  }

  const handleCopyStartTimeBlur = () => {
    if (copyStartTimeState.normalized) {
      setCopyStartTimeInput(copyStartTimeState.normalized)
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

  const handleServiceAdd = (serviceId: string) => {
    if (lockService) return
    setFormData((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId) ? prev.serviceIds : [...prev.serviceIds, serviceId]
    }))
  }

  const handleServiceRemove = (serviceId: string) => {
    if (lockService) return
    setFormData((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.filter((currentId) => currentId !== serviceId)
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (name === 'professional') {
      setProfessionalTouched(true)
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleCopyDraftChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setCopyDraft((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  const validateAppointmentSlotInput = ({
    date,
    startTime,
    endTime,
    startError,
    endError
  }: {
    date: string
    startTime: string
    endTime: string
    startError?: string | null
    endError?: string | null
  }) => {
    if (!date) {
      return 'Debe seleccionar una fecha'
    }

    if (startError || endError) {
      return startError || endError || 'Debe indicar un horario valido'
    }

    if (!startTime || !endTime) {
      return 'Debe indicar horario de inicio y fin'
    }

    if (startTime >= endTime) {
      return 'La hora de inicio debe ser anterior a la hora de fin'
    }

    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)
    if (
      startMinutes < BUSINESS_START_MINUTES ||
      startMinutes >= BUSINESS_END_MINUTES ||
      endMinutes > BUSINESS_END_MINUTES
    ) {
      return 'El horario debe estar entre 08:00 y 22:00'
    }

    const todayStr = getLocalDateInputValue(new Date())
    if (date < todayStr) {
      return 'No se puede crear una cita en el pasado'
    }

    if (date === todayStr) {
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      if (startMinutes < nowMinutes) {
        return 'No se puede crear una cita en el pasado'
      }
    }

    return null
  }

  const validatePlannedAppointmentAvailability = async (slots: PlannedAppointmentSlot[]) => {
    if (slots.length === 0) {
      return null
    }

    const uniqueDates = [...new Set(slots.map((slot) => slot.date).filter(Boolean))]
    const availabilityEntries = await Promise.all(
      uniqueDates.map(async (date) => {
        const [appointmentsResponse, agendaBlocksResponse] = await Promise.all([
          api.get(`/appointments/date/${date}`),
          api.get('/appointments/blocks', { params: getDayRangeParams(date) })
        ])

        return {
          date,
          appointments: Array.isArray(appointmentsResponse.data)
            ? (appointmentsResponse.data as AppointmentAvailabilityItem[])
            : [],
          agendaBlocks: Array.isArray(agendaBlocksResponse.data)
            ? (agendaBlocksResponse.data as AppointmentAvailabilityItem[])
            : []
        }
      })
    )

    const appointmentsByDate = new Map(
      availabilityEntries.map((entry) => [entry.date, entry.appointments])
    )
    const agendaBlocksByDate = new Map(
      availabilityEntries.map((entry) => [entry.date, entry.agendaBlocks])
    )

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      const previousSlots = slots.slice(0, index)

      const plannedProfessionalConflict = previousSlots.find(
        (plannedSlot) =>
          plannedSlot.date === slot.date &&
          timeRangesOverlap(
            plannedSlot.startTime,
            plannedSlot.endTime,
            slot.startTime,
            slot.endTime
          ) &&
          normalizeSlotMatchValue(plannedSlot.professional) ===
            normalizeSlotMatchValue(slot.professional)
      )

      if (plannedProfessionalConflict) {
        return `${slot.label}: ${slot.professional} ya queda ocupada por ${plannedProfessionalConflict.label} (${plannedProfessionalConflict.startTime}-${plannedProfessionalConflict.endTime}).`
      }

      const plannedCabinConflict = previousSlots.find(
        (plannedSlot) =>
          plannedSlot.date === slot.date &&
          timeRangesOverlap(
            plannedSlot.startTime,
            plannedSlot.endTime,
            slot.startTime,
            slot.endTime
          ) &&
          plannedSlot.cabin === slot.cabin
      )

      if (plannedCabinConflict) {
        return `${slot.label}: la cabina ${CABIN_LABELS[slot.cabin]} coincide con ${plannedCabinConflict.label} (${plannedCabinConflict.startTime}-${plannedCabinConflict.endTime}).`
      }

      const matchingAppointment = (appointmentsByDate.get(slot.date) || []).find(
        (existingSlot) =>
          existingSlot.id !== slot.excludeAppointmentId &&
          ACTIVE_APPOINTMENT_STATUSES.has(String(existingSlot.status || '').toUpperCase()) &&
          timeRangesOverlap(
            String(existingSlot.startTime || ''),
            String(existingSlot.endTime || ''),
            slot.startTime,
            slot.endTime
          ) &&
          normalizeSlotMatchValue(existingSlot.professional) ===
            normalizeSlotMatchValue(slot.professional)
      )

      if (matchingAppointment) {
        return `${slot.label}: ${slot.professional} ya tiene una cita de ${matchingAppointment.startTime} a ${matchingAppointment.endTime}.`
      }

      const matchingCabinAppointment = (appointmentsByDate.get(slot.date) || []).find(
        (existingSlot) =>
          existingSlot.id !== slot.excludeAppointmentId &&
          ACTIVE_APPOINTMENT_STATUSES.has(String(existingSlot.status || '').toUpperCase()) &&
          timeRangesOverlap(
            String(existingSlot.startTime || ''),
            String(existingSlot.endTime || ''),
            slot.startTime,
            slot.endTime
          ) &&
          String(existingSlot.cabin || '') === slot.cabin
      )

      if (matchingCabinAppointment) {
        return `${slot.label}: la cabina ${CABIN_LABELS[slot.cabin]} ya está ocupada de ${matchingCabinAppointment.startTime} a ${matchingCabinAppointment.endTime}.`
      }

      const matchingProfessionalBlock = (agendaBlocksByDate.get(slot.date) || []).find(
        (existingSlot) =>
          timeRangesOverlap(
            String(existingSlot.startTime || ''),
            String(existingSlot.endTime || ''),
            slot.startTime,
            slot.endTime
          ) &&
          normalizeSlotMatchValue(existingSlot.professional) ===
            normalizeSlotMatchValue(slot.professional)
      )

      if (matchingProfessionalBlock) {
        return `${slot.label}: ${slot.professional} tiene un bloqueo de ${matchingProfessionalBlock.startTime} a ${matchingProfessionalBlock.endTime}.`
      }

      const matchingCabinBlock = (agendaBlocksByDate.get(slot.date) || []).find(
        (existingSlot) =>
          timeRangesOverlap(
            String(existingSlot.startTime || ''),
            String(existingSlot.endTime || ''),
            slot.startTime,
            slot.endTime
          ) &&
          String(existingSlot.cabin || '') === slot.cabin
      )

      if (matchingCabinBlock) {
        return `${slot.label}: la cabina ${CABIN_LABELS[slot.cabin]} tiene un bloqueo de ${matchingCabinBlock.startTime} a ${matchingCabinBlock.endTime}.`
      }
    }

    return null
  }

  const handleCopyAppointmentToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = event.target

    if (!checked && appointmentCopies.length > 0) {
      const shouldDiscard = window.confirm(
        'Se eliminarán las copias añadidas. ¿Quieres continuar?'
      )

      if (!shouldDiscard) {
        return
      }
    }

    setCopyAppointmentEnabled(checked)

    if (checked) {
      setCopyDraft((prev) => ({
        date: prev.date,
        cabin: prev.cabin || (formData.cabin as CabinValue),
        professional: prev.professional || formData.professional || professionals[0] || ''
      }))
      return
    }

    setAppointmentCopies([])
    setCopyDraft(
      createEmptyAppointmentCopyDraft(
        formData.cabin as CabinValue,
        formData.professional || professionals[0] || ''
      )
    )
    setCopyStartTimeInput('')
  }

  const handleAddAppointmentCopy = () => {
    if (!canCreateCopies) {
      return
    }

    if (!copyDraft.professional.trim()) {
      toast.error('Debes indicar un profesional para la copia')
      return
    }

    const copyValidationError = validateAppointmentSlotInput({
      date: copyDraft.date,
      startTime: normalizedCopyStartTime,
      endTime: computedCopyEndTime,
      startError: copyStartTimeState.error
    })

    if (copyValidationError) {
      toast.error(copyValidationError)
      return
    }

    setAppointmentCopies((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length + 1}`,
        date: copyDraft.date,
        startTime: normalizedCopyStartTime,
        cabin: copyDraft.cabin,
        professional: copyDraft.professional.trim()
      }
    ])

    setCopyDraft((prev) => ({
      ...prev,
      date: ''
    }))
    setCopyStartTimeInput(normalizedCopyStartTime)

    const wantsAnotherCopy = window.confirm('Copia añadida. ¿Quieres crear otra copia?')
    if (!wantsAnotherCopy) {
      toast.success('Las copias se guardarán junto con la cita al crearla')
    }
  }

  const handleRemoveAppointmentCopy = (copyId: string) => {
    setAppointmentCopies((prev) => prev.filter((copy) => copy.id !== copyId))
  }

  const getCalendarSyncWarningMessage = (savedAppointment: any, label: string) => {
    const syncError = String(savedAppointment?.googleCalendarSyncError || '').trim()
    if (savedAppointment?.googleCalendarSyncStatus !== 'ERROR' || !syncError) {
      return null
    }

    return `${label}: Google Calendar no se pudo sincronizar. ${syncError}`
  }

  const showCalendarSyncWarning = (savedAppointment: any, successMessage: string) => {
    const warningMessage = getCalendarSyncWarningMessage(savedAppointment, successMessage)
    if (!warningMessage) {
      toast.success(successMessage)
      return
    }

    toast.success(successMessage)
    toast(warningMessage)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    let requestPayload: Record<string, unknown> | null = null
    let copySlots: Array<AppointmentCopyItem & { endTime: string }> = []

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

      if (formData.serviceIds.length === 0) {
        toast.error('Debe seleccionar al menos un servicio')
        setLoading(false)
        return
      }

      if (totalSelectedServiceDuration <= 0) {
        toast.error('Los servicios seleccionados no tienen una duracion valida')
        setLoading(false)
        return
      }

      if (!formData.date) {
        toast.error('Debe seleccionar una fecha')
        setLoading(false)
        return
      }

      if (!formData.professional.trim()) {
        toast.error('Debe indicar un profesional')
        setLoading(false)
        return
      }

      const mainSlotValidationError = validateAppointmentSlotInput({
        date: formData.date,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        startError: startTimeState.error,
        endError: endTimeState.error
      })

      if (mainSlotValidationError) {
        toast.error(mainSlotValidationError)
        setLoading(false)
        return
      }

      if (
        copyAppointmentEnabled &&
        copyDraft.date.trim().length > 0
      ) {
        toast.error('Añade la copia pendiente antes de guardar la cita')
        setLoading(false)
        return
      }

      copySlots = appointmentCopies.map((copy, index) => {
        const copyEndTime = getSuggestedEndTime(copy.startTime)
        const copyValidationError = validateAppointmentSlotInput({
          date: copy.date,
          startTime: copy.startTime,
          endTime: copyEndTime
        })

        if (copyValidationError) {
          throw new Error(`La copia ${index + 1} no es válida. ${copyValidationError}`)
        }

        if (!copy.professional.trim()) {
          throw new Error(`La copia ${index + 1} necesita un profesional`)
        }

        return {
          ...copy,
          endTime: copyEndTime
        }
      })

      const normalizedGuestName = formData.guestName.trim()
      const normalizedGuestPhone = formData.guestPhone.trim()
      const buildAppointmentRequest = ({
        date,
        startTime,
        endTime,
        cabin,
        professional
      }: {
        date: string
        startTime: string
        endTime: string
        cabin: CabinValue
        professional: string
      }) => ({
        clientId: guestMode ? null : formData.clientId,
        guestName: guestMode ? normalizedGuestName : null,
        guestPhone: guestMode ? normalizedGuestPhone : null,
        serviceId: formData.serviceIds[0],
        serviceIds: formData.serviceIds,
        userId: formData.userId || user?.id,
        cabin,
        professional: professional.trim(),
        date: new Date(date).toISOString(),
        startTime,
        endTime,
        status: formData.status,
        notes: formData.notes.trim() || null,
        reminder: formData.reminder
      })

      const dataToSend = buildAppointmentRequest({
        date: formData.date,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        cabin: formData.cabin as CabinValue,
        professional: formData.professional
      })
      requestPayload = dataToSend

      const slotAvailabilityError = await validatePlannedAppointmentAvailability([
        {
          id: appointment?.id || 'main',
          label: 'Cita principal',
          date: formData.date,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          professional: formData.professional.trim(),
          cabin: formData.cabin as CabinValue,
          excludeAppointmentId: appointment?.id || undefined
        },
        ...copySlots.map((copy, index) => ({
          id: copy.id,
          label: `Copia ${index + 1}`,
          date: copy.date,
          startTime: copy.startTime,
          endTime: copy.endTime,
          professional: copy.professional.trim(),
          cabin: copy.cabin
        }))
      ])

      if (slotAvailabilityError) {
        toast.error(slotAvailabilityError)
        return
      }

      if (appointment) {
        const response = await api.put(`/appointments/${appointment.id}`, dataToSend)
        showCalendarSyncWarning(response.data, 'Cita actualizada exitosamente')
      } else if (isCreatingFromBono && fromBono?.bonoPackId) {
        const bonoPayload = {
          userId: dataToSend.userId,
          serviceId: dataToSend.serviceId,
          serviceIds: dataToSend.serviceIds,
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
        const createdAppointments: any[] = []
        const mainResponse = await api.post('/appointments', dataToSend)
        createdAppointments.push(mainResponse.data)

        for (let index = 0; index < copySlots.length; index += 1) {
          try {
            const copyResponse = await api.post(
              '/appointments',
              buildAppointmentRequest(copySlots[index])
            )
            createdAppointments.push(copyResponse.data)
          } catch (error: any) {
            const createdCopies = Math.max(createdAppointments.length - 1, 0)
            const partialResultMessage =
              createdCopies > 0
                ? `La cita principal y ${createdCopies} ${createdCopies === 1 ? 'copia se ha creado' : 'copias se han creado'}, pero la copia ${index + 1} no se pudo guardar`
                : 'La cita principal se ha creado, pero no se pudo guardar una de las copias'
            toast.error(
              `${partialResultMessage}. ${error.response?.data?.error || 'Error al guardar la copia'}`
            )
            onSuccess()
            return
          }
        }

        if (copySlots.length > 0) {
          toast.success(
            copySlots.length === 1
              ? 'Cita y 1 copia creadas exitosamente'
              : `Cita y ${copySlots.length} copias creadas exitosamente`
          )

          const syncWarnings = createdAppointments
            .map((savedAppointment, index) =>
              getCalendarSyncWarningMessage(
                savedAppointment,
                index === 0 ? 'Cita principal' : `Copia ${index}`
              )
            )
            .filter((message): message is string => Boolean(message))

          if (syncWarnings.length > 0) {
            toast(syncWarnings.join(' '))
          }
        } else {
          showCalendarSyncWarning(mainResponse.data, 'Cita creada exitosamente')
        }
      }

      onSuccess()
    } catch (error: any) {
      if (error instanceof Error && !(error as any).response) {
        toast.error(error.message)
        return
      }

      console.error('Error saving appointment:', {
        error,
        appointmentId: appointment?.id || null,
        fromBonoPackId: fromBono?.bonoPackId || null,
        requestPayload
      })
      const backendErrorMessage = error.response?.data?.error || 'Error al guardar la cita'
      if (!appointment && copySlots.length > 0 && error.response?.status === 409) {
        toast.error(`No se pudo crear la cita principal. ${backendErrorMessage}`)
        return
      }

      toast.error(backendErrorMessage)
    } finally {
      setLoading(false)
    }
  }

  const formatCopyDateLabel = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }

    return parsed.toLocaleDateString('es-ES')
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
                    {isCreatingFromBono
                      ? 'Cliente fijado por el bono seleccionado.'
                      : 'Cliente fijado por el filtro activo de agenda.'}
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="label">
              Servicios <span className="text-red-500">*</span>
            </label>
            <SearchableMultiSelect
              selectedIds={formData.serviceIds}
              options={serviceOptions}
              onAdd={handleServiceAdd}
              onRemove={handleServiceRemove}
              placeholder="Buscar y anadir servicios por nombre o categoria..."
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
            {selectedServices.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedServices.length === 1 ? '1 servicio seleccionado' : `${selectedServices.length} servicios seleccionados`}
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">
                    Duracion total: {totalSelectedServiceDuration} min
                  </span>
                </div>
              </div>
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
        <div className={scheduleFieldGridClassName}>
          <div className="min-w-0">
            <label className="label">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className={scheduleDateInputClassName}
              min={getLocalDateInputValue(new Date())}
              required
            />
          </div>

          <div className="min-w-0">
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

          <div className="min-w-0">
            <label className="label">
              Hora Fin <span className="text-red-500">*</span>
            </label>
            <TimeInput
              value={endTimeInput}
              onChange={() => {}}
              onBlur={handleEndTimeBlur}
              placeholder="08:15"
              readOnly
              disabled={!normalizedStartTime || formData.serviceIds.length === 0}
            />
            {endTimeState.error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {endTimeState.error}
              </p>
            )}
            {!normalizedStartTime && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Se calculara automaticamente al indicar la hora de inicio.
              </p>
            )}
          </div>
          <div className="min-w-0">
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
        {totalSelectedServiceDuration > 0 && normalizedStartTime && !normalizedEndTime && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            La duracion total de los servicios supera el horario de cierre. Elige una hora de inicio anterior.
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
          disabled={professionalsLoading && professionalOptions.length === 0}
        >
          {professionalOptions.length === 0 ? (
            <option value="">{professionalsLoading ? 'Cargando profesionales...' : 'Sin profesionales activos'}</option>
          ) : (
            professionalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
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

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
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

          {canCreateCopies && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="copyAppointment"
                checked={copyAppointmentEnabled}
                onChange={handleCopyAppointmentToggle}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="copyAppointment" className="ml-2 text-sm text-gray-900 dark:text-white">
                Copiar cita
              </label>
            </div>
          )}
        </div>

        {canCreateCopies && copyAppointmentEnabled && (
          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className={scheduleFieldGridClassName}>
              <div className="min-w-0">
                <label className="label">
                  Fecha <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  value={copyDraft.date}
                  onChange={handleCopyDraftChange}
                  className={scheduleDateInputClassName}
                  min={getLocalDateInputValue(new Date())}
                />
              </div>

              <div className="min-w-0">
                <label className="label">
                  Hora Inicio <span className="text-red-500">*</span>
                </label>
                <TimeInput
                  value={copyStartTimeInput}
                  onChange={handleCopyStartTimeInputChange}
                  onBlur={handleCopyStartTimeBlur}
                  placeholder="08:00"
                />
                {copyStartTimeState.error && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {copyStartTimeState.error}
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <label className="label">
                  Cabina <span className="text-red-500">*</span>
                </label>
                <select
                  name="cabin"
                  value={copyDraft.cabin}
                  onChange={handleCopyDraftChange}
                  className="input"
                >
                  {cabinOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label className="label">
                  Profesional <span className="text-red-500">*</span>
                </label>
                <select
                  name="professional"
                  value={copyDraft.professional}
                  onChange={handleCopyDraftChange}
                  className="input"
                  disabled={professionalsLoading && professionalOptions.length === 0}
                >
                  {professionalOptions.length === 0 ? (
                    <option value="">
                      {professionalsLoading ? 'Cargando profesionales...' : 'Sin profesionales activos'}
                    </option>
                  ) : (
                    <>
                      <option value="">Selecciona un profesional</option>
                      {professionalOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleAddAppointmentCopy}
                className="btn btn-secondary"
                disabled={loading}
              >
                Copiar cita
              </button>
            </div>

            {appointmentCopies.length > 0 && (
              <div className="mt-4 space-y-2">
                {appointmentCopies.map((copy, index) => {
                  const copyEndTime = getSuggestedEndTime(copy.startTime)

                  return (
                    <div
                      key={copy.id}
                      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/40 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="text-gray-900 dark:text-white">
                        <span className="font-medium">Copia {index + 1}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {' · '}
                          {formatCopyDateLabel(copy.date)}
                          {' · '}
                          {copy.startTime}
                          {copyEndTime ? ` - ${copyEndTime}` : ''}
                          {' · '}
                          {cabinOptions.find((option) => option.value === copy.cabin)?.label || copy.cabin}
                          {' · '}
                          {copy.professional}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAppointmentCopy(copy.id)}
                        className="text-sm font-medium text-gray-500 transition hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                      >
                        Quitar
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Guardando...' : appointment ? 'Actualizar Cita' : 'Crear Cita'}
        </button>
      </div>
    </form>
  )
}
