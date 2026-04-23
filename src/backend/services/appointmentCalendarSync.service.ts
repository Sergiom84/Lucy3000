import { googleCalendarService } from './googleCalendar.service'
import { logInfo, logWarn } from '../utils/logger'
import { syncAgendaBlocks } from './appointmentCalendarSync/agendaBlocks'
import { syncAppointments } from './appointmentCalendarSync/appointments'
import { linkExistingAgendaEntries } from './appointmentCalendarSync/linkExisting'
import { buildSummary, emptyEntitySummary, normalizeIds } from './appointmentCalendarSync/shared'
import type {
  AppointmentCalendarSyncSummary,
  SyncCalendarOptions
} from './appointmentCalendarSync/types'

export type {
  AppointmentCalendarSyncSummary,
  CalendarSyncEntitySummary
} from './appointmentCalendarSync/types'

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
      forceSync: Boolean(options.forceSync),
      onlyUnsynced: Boolean(options.onlyUnsynced)
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
      forceSync: Boolean(current?.forceSync || incoming.forceSync),
      onlyUnsynced: Boolean(current?.onlyUnsynced || incoming.onlyUnsynced)
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
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync' | 'onlyUnsynced'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return this.syncCalendarEntries({
      ...options,
      scope: 'future',
      includeAgendaBlocks: false,
      forceSync: false,
      onlyUnsynced: true
    })
  }

  async syncPendingAgenda(
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync' | 'onlyUnsynced'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return this.syncCalendarEntries({
      ...options,
      scope: 'all',
      includeAgendaBlocks: true,
      forceSync: true,
      onlyUnsynced: true
    })
  }

  async syncEntireAgenda(
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync' | 'onlyUnsynced'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return this.syncCalendarEntries({
      ...options,
      scope: 'all',
      includeAgendaBlocks: true,
      forceSync: true,
      onlyUnsynced: false
    })
  }

  async linkExistingAgenda(
    options: Omit<SyncCalendarOptions, 'scope' | 'includeAgendaBlocks' | 'forceSync' | 'onlyUnsynced'> = {}
  ): Promise<AppointmentCalendarSyncSummary> {
    return linkExistingAgendaEntries(options)
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
      mode: options.forceSync ? 'manual' : 'automatic',
      onlyUnsynced: options.onlyUnsynced
    })

    const [appointmentSummary, agendaBlockSummary] = await Promise.all([
      syncAppointments(options, now),
      options.includeAgendaBlocks ? syncAgendaBlocks(options, now) : Promise.resolve(emptyEntitySummary())
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
}

export const appointmentCalendarSyncService = new AppointmentCalendarSyncService()
