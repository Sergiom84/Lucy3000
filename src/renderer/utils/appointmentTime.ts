export type AppointmentTimeFieldKind = 'start' | 'end'

export type AppointmentTimeInputState = {
  normalized: string
  minutes: number | null
  error: string | null
}

export const TIME_STEP_MINUTES = 15
export const BUSINESS_START_MINUTES = 8 * 60
export const BUSINESS_END_MINUTES = 22 * 60
export const BUSINESS_BREAK_START_MINUTES = 14 * 60
export const BUSINESS_BREAK_END_MINUTES = 16 * 60

export const padTime = (value: number) => String(value).padStart(2, '0')

export const getTimeInputValueFromDate = (value: Date) =>
  `${padTime(value.getHours())}:${padTime(value.getMinutes())}`

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export const minutesToTime = (value: number) => {
  const safeMinutes = Math.max(0, Math.floor(value))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${padTime(hours)}:${padTime(minutes)}`
}

export const buildTimeOptions = (startMinutes: number, endMinutes: number, stepMinutes = TIME_STEP_MINUTES) => {
  const options: string[] = []

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += stepMinutes) {
    options.push(minutesToTime(minutes))
  }

  return options
}

export const parseManualTimeValue = (value: string): AppointmentTimeInputState => {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      normalized: '',
      minutes: null,
      error: null
    }
  }

  let hours: number | null = null
  let minutes: number | null = null

  if (/^\d{1,2}$/.test(trimmed)) {
    hours = Number.parseInt(trimmed, 10)
    minutes = 0
  } else if (/^\d{3}$/.test(trimmed)) {
    hours = Number.parseInt(trimmed.slice(0, 1), 10)
    minutes = Number.parseInt(trimmed.slice(1), 10)
  } else if (/^\d{4}$/.test(trimmed)) {
    hours = Number.parseInt(trimmed.slice(0, 2), 10)
    minutes = Number.parseInt(trimmed.slice(2), 10)
  } else {
    const match = trimmed.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/)
    if (match) {
      hours = Number.parseInt(match[1], 10)
      minutes = Number.parseInt(match[2], 10)
    }
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours === null ||
    minutes === null ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return {
      normalized: '',
      minutes: null,
      error: 'Introduce una hora valida. Ejemplos: 17, 17:30 o 1730.'
    }
  }

  const normalized = `${padTime(hours)}:${padTime(minutes)}`

  return {
    normalized,
    minutes: timeToMinutes(normalized),
    error: null
  }
}

export const getAppointmentTimeInputState = (
  value: string,
  kind: AppointmentTimeFieldKind,
  startTime?: string
): AppointmentTimeInputState => {
  const parsed = parseManualTimeValue(value)
  if (!value.trim() || parsed.error || parsed.minutes === null) {
    return parsed
  }

  if (kind === 'start') {
    if (parsed.minutes < BUSINESS_START_MINUTES || parsed.minutes >= BUSINESS_END_MINUTES) {
      return {
        ...parsed,
        error: 'La hora de inicio debe estar entre 08:00 y 21:59.'
      }
    }

    return parsed
  }

  if (parsed.minutes < BUSINESS_START_MINUTES || parsed.minutes > BUSINESS_END_MINUTES) {
    return {
      ...parsed,
      error: 'La hora de fin debe estar entre 08:00 y 22:00.'
    }
  }

  if (startTime && parsed.minutes <= timeToMinutes(startTime)) {
    return {
      ...parsed,
      error: 'La hora de fin debe ser posterior a la hora de inicio.'
    }
  }

  return parsed
}
