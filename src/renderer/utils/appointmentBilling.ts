type AppointmentBillingSnapshot = {
  status?: string | null
  sale?: {
    status?: string | null
  } | null
  bonoSessions?: Array<{
    status?: string | null
  }> | null
  bonoSession?: {
    status?: string | null
  } | null
} | null | undefined

const NON_CHARGEABLE_APPOINTMENT_STATUSES = new Set(['CANCELLED', 'NO_SHOW'])

export const hasCompletedAppointmentSale = (appointment: AppointmentBillingSnapshot) =>
  String(appointment?.sale?.status || '').toUpperCase() === 'COMPLETED'

export const hasConsumedAppointmentBono = (appointment: AppointmentBillingSnapshot) =>
  Array.isArray(appointment?.bonoSessions)
    ? appointment!.bonoSessions.some((session) => String(session?.status || '').toUpperCase() === 'CONSUMED')
    : String(appointment?.bonoSession?.status || '').toUpperCase() === 'CONSUMED'

export const hasNonChargeableAppointmentStatus = (appointment: AppointmentBillingSnapshot) =>
  NON_CHARGEABLE_APPOINTMENT_STATUSES.has(String(appointment?.status || '').toUpperCase())

export const isAppointmentInactiveForCalendar = (appointment: AppointmentBillingSnapshot) =>
  hasCompletedAppointmentSale(appointment) ||
  hasConsumedAppointmentBono(appointment) ||
  hasNonChargeableAppointmentStatus(appointment)

export const requiresAppointmentCharge = (appointment: AppointmentBillingSnapshot) =>
  !hasCompletedAppointmentSale(appointment) &&
  !hasConsumedAppointmentBono(appointment) &&
  !hasNonChargeableAppointmentStatus(appointment)
