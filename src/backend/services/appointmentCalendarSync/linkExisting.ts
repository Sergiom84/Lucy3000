import { prisma } from '../../db'
import {
  type CalendarEventListItem,
  type AppointmentSyncInput,
  googleCalendarService,
  toCalendarDatePart
} from '../googleCalendar.service'
import { ACTIVE_APPOINTMENT_STATUSES } from '../../utils/appointment-validation'
import {
  appointmentCalendarSyncInclude,
  type AppointmentCalendarSyncRecord,
  buildAppointmentCalendarSyncInput
} from '../../utils/appointment-calendar'
import { logInfo } from '../../utils/logger'
import { notifyGoogleCalendarLinkReviewNeeded } from '../../utils/notifications'
import {
  buildSummary,
  emptyEntitySummary,
  linkExistingAgendaBlockEvent,
  linkExistingAppointmentEvent
} from './shared'
import {
  buildAgendaBlockSyncInput,
  formatCabinLabel,
} from './agendaBlocks'
import type {
  AppointmentCalendarSyncSummary,
  CalendarSyncEntitySummary,
  LinkableAgendaBlock,
  RemoteCalendarCandidate,
  SyncCalendarOptions
} from './types'

const MADRID_TIME_ZONE = 'Europe/Madrid'
const MADRID_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  timeZoneName: 'shortOffset',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const normalizeMatchText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const normalizeEmail = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

const GENERIC_MATCH_TEXTS = new Set(['cliente puntual'])

const buildLocalSlot = (date: Date | string, time: string) => `${toCalendarDatePart(date)}T${time}`

const pad2 = (value: number) => String(value).padStart(2, '0')

const parseLocalSlot = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) {
    return null
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
    hour: Number.parseInt(match[4], 10),
    minute: Number.parseInt(match[5], 10)
  }
}

