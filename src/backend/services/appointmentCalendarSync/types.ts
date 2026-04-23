import type { CalendarEventListItem } from '../googleCalendar.service'

export type SyncCalendarScope = 'future' | 'all'

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

export type SyncCalendarOptions = {
  appointmentIds?: string[]
  agendaBlockIds?: string[]
  reason?: string
  scope?: SyncCalendarScope
  includeAgendaBlocks?: boolean
  forceSync?: boolean
  onlyUnsynced?: boolean
}

export type SyncableAgendaBlock = {
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

export type LinkableAgendaBlock = SyncableAgendaBlock

export type RemoteCalendarCandidate = CalendarEventListItem & {
  titleMatchText: string
  combinedText: string
  startSlot: string | null
  endSlot: string | null
}
