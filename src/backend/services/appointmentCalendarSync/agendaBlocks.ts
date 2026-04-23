import { prisma } from '../../db'
import {
  type AppointmentSyncInput,
  googleCalendarService
} from '../googleCalendar.service'
import { logWarn } from '../../utils/logger'
import { getUtcStartOfToday, persistAgendaBlockSyncState } from './shared'
import type {
  CalendarSyncEntitySummary,
  SyncCalendarOptions,
  SyncableAgendaBlock
} from './types'

const CABIN_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

export const formatCabinLabel = (cabin: string) => CABIN_LABELS[cabin] || cabin

const parseTimePart = (value: string, index: number) => {
  const part = Number.parseInt(String(value || '').split(':')[index] || '0', 10)
  return Number.isFinite(part) ? part : 0
}

export const getAgendaBlockStartsAt = (agendaBlock: Pick<SyncableAgendaBlock, 'date' | 'startTime'>) => {
  const at = new Date(agendaBlock.date)
  at.setHours(parseTimePart(agendaBlock.startTime, 0), parseTimePart(agendaBlock.startTime, 1), 0, 0)
  return at
}

export const getAgendaBlockEndsAt = (agendaBlock: Pick<SyncableAgendaBlock, 'date' | 'endTime'>) => {
  const at = new Date(agendaBlock.date)
  at.setHours(parseTimePart(agendaBlock.endTime, 0), parseTimePart(agendaBlock.endTime, 1), 0, 0)
  return at
}

export const isUpcomingAgendaBlock = (
  agendaBlock: Pick<SyncableAgendaBlock, 'date' | 'startTime'>,
  now: Date = new Date()
) => getAgendaBlockStartsAt(agendaBlock).getTime() >= now.getTime()

export const buildAgendaBlockSyncInput = (agendaBlock: SyncableAgendaBlock): AppointmentSyncInput => {
  const notesLine = agendaBlock.notes ? `\nObservaciones: ${agendaBlock.notes}` : ''

  return {
    appointmentId: agendaBlock.id,
    existingEventId: agendaBlock.googleCalendarEventId || null,
    title: `Bloqueo - ${agendaBlock.professional}`,
    description: `Bloqueo de agenda\nProfesional: ${agendaBlock.professional}\nCabina: ${formatCabinLabel(agendaBlock.cabin)}${notesLine}`,
    date: agendaBlock.date,
    startTime: agendaBlock.startTime,
    endTime: agendaBlock.endTime,
    clientName: agendaBlock.professional,
    clientEmail: agendaBlock.calendarInviteEmail || null,
    forceSendUpdates: Boolean(agendaBlock.calendarInviteEmail)
  }
}

export const syncAgendaBlocks = async (
  options: SyncCalendarOptions,
  now: Date
): Promise<CalendarSyncEntitySummary> => {
  const agendaBlocks = await prisma.agendaBlock.findMany({
    where: {
      ...(options.agendaBlockIds ? { id: { in: options.agendaBlockIds } } : {}),
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
    },
    select: {
      id: true,
      professional: true,
      calendarInviteEmail: true,
      cabin: true,
      date: true,
      startTime: true,
      endTime: true,
      notes: true,
      googleCalendarEventId: true,
      googleCalendarSyncStatus: true
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  })

  const summary: CalendarSyncEntitySummary = {
    total: agendaBlocks.length,
    synced: 0,
    failed: 0,
    skipped: 0
  }

  for (const agendaBlock of agendaBlocks) {
    if (options.scope === 'future' && !isUpcomingAgendaBlock(agendaBlock, now)) {
      summary.skipped += 1
      continue
    }

    const syncResult = await googleCalendarService.upsertAppointmentEvent(
      buildAgendaBlockSyncInput(agendaBlock),
      {
        forceSync: options.forceSync
      }
    )

    await persistAgendaBlockSyncState(agendaBlock.id, syncResult)

    if (syncResult.status === 'SYNCED') {
      summary.synced += 1
      continue
    }

    if (syncResult.status === 'ERROR') {
      summary.failed += 1
      logWarn('Google Calendar sync failed for agenda block', {
        agendaBlockId: agendaBlock.id,
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