const shiftLocalSlot = (value: string, minuteDelta: number) => {
  const parsed = parseLocalSlot(value)
  if (!parsed) {
    return null
  }

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute + minuteDelta))
  return `${shifted.toISOString().slice(0, 10)}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

const getFormatterPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((part) => part.type === type)?.value || ''

const normalizeOffsetText = (value: string) => {
  const normalized = String(value || '')
    .replace(/^GMT/i, '')
    .replace(/^UTC/i, '')
    .trim()

  if (!normalized || normalized === '0') {
    return '+00:00'
  }

  const compactMatch = /^([+-])(\d{1,2})$/.exec(normalized)
  if (compactMatch) {
    return `${compactMatch[1]}${compactMatch[2].padStart(2, '0')}:00`
  }

  const withMinutesMatch = /^([+-])(\d{1,2}):(\d{2})$/.exec(normalized)
  if (withMinutesMatch) {
    return `${withMinutesMatch[1]}${withMinutesMatch[2].padStart(2, '0')}:${withMinutesMatch[3]}`
  }

  const packedMinutesMatch = /^([+-])(\d{2})(\d{2})$/.exec(normalized)
  if (packedMinutesMatch) {
    return `${packedMinutesMatch[1]}${packedMinutesMatch[2]}:${packedMinutesMatch[3]}`
  }

  return '+00:00'
}

const getMadridOffset = (value: Date) => {
  const parts = MADRID_OFFSET_FORMATTER.formatToParts(value)
  return normalizeOffsetText(getFormatterPart(parts, 'timeZoneName'))
}

const buildMadridRangeBoundary = (value: string, minuteDelta: number) => {
  const shiftedSlot = shiftLocalSlot(value, minuteDelta)
  if (!shiftedSlot) {
    return null
  }

  const instant = new Date(`${shiftedSlot}:00.000Z`)
  if (Number.isNaN(instant.getTime())) {
    return null
  }

  const offset = instant ? getMadridOffset(instant) : '+00:00'
  return `${shiftedSlot}:00${offset}`
}

const buildRemoteSlot = (value: string | null) => {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  const datePart = parsed.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const timePart = parsed.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })

  return `${datePart}T${timePart}`
}

const buildRemoteCandidate = (event: CalendarEventListItem): RemoteCalendarCandidate => {
  const combinedText = normalizeMatchText(`${event.summary}\n${event.description}`)

  return {
    ...event,
    titleMatchText: normalizeMatchText(event.summary),
    combinedText,
    startSlot: buildRemoteSlot(event.startDateTime),
    endSlot: buildRemoteSlot(event.endDateTime)
  }
}

const isMeaningfulMatchText = (value: string) => Boolean(value) && !GENERIC_MATCH_TEXTS.has(value)

const deriveAppointmentServiceText = (input: AppointmentSyncInput) => {
  const normalizedTitle = normalizeMatchText(input.title)
  const clientNameText = normalizeMatchText(input.clientName)

  if (!clientNameText) {
    return normalizedTitle
  }

  const suffix = ` - ${clientNameText}`
  if (normalizedTitle.endsWith(suffix)) {
    return normalizedTitle.slice(0, -suffix.length).trim()
  }

  const prefix = `${clientNameText} - `
  if (normalizedTitle.startsWith(prefix)) {
    return normalizedTitle.slice(prefix.length).trim()
  }

  return normalizedTitle
}

const scoreAppointmentCandidate = (
  appointment: AppointmentCalendarSyncRecord,
  input: AppointmentSyncInput,
  remoteEvent: RemoteCalendarCandidate
) => {
  if (remoteEvent.privateAppointmentId === appointment.id) {
    return 1000
  }

  const startSlot = buildLocalSlot(input.date, input.startTime)
  const endSlot = buildLocalSlot(input.date, input.endTime)
  if (remoteEvent.startSlot !== startSlot || remoteEvent.endSlot !== endSlot) {
    return -1
  }

  let score = 0
  if (remoteEvent.titleMatchText === normalizeMatchText(input.title)) {
    score += 60
  }

  const attendeeEmail = normalizeEmail(input.clientEmail)
  if (attendeeEmail && remoteEvent.attendeeEmails.includes(attendeeEmail)) {
    score += 35
  }

  const clientNameText = normalizeMatchText(input.clientName)
  if (isMeaningfulMatchText(clientNameText) && remoteEvent.combinedText.includes(clientNameText)) {
    score += 15
  }

  const serviceText = deriveAppointmentServiceText(input)
  if (serviceText && remoteEvent.combinedText.includes(serviceText)) {
    score += 25
  }

  return score >= 40 ? score : -1
}

const scoreAgendaBlockCandidate = (agendaBlock: LinkableAgendaBlock, remoteEvent: RemoteCalendarCandidate) => {
  if (remoteEvent.privateAppointmentId === agendaBlock.id) {
    return 1000
  }

  const startSlot = buildLocalSlot(agendaBlock.date, agendaBlock.startTime)
  const endSlot = buildLocalSlot(agendaBlock.date, agendaBlock.endTime)
  if (remoteEvent.startSlot !== startSlot || remoteEvent.endSlot !== endSlot) {
    return -1
  }

  const titleText = normalizeMatchText(buildAgendaBlockSyncInput(agendaBlock).title)
  let score = remoteEvent.titleMatchText === titleText ? 60 : 0

  const professionalLineText = normalizeMatchText(`Profesional: ${agendaBlock.professional}`)
  if (remoteEvent.combinedText.includes(professionalLineText)) {
    score += 20
  }

  const cabinLineText = normalizeMatchText(`Cabina: ${formatCabinLabel(agendaBlock.cabin)}`)
  if (remoteEvent.combinedText.includes(cabinLineText)) {
    score += 20
  }

  return score >= 40 ? score : -1
}

const pickBestRemoteEvent = (
  remoteEvents: RemoteCalendarCandidate[],
  claimedEventIds: Set<string>,
  scoreCandidate: (remoteEvent: RemoteCalendarCandidate) => number
) => {
  let bestEvent: RemoteCalendarCandidate | null = null
  let bestScore = -1
  let hasTie = false

  for (const remoteEvent of remoteEvents) {
    if (claimedEventIds.has(remoteEvent.id) || remoteEvent.status === 'cancelled') {
      continue
    }

    const score = scoreCandidate(remoteEvent)
    if (score < 0) {
      continue
    }

    if (score > bestScore) {
      bestEvent = remoteEvent
      bestScore = score
      hasTie = false
      continue
    }

    if (score === bestScore) {
      hasTie = true
    }
  }

  if (hasTie) {
    return {
      event: null,
      reason: 'ambiguous' as const
    }
  }

  return {
    event: bestEvent,
    reason: bestEvent ? ('matched' as const) : ('missing' as const)
  }
}

const buildRemoteSearchWindow = (
  appointments: AppointmentCalendarSyncRecord[],
  agendaBlocks: LinkableAgendaBlock[]
) => {
  const startSlots = appointments.map((appointment) => buildLocalSlot(appointment.date, appointment.startTime))
  const endSlots = appointments.map((appointment) => buildLocalSlot(appointment.date, appointment.endTime))

  for (const agendaBlock of agendaBlocks) {
    startSlots.push(buildLocalSlot(agendaBlock.date, agendaBlock.startTime))
    endSlots.push(buildLocalSlot(agendaBlock.date, agendaBlock.endTime))
  }

  if (startSlots.length === 0 || endSlots.length === 0) {
    return null
  }

  let minStartSlot = startSlots[0]
  let maxEndSlot = endSlots[0]

  for (const startSlot of startSlots.slice(1)) {
    if (startSlot < minStartSlot) {
      minStartSlot = startSlot
    }
  }

  for (const endSlot of endSlots.slice(1)) {
    if (endSlot > maxEndSlot) {
      maxEndSlot = endSlot
    }
  }

  const timeMin = buildMadridRangeBoundary(minStartSlot, -120)
  const timeMax = buildMadridRangeBoundary(maxEndSlot, 120)
  if (!timeMin || !timeMax) {
    return null
  }

  return {
    timeMin,
    timeMax
  }
}

const buildAppointmentReviewLabel = (
  appointment: AppointmentCalendarSyncRecord,
  input: AppointmentSyncInput
) => `${toCalendarDatePart(appointment.date)} ${appointment.startTime} ${input.title}`

const buildAgendaBlockReviewLabel = (agendaBlock: LinkableAgendaBlock) =>
  `${toCalendarDatePart(agendaBlock.date)} ${agendaBlock.startTime} ${buildAgendaBlockSyncInput(agendaBlock).title}`

export const linkExistingAgendaEntries = async (
  options: SyncCalendarOptions = {}
): Promise<AppointmentCalendarSyncSummary> => {
  const config = await googleCalendarService.getConfig()
  if (!config) {
    return buildSummary(emptyEntitySummary(), emptyEntitySummary())
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(options.appointmentIds ? { id: { in: options.appointmentIds } } : {}),
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      googleCalendarEventId: null
    },
    include: appointmentCalendarSyncInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  })

  const agendaBlocks = await prisma.agendaBlock.findMany({
    where: {
      ...(options.agendaBlockIds ? { id: { in: options.agendaBlockIds } } : {}),
      googleCalendarEventId: null
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

  const remoteWindow = buildRemoteSearchWindow(appointments, agendaBlocks)
  if (!remoteWindow) {
    return buildSummary(emptyEntitySummary(), emptyEntitySummary())
  }

  logInfo('Starting Google Calendar link-only reconciliation', {
    reason: options.reason || null,
    appointments: appointments.length,
    agendaBlocks: agendaBlocks.length
  })

  const remoteEvents = (await googleCalendarService.listEventsInRange(remoteWindow)).map(buildRemoteCandidate)
  const claimedEventIds = new Set<string>()
  const ambiguousMatches: string[] = []

  const appointmentSummary: CalendarSyncEntitySummary = {
    total: appointments.length,
    synced: 0,
    failed: 0,
    skipped: 0
  }
  const agendaBlockSummary: CalendarSyncEntitySummary = {
    total: agendaBlocks.length,
    synced: 0,
    failed: 0,
    skipped: 0
  }

  for (const appointment of appointments) {
    const input = buildAppointmentCalendarSyncInput(appointment)
    const matchResult = pickBestRemoteEvent(remoteEvents, claimedEventIds, (remoteEvent) =>
      scoreAppointmentCandidate(appointment, input, remoteEvent)
    )
    const matchedEvent = matchResult.event

    if (!matchedEvent) {
      appointmentSummary.skipped += 1
      if (matchResult.reason === 'ambiguous') {
        ambiguousMatches.push(buildAppointmentReviewLabel(appointment, input))
      }
      continue
    }

    claimedEventIds.add(matchedEvent.id)
    await linkExistingAppointmentEvent(appointment.id, matchedEvent.id)
    appointmentSummary.synced += 1
  }

  for (const agendaBlock of agendaBlocks) {
    const matchResult = pickBestRemoteEvent(remoteEvents, claimedEventIds, (remoteEvent) =>
      scoreAgendaBlockCandidate(agendaBlock, remoteEvent)
    )
    const matchedEvent = matchResult.event

    if (!matchedEvent) {
      agendaBlockSummary.skipped += 1
      if (matchResult.reason === 'ambiguous') {
        ambiguousMatches.push(buildAgendaBlockReviewLabel(agendaBlock))
      }
      continue
    }

    claimedEventIds.add(matchedEvent.id)
    await linkExistingAgendaBlockEvent(agendaBlock.id, matchedEvent.id)
    agendaBlockSummary.synced += 1
  }

  await notifyGoogleCalendarLinkReviewNeeded({
    ambiguousCount: ambiguousMatches.length,
    examples: ambiguousMatches
  })

  const summary = buildSummary(appointmentSummary, agendaBlockSummary)
  logInfo('Processed Google Calendar link-only reconciliation', {
    reason: options.reason || null,
    summary
  })

  return summary
}
