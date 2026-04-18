type AppointmentServiceRecord = {
  id: string
  name?: string | null
  duration?: number | null
  category?: string | null
}

type AppointmentServiceLink = {
  serviceId?: string | null
  sortOrder?: number | null
  service?: AppointmentServiceRecord | null
}

type AppointmentLike = {
  serviceId?: string | null
  service?: AppointmentServiceRecord | null
  appointmentServices?: AppointmentServiceLink[] | null
}

const uniqueServiceIds = (serviceIds: string[]) => {
  const seen = new Set<string>()
  const normalizedIds: string[] = []

  for (const serviceId of serviceIds) {
    const normalizedId = String(serviceId || '').trim()
    if (!normalizedId || seen.has(normalizedId)) continue
    seen.add(normalizedId)
    normalizedIds.push(normalizedId)
  }

  return normalizedIds
}

export const normalizeAppointmentServiceIdsInput = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueServiceIds(value.map((item) => String(item || '')))
}

export const deriveAppointmentServiceIds = (
  payload: { serviceIds?: unknown; serviceId?: unknown },
  fallbackServiceIds: string[] = []
) => {
  const explicitServiceIds = normalizeAppointmentServiceIdsInput(payload.serviceIds)
  if (explicitServiceIds.length > 0) {
    return explicitServiceIds
  }

  const legacyServiceId = String(payload.serviceId || '').trim()
  if (legacyServiceId) {
    return [legacyServiceId]
  }

  return uniqueServiceIds(fallbackServiceIds)
}

export const getAppointmentServices = (appointment: AppointmentLike): AppointmentServiceRecord[] => {
  const linkedServices = Array.isArray(appointment.appointmentServices)
    ? [...appointment.appointmentServices]
        .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
        .map((item) => item.service)
        .filter((service): service is AppointmentServiceRecord => Boolean(service?.id))
    : []

  if (linkedServices.length > 0) {
    return linkedServices
  }

  return appointment.service?.id ? [appointment.service] : []
}

export const getAppointmentPrimaryService = (appointment: AppointmentLike) => {
  return getAppointmentServices(appointment)[0] || null
}

export const getAppointmentServiceNames = (appointment: AppointmentLike) =>
  getAppointmentServices(appointment)
    .map((service) => String(service.name || '').trim())
    .filter(Boolean)

export const getAppointmentServiceLabel = (appointment: AppointmentLike, separator = ' + ') => {
  return getAppointmentServiceNames(appointment).join(separator)
}

export const getAppointmentServiceDuration = (appointment: AppointmentLike) => {
  return getAppointmentServices(appointment).reduce(
    (total, service) => total + Math.max(0, Number(service.duration || 0)),
    0
  )
}

const padTime = (value: number) => String(value).padStart(2, '0')

export const timeToMinutes = (time: string) => {
  const [hours, minutes] = String(time || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))

  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export const minutesToTime = (value: number) => {
  const safeMinutes = Math.max(0, Math.floor(value))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${padTime(hours)}:${padTime(minutes)}`
}

export const calculateAppointmentEndTime = (startTime: string, durationMinutes: number) => {
  return minutesToTime(timeToMinutes(startTime) + Math.max(0, Number(durationMinutes || 0)))
}
