type AppointmentCancellationSnapshot = {
  client?: {
    cancelledAppointmentCount?: number | null
  } | null
} | null | undefined

export const getAppointmentCancelledCount = (appointment: AppointmentCancellationSnapshot) => {
  const count = Number(appointment?.client?.cancelledAppointmentCount || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

export const getAppointmentCancellationWarning = (appointment: AppointmentCancellationSnapshot) => {
  const count = getAppointmentCancelledCount(appointment)

  if (count === 0) return ''

  return count === 1 ? 'Ha anulado 1 cita' : `Ha anulado ${count} citas`
}
