import { prisma } from '../../db'
import type { CalendarSyncResult } from '../googleCalendar.service'
import type {
  AppointmentCalendarSyncSummary,
  CalendarSyncEntitySummary
} from './types'

export const emptyEntitySummary = (): CalendarSyncEntitySummary => ({
  total: 0,
  synced: 0,
  failed: 0,
  skipped: 0
})

export const buildSummary = (
  appointments: CalendarSyncEntitySummary,
  agendaBlocks: CalendarSyncEntitySummary
): AppointmentCalendarSyncSummary => ({
  total: appointments.total + agendaBlocks.total,
  synced: appointments.synced + agendaBlocks.synced,
  failed: appointments.failed + agendaBlocks.failed,
  skipped: appointments.skipped + agendaBlocks.skipped,
  appointments,
  agendaBlocks
})

export const getUtcStartOfToday = (now: Date = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))

export const normalizeIds = (values?: string[]) =>
  Array.isArray(values) ? [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))] : undefined

export const persistAppointmentSyncState = async (
  appointmentId: string,
  syncResult: CalendarSyncResult
) => {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      googleCalendarEventId: syncResult.eventId,
      googleCalendarSyncStatus: syncResult.status,
      googleCalendarSyncError: syncResult.error,
      googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
    }
  })
}

export const persistAgendaBlockSyncState = async (
  agendaBlockId: string,
  syncResult: CalendarSyncResult
) => {
  await prisma.agendaBlock.update({
    where: { id: agendaBlockId },
    data: {
      googleCalendarEventId: syncResult.eventId,
      googleCalendarSyncStatus: syncResult.status,
      googleCalendarSyncError: syncResult.error,
      googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
    }
  })
}

export const linkExistingAppointmentEvent = async (appointmentId: string, eventId: string) => {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      googleCalendarEventId: eventId,
      googleCalendarSyncStatus: 'SYNCED',
      googleCalendarSyncError: null,
      googleCalendarSyncedAt: new Date()
    }
  })
}

export const linkExistingAgendaBlockEvent = async (agendaBlockId: string, eventId: string) => {
  await prisma.agendaBlock.update({
    where: { id: agendaBlockId },
    data: {
      googleCalendarEventId: eventId,
      googleCalendarSyncStatus: 'SYNCED',
      googleCalendarSyncError: null,
      googleCalendarSyncedAt: new Date()
    }
  })
}
