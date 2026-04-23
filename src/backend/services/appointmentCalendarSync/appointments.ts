import { prisma } from '../../db'
import {
  googleCalendarService
} from '../googleCalendar.service'
import { ACTIVE_APPOINTMENT_STATUSES } from '../../utils/appointment-validation'
import {
  appointmentCalendarSyncInclude,
  buildAppointmentCalendarSyncInput,
  isUpcomingAppointment
} from '../../utils/appointment-calendar'
import { logWarn } from '../../utils/logger'
import { getUtcStartOfToday, persistAppointmentSyncState } from './shared'
import type { CalendarSyncEntitySummary, SyncCalendarOptions } from './types'

export const syncAppointments = async (
  options: SyncCalendarOptions,
  now: Date
): Promise<CalendarSyncEntitySummary> => {
  const where = {
    ...(options.appointmentIds ? { id: { in: options.appointmentIds } } : {}),
    status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
    ...(options.scope === 'future'
      ? {
          date: {
            gte: getUtcStartOfToday(now)
          }
        }
      : {}),
    ...(options.onlyUnsynced
      ? {
          OR: [{ googleCalendarEventId: null }, { googleCalendarSyncStatus: { not: 'SYNCED' } }]
        }
      : {})
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: appointmentCalendarSyncInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  })

  const summary: CalendarSyncEntitySummary = {
    total: appointments.length,
    synced: 0,
    failed: 0,
    skipped: 0
  }

  for (const appointment of appointments) {
    if (options.scope === 'future' && !isUpcomingAppointment(appointment, now)) {
      summary.skipped += 1
      continue
    }

    const syncResult = await googleCalendarService.upsertAppointmentEvent(
      buildAppointmentCalendarSyncInput(appointment),
      {
        forceSync: options.forceSync
      }
    )

    await persistAppointmentSyncState(appointment.id, syncResult)

    if (syncResult.status === 'SYNCED') {
      summary.synced += 1
      continue
    }

    if (syncResult.status === 'ERROR') {
      summary.failed += 1
      logWarn('Google Calendar sync failed for appointment', {
        appointmentId: appointment.id,
        syncError: syncResult.error,
        reason: options.reason || null,
        scope: options.scope
      })
      continue
    }

    summary.skipped += 1
  }

  return summary
}
