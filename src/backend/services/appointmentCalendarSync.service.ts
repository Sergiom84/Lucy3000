import { prisma } from '../db'
import { AppointmentSyncInput, googleCalendarService } from './googleCalendar.service'
import { ACTIVE_APPOINTMENT_STATUSES } from '../utils/appointment-validation'
import {
  appointmentCalendarSyncInclude,
  buildAppointmentCalendarSyncInput,
  isUpcomingAppointment
} from '../utils/appointment-calendar'
import { logInfo, logWarn } from '../utils/logger'

type SyncCalendarScope = 'future' | 'all'

export type CalendarSyncEntitySummary = {
  total: number
  synced: number
  failed: number
  skipped: number
}

export type AppointmentCalendarSyncSummary = CalendarSyncEntitySummary & {
  appointments: CalendarSyncEntitySummary
  agendaBlocks: CalendarSyncEntitySummary
}

type SyncCalendarOptions = {
  appointmentIds?: string[]
  agendaBlockIds?: string[]
  reason?: string
  scope?: SyncCalendarScope
  includeAgendaBlocks?: boolean
  forceSync?: boolean
}

type SyncableAgendaBlock = {
  id: string
  professional: string
  calendarInviteEmail: string | null
  cabin: string
  date: Date
  startTime: string
  endTime: string
  notes: string | null
  googleCalendarEventId: string | null
  googleCalendarSyncStatus: string
}

const CABIN_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

const emptyEntitySummary = (): CalendarSyncEntitySummary => ({
  total: 0,
  synced: 0,
  failed: 0,
  skipped: 0
})

const buildSummary = (
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

const getUtcStartOfToday = (now: Date = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))

const normalizeIds = (values?: string[]) =>
  Array.isArray(values) ? [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))] : undefined

const formatCabinLabel = (cabin: string) => CABIN_LABELS[cabin] || cabin

const parseTimePart = (value: string, index: number) => {
  const part = Number.parseInt(String(value || '').split(':')[index] || '0', 10)
  return Number.isFinite(part) ? part : 0
}

const getAgendaBlockStartsAt = (agendaBlock: Pick<SyncableAgendaBlock, 'date' | 'startTime'>) => {
  const at = new Date(agendaBlock.date)
  at.setHours(parseTimePart(agendaBlock.startTime, 0), parseTimePart(agendaBlock.startTime, 1), 0, 0)
  return at
}

const isUpcomingAgendaBlock = (agendaBlock: Pick<SyncableAgendaBlock, 'date' | 'startTime'>, now: Date = new Date()) =>
  getAgendaBlockStartsAt(agendaBlock).getTime() >= now.getTime()

