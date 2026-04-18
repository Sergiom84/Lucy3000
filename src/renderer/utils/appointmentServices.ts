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

export const getAppointmentServiceLabel = (appointment: AppointmentLike, separator = ' + ') =>
  getAppointmentServiceNames(appointment).join(separator)

export const getAppointmentServiceDuration = (appointment: AppointmentLike) =>
  getAppointmentServices(appointment).reduce(
    (total, service) => total + Math.max(0, Number(service.duration || 0)),
    0
  )
