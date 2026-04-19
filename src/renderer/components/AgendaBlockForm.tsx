import { useEffect, useMemo, useState } from 'react'
import { Clock, Save, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { loadAppointmentProfessionals } from '../utils/appointmentCatalogs'
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

interface AgendaBlockFormProps {
  agendaBlock?: any
  onSuccess: () => void
  onCancel: () => void
  preselectedDate?: Date
  preselectedStartTime?: string
  preselectedEndTime?: string
  initialCabin?: 'LUCY' | 'TAMARA' | 'CABINA_1' | 'CABINA_2'
}

const cabinOptions = [
  { value: 'LUCY', label: 'Lucy' },
  { value: 'TAMARA', label: 'Tamara' },
  { value: 'CABINA_1', label: 'Cabina 1' },
  { value: 'CABINA_2', label: 'Cabina 2' }
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
  const listId = placeholder === '08:00' ? 'agenda-block-start-time-options' : 'agenda-block-end-time-options'
  const options = useMemo(() => {
    return listId === 'agenda-block-start-time-options'
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

export default function AgendaBlockForm({
  agendaBlock,
  onSuccess,
  onCancel,
  preselectedDate,
  preselectedStartTime,
  preselectedEndTime,
  initialCabin = 'LUCY'
}: AgendaBlockFormProps) {
  const [loading, setLoading] = useState(false)
  const [professionalsLoading, setProfessionalsLoading] = useState(true)
  const [professionals, setProfessionals] = useState<string[]>([])
  const [professionalTouched, setProfessionalTouched] = useState(false)
  const [formData, setFormData] = useState({
    professional: '',
    calendarInviteEmail: '',
    cabin: initialCabin,
    date: '',
    notes: ''
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

    const loadProfessionals = async () => {
      setProfessionalsLoading(true)
      try {
        const nextProfessionals = await loadAppointmentProfessionals()
        if (!cancelled) {
          setProfessionals(nextProfessionals)
        }
      } catch (error) {
        console.error('Error fetching agenda block professionals:', error)
      } finally {
        if (!cancelled) {
          setProfessionalsLoading(false)
        }
      }
    }

    void loadProfessionals()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (agendaBlock) {
      setProfessionalTouched(false)
      const blockDate = new Date(agendaBlock.date)
      setFormData({
        professional: agendaBlock.professional || '',
        calendarInviteEmail: agendaBlock.calendarInviteEmail || '',
        cabin: agendaBlock.cabin || initialCabin,
        date: getLocalDateInputValue(blockDate),
        notes: agendaBlock.notes || ''
      })
      setStartTimeInput(agendaBlock.startTime || '')
      setEndTimeInput(agendaBlock.endTime || '')
      return
    }

    setProfessionalTouched(false)
    setFormData((prev) => ({
      ...prev,
      professional: prev.professional || '',
      calendarInviteEmail: '',
      cabin: initialCabin,
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
  }, [agendaBlock, initialCabin, preselectedDate, preselectedEndTime, preselectedStartTime])

  useEffect(() => {
    if (agendaBlock || professionalTouched || formData.professional.trim()) {
      return
    }

    const fallbackProfessional = professionals[0] || ''
    if (!fallbackProfessional) {
      return
    }

    setFormData((prev) => ({ ...prev, professional: fallbackProfessional }))
  }, [agendaBlock, formData.professional, professionalTouched, professionals])

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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    if (name === 'professional') {
      setProfessionalTouched(true)
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  const handleStartTimeChange = (value: string) => {
    setStartTimeInput(value)

    const nextStartState = getAppointmentTimeInputState(value, 'start')
    const nextStartTime = nextStartState.error ? '' : nextStartState.normalized

    if (!nextStartTime) {
      setEndTimeInput('')
      return
    }

    if (!normalizedEndTime || timeToMinutes(normalizedEndTime) <= timeToMinutes(nextStartTime)) {
      setEndTimeInput(
        minutesToTime(Math.min(timeToMinutes(nextStartTime) + TIME_STEP_MINUTES, BUSINESS_END_MINUTES))
      )
    }
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

  const showCalendarSyncWarning = (savedAgendaBlock: any, successMessage: string) => {
    const syncError = String(savedAgendaBlock?.googleCalendarSyncError || '').trim()
    if (savedAgendaBlock?.googleCalendarSyncStatus !== 'ERROR' || !syncError) {
      toast.success(successMessage)
      return
    }

    toast.success(successMessage)
    toast(`${successMessage}, pero Google Calendar no se pudo sincronizar. ${syncError}`)
  }

  const handleDelete = async () => {
    if (!agendaBlock?.id || !confirm('¿Eliminar este bloqueo de agenda?')) {
      return
    }

    setLoading(true)
    try {
      await api.delete(`/appointments/blocks/${agendaBlock.id}`)
      toast.success('Bloqueo eliminado')
      onSuccess()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al eliminar el bloqueo')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (!formData.professional.trim()) {
        toast.error('Debe seleccionar un profesional')
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

      if (normalizedStartTime >= normalizedEndTime) {
        toast.error('La hora de inicio debe ser anterior a la hora de fin')
        setLoading(false)
        return
      }

      const startMinutes = timeToMinutes(normalizedStartTime)
      const endMinutes = timeToMinutes(normalizedEndTime)
      if (
        startMinutes < BUSINESS_START_MINUTES ||
        startMinutes >= BUSINESS_END_MINUTES ||
        endMinutes > BUSINESS_END_MINUTES
      ) {
        toast.error('El horario debe estar entre 08:00 y 22:00')
        setLoading(false)
        return
      }

      const todayStr = getLocalDateInputValue(new Date())
      if (formData.date < todayStr) {
        toast.error('No se puede crear un bloqueo en el pasado')
        setLoading(false)
        return
      }

      if (formData.date === todayStr) {
        const now = new Date()
        const nowMinutes = now.getHours() * 60 + now.getMinutes()
        if (startMinutes < nowMinutes) {
          toast.error('No se puede crear un bloqueo en el pasado')
          setLoading(false)
          return
        }
      }

      const payload = {
        professional: formData.professional.trim(),
        calendarInviteEmail: formData.calendarInviteEmail.trim() || null,
        cabin: formData.cabin,
        date: new Date(formData.date).toISOString(),
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        notes: formData.notes.trim() || null
      }

      if (agendaBlock?.id) {
        const response = await api.put(`/appointments/blocks/${agendaBlock.id}`, payload)
        showCalendarSyncWarning(response.data, 'Bloqueo actualizado')
      } else {
        const response = await api.post('/appointments/blocks', payload)
        showCalendarSyncWarning(response.data, 'Bloqueo creado')
      }

      onSuccess()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al guardar el bloqueo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label">
            Profesional <span className="text-red-500">*</span>
          </label>
          <select
            name="professional"
            value={formData.professional}
            onChange={handleChange}
            className="input"
            required
            disabled={professionalsLoading && professionalOptions.length === 0}
          >
            {professionalOptions.length === 0 ? (
              <option value="">
                {professionalsLoading ? 'Cargando profesionales...' : 'Sin profesionales configurados'}
              </option>
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

      <div>
        <label className="label">Correo para Calendario</label>
        <input
          type="email"
          name="calendarInviteEmail"
          value={formData.calendarInviteEmail}
          onChange={handleChange}
          className="input"
          placeholder="persona@empresa.com"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Si rellenas este correo y el bloqueo se sincroniza con Google Calendar, se enviará la invitación.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
            onChange={handleStartTimeChange}
            onBlur={handleStartTimeBlur}
            placeholder="08:00"
          />
          {startTimeState.error ? (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{startTimeState.error}</p>
          ) : null}
        </div>

        <div>
          <label className="label">
            Hora Fin <span className="text-red-500">*</span>
          </label>
          <TimeInput
            value={endTimeInput}
            onChange={(value) => setEndTimeInput(value)}
            onBlur={handleEndTimeBlur}
            placeholder="08:15"
          />
          {endTimeState.error ? (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{endTimeState.error}</p>
          ) : null}
        </div>
      </div>

      {normalizedStartTime && (() => {
        const minutes = timeToMinutes(normalizedStartTime)
        if (minutes >= BUSINESS_BREAK_START_MINUTES && minutes < BUSINESS_BREAK_END_MINUTES) {
          return (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Aviso: Esta hora está dentro de la franja de descanso habitual (14:00-16:00).
            </p>
          )
        }

        return null
      })()}

      <div>
        <label className="label">Observaciones</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="input resize-none"
          rows={4}
          placeholder="Observaciones internas del bloqueo..."
        />
      </div>

      <div className="flex justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
        <div>
          {agendaBlock?.id ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900"
              disabled={loading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar Bloqueo
            </button>
          ) : null}
        </div>

        <div className="flex space-x-3">
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={loading}>
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Guardando...' : agendaBlock ? 'Actualizar Bloqueo' : 'Crear Bloqueo'}
          </button>
        </div>
      </div>
    </form>
  )
}