const buildAgendaBlockSyncInput = (agendaBlock: SyncableAgendaBlock): AppointmentSyncInput => {
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

class AppointmentCalendarSyncService {
  private activeSyncPromise: Promise<AppointmentCalendarSyncSummary> | null = null
  private queuedSyncOptions: SyncCalendarOptions | null = null
  private queuedSyncPromise: Promise<void> | null = null

  private normalizeOptions(options: SyncCalendarOptions = {}): SyncCalendarOptions {
    return {
      appointmentIds: normalizeIds(options.appointmentIds),
      agendaBlockIds: normalizeIds(options.agendaBlockIds),
      reason: options.reason,
      scope: options.scope || 'future',
      includeAgendaBlocks: Boolean(options.includeAgendaBlocks),
      forceSync: Boolean(options.forceSync)
    }
  }

  private mergeQueuedOptions(current: SyncCalendarOptions | null, incoming: SyncCalendarOptions): SyncCalendarOptions {
    const mergeIds = (currentIds?: string[], incomingIds?: string[]) => {
      if (!currentIds || !incomingIds) {
        return undefined
      }

      return [...new Set([...currentIds, ...incomingIds])]
    }

    return {
      appointmentIds: mergeIds(current?.appointmentIds, incoming.appointmentIds),
      agendaBlockIds: mergeIds(current?.agendaBlockIds, incoming.agendaBlockIds),
      reason: current?.reason || incoming.reason,
      scope: current?.scope === 'all' || incoming.scope === 'all' ? 'all' : 'future',
      includeAgendaBlocks: Boolean(current?.includeAgendaBlocks || incoming.includeAgendaBlocks),
      forceSync: Boolean(current?.forceSync || incoming.forceSync)
    }
  }

  private queueFollowUpSync(options: SyncCalendarOptions) {
    this.queuedSyncOptions = this.mergeQueuedOptions(this.queuedSyncOptions, options)

    if (this.queuedSyncPromise || !this.activeSyncPromise) {
      return
    }

    this.queuedSyncPromise = this.activeSyncPromise
      .then(
        () => undefined,
        () => undefined
      )
      .then(async () => {
        const queuedOptions = this.queuedSyncOptions
        this.queuedSyncOptions = null
        this.queuedSyncPromise = null

        if (!queuedOptions) {
          return
        }

        await this.syncCalendarEntries(queuedOptions)
      })
      .catch((error) => {
        logWarn('Queued Google Calendar sync retry failed', {
          reason: options.reason || null,
          scope: options.scope || 'future',
          includeAgendaBlocks: Boolean(options.includeAgendaBlocks),
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }

  async syncFutureAppointments(
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return this.syncCalendarEntries({
      ...options,
      scope: 'future',
      includeAgendaBlocks: false,
      forceSync: false
    })
  }

  async syncEntireAgenda(
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return this.syncCalendarEntries({
      ...options,
      scope: 'all',
      includeAgendaBlocks: true,
      forceSync: true
    })
  }

  async syncCalendarEntries(options: SyncCalendarOptions = {}): Promise<AppointmentCalendarSyncSummary> {
    const normalizedOptions = this.normalizeOptions(options)

    if (
      normalizedOptions.appointmentIds &&
      normalizedOptions.appointmentIds.length === 0 &&
      normalizedOptions.agendaBlockIds &&
      normalizedOptions.agendaBlockIds.length === 0
    ) {
      return buildSummary(emptyEntitySummary(), emptyEntitySummary())
    }

    if (this.activeSyncPromise) {
      this.queueFollowUpSync(normalizedOptions)
      logInfo('Queued pending Google Calendar sync because another run is already in progress', {
        reason: normalizedOptions.reason || null,
        scope: normalizedOptions.scope,
        includeAgendaBlocks: normalizedOptions.includeAgendaBlocks,
        hasAppointmentFilter: Boolean(normalizedOptions.appointmentIds?.length),
        hasAgendaBlockFilter: Boolean(normalizedOptions.agendaBlockIds?.length)
      })
      return this.activeSyncPromise
    }

    const runPromise = this.performSyncCalendarEntries(normalizedOptions)
    this.activeSyncPromise = runPromise

    try {
      return await runPromise
    } finally {
      if (this.activeSyncPromise === runPromise) {
        this.activeSyncPromise = null
      }
    }
  }

  private async performSyncCalendarEntries(options: SyncCalendarOptions): Promise<AppointmentCalendarSyncSummary> {
    const config = await googleCalendarService.getConfig()
    if (!config || (!config.enabled && !options.forceSync)) {
      return buildSummary(emptyEntitySummary(), emptyEntitySummary())
    }

    const now = new Date()
    logInfo('Starting Google Calendar agenda sync', {
      reason: options.reason || null,
      scope: options.scope,
      includeAgendaBlocks: options.includeAgendaBlocks,
      mode: options.forceSync ? 'manual' : 'automatic'
    })

    const [appointmentSummary, agendaBlockSummary] = await Promise.all([
      this.syncAppointments(options, now),
      options.includeAgendaBlocks ? this.syncAgendaBlocks(options, now) : Promise.resolve(emptyEntitySummary())
    ])

    const summary = buildSummary(appointmentSummary, agendaBlockSummary)
    logInfo('Processed Google Calendar agenda sync', {
      reason: options.reason || null,
      scope: options.scope,
      includeAgendaBlocks: options.includeAgendaBlocks,
      summary
    })

    return summary
  }

  private async syncAppointments(options: SyncCalendarOptions, now: Date): Promise<CalendarSyncEntitySummary> {
    const where = {
      ...(options.appointmentIds ? { id: { in: options.appointmentIds } } : {}),
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      ...(options.scope === 'future'
        ? {
            date: {
              gte: getUtcStartOfToday(now)
            },
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

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleCalendarEventId: syncResult.eventId,
          googleCalendarSyncStatus: syncResult.status,
          googleCalendarSyncError: syncResult.error,
          googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
        }
      })

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

  private async syncAgendaBlocks(options: SyncCalendarOptions, now: Date): Promise<CalendarSyncEntitySummary> {
    const agendaBlocks = await prisma.agendaBlock.findMany({
      where: {
        ...(options.agendaBlockIds ? { id: { in: options.agendaBlockIds } } : {}),
        ...(options.scope === 'future'
          ? {
              date: {
                gte: getUtcStartOfToday(now)
              },
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

      await prisma.agendaBlock.update({
        where: { id: agendaBlock.id },
        data: {
          googleCalendarEventId: syncResult.eventId,
          googleCalendarSyncStatus: syncResult.status,
          googleCalendarSyncError: syncResult.error,
          googleCalendarSyncedAt: syncResult.status === 'SYNCED' ? new Date() : null
        }
      })

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
}

export const appointmentCalendarSyncService = new AppointmentCalendarSyncService()
