import { prisma } from '../../db'
import {
  type CalendarSyncResult,
  googleCalendarService
} from '../../services/googleCalendar.service'
import { buildAppointmentCalendarSyncInput } from '../../utils/appointment-calendar'
import { getAppointmentDisplayEmail } from '../../utils/customer-display'
import { logWarn } from '../../utils/logger'
import { appointmentInclude, type AppointmentRecord } from './shared'

type AppointmentCalendarSyncLogTarget = {
  id: string
  clientId?: string | null
  serviceId?: string | null
  date: Date
  startTime: string
  endTime: string
}

type AppointmentCalendarDeleteTarget = {
  id: string
  googleCalendarEventId: string | null
  client?: {
    email?: string | null
  } | null
  guestName?: string | null
  guestPhone?: string | null
}

const logAppointmentCalendarSyncWarning = (
  message: string,
  appointment: AppointmentCalendarSyncLogTarget,
  syncResult: CalendarSyncResult
) => {
  if (syncResult.status !== 'ERROR') {
    return
  }

  logWarn(message, {
    appointmentId: appointment.id,
    syncError: syncResult.error,
    clientId: appointment.clientId,
    serviceId: appointment.serviceId,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime
  })
}

export const persistAppointmentCalendarSyncResult = async (
  appointmentId: string,
  syncResult: CalendarSyncResult
) => {
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      googleCalendarEventId: syncResult.eventId,
      googleCalendarSyncStatus: syncResult.status,
      googleCalendarSyncError: syncResult.error,
      googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
    },
    include: appointmentInclude
  })
}

export const syncCreatedAppointmentCalendar = async (appointment: AppointmentRecord) => {
  const syncResult = await googleCalendarService.upsertAppointmentEvent(
    buildAppointmentCalendarSyncInput(appointment)
  )
  const persistedAppointment = await persistAppointmentCalendarSyncResult(appointment.id, syncResult)

  logAppointmentCalendarSyncWarning(
    'Appointment created but Google Calendar sync failed',
    appointment,
    syncResult
  )

  return persistedAppointment
}

export const syncUpdatedAppointmentCalendar = async (appointment: AppointmentRecord) => {
  const syncResult =
    appointment.status === 'CANCELLED'
      ? await googleCalendarService.deleteAppointmentEvent(
          appointment.googleCalendarEventId,
          getAppointmentDisplayEmail(appointment)
        )
      : await googleCalendarService.upsertAppointmentEvent(
          buildAppointmentCalendarSyncInput(appointment)
        )
  const persistedAppointment = await persistAppointmentCalendarSyncResult(appointment.id, syncResult)

  logAppointmentCalendarSyncWarning(
    'Appointment updated but Google Calendar sync failed',
    appointment,
    syncResult
  )

  return persistedAppointment
}

export const deleteAppointmentCalendarEvent = async (
  appointment: AppointmentCalendarDeleteTarget
) => {
  const deleteSyncResult = await googleCalendarService.deleteAppointmentEvent(
    appointment.googleCalendarEventId,
    getAppointmentDisplayEmail(appointment)
  )

  if (deleteSyncResult.error) {
    logWarn('Google Calendar event deletion failed while deleting appointment', {
      appointmentId: appointment.id,
      syncError: deleteSyncResult.error
    })
  }

  return deleteSyncResult
}
