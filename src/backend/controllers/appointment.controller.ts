import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from '../utils/customer-display'
import { logError, logWarn } from '../utils/logger'
import { isActiveAppointmentStatus, validateAppointmentSlot } from '../utils/appointment-validation'
import {
  AppointmentImportClientRecord,
  AppointmentImportServiceRecord,
  AppointmentSpreadsheetIssue,
  AppointmentSpreadsheetResult,
  buildAppointmentsExportWorkbook,
  buildNormalizedAppointmentImportRow,
  isLikelyAgendaBlockRow,
  loadAppointmentRowsFromBuffer,
  matchAppointmentClient,
  matchAppointmentService,
  parseAppointmentDate,
  parseAppointmentMinutes,
  parseAppointmentTime,
  resolveAppointmentCabin,
  resolveAppointmentEndTime,
  resolveAppointmentProfessional
} from '../utils/appointment-spreadsheet'
import {
  calculateAppointmentEndTime,
  deriveAppointmentServiceIds,
  getAppointmentServiceLabel
} from '../utils/appointment-services'
import {
  findUnknownProfessionalNames,
  getDefaultProfessionalName,
  getProfessionalCatalog,
  normalizeProfessionalName
} from '../utils/professional-catalog'

const appointmentInclude = {
  client: true,
  user: {
    select: { id: true, name: true, email: true }
  },
  service: true,
  appointmentServices: {
    include: {
      service: true
    },
    orderBy: {
      sortOrder: 'asc' as const
    }
  },
  sale: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      paymentMethod: true,
      status: true,
      date: true
    }
  }
} satisfies Prisma.AppointmentInclude

const toDate = (value: string | Date) => new Date(value)

const normalizeNullableText = (value: unknown) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

const normalizeNullableId = (value: unknown) => {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

const hasText = (value: unknown) => Boolean(String(value ?? '').trim())

const resolveProfessionalName = async (_userId: unknown, professional: unknown) => {
  const normalizedProfessional = normalizeProfessionalName(professional)
  if (normalizedProfessional) {
    return normalizedProfessional
  }

  const defaultProfessional = await getDefaultProfessionalName()
  if (defaultProfessional) {
    return defaultProfessional
  }

  return ''
}

const appointmentServiceSelection = {
  id: true,
  name: true,
  duration: true,
  category: true,
  serviceCode: true
} satisfies Prisma.ServiceSelect

type SelectedAppointmentService = Prisma.ServiceGetPayload<{ select: typeof appointmentServiceSelection }>

const getExistingAppointmentServiceIds = (appointment: {
  serviceId?: string | null
  appointmentServices?: Array<{ serviceId?: string | null }> | null
}) => {
  const nestedServiceIds = Array.isArray(appointment.appointmentServices)
    ? appointment.appointmentServices
        .map((item) => String(item.serviceId || '').trim())
        .filter(Boolean)
    : []

  if (nestedServiceIds.length > 0) {
    return nestedServiceIds
  }

  const fallbackServiceId = String(appointment.serviceId || '').trim()
  return fallbackServiceId ? [fallbackServiceId] : []
}

const loadSelectedAppointmentServices = async (serviceIds: string[]) => {
  const normalizedServiceIds = deriveAppointmentServiceIds({ serviceIds })
  if (normalizedServiceIds.length === 0) {
    return []
  }

  const services = await prisma.service.findMany({
    where: {
      id: {
        in: normalizedServiceIds
      }
    },
    select: appointmentServiceSelection
  })

  const servicesById = new Map(services.map((service) => [service.id, service]))
  const orderedServices = normalizedServiceIds
    .map((serviceId) => servicesById.get(serviceId) || null)
    .filter((service): service is SelectedAppointmentService => Boolean(service))

  if (orderedServices.length !== normalizedServiceIds.length) {
    throw new Error('Uno o más servicios seleccionados no existen')
  }

  return orderedServices
}

const buildAppointmentServicesCreateData = (serviceIds: string[]) =>
  serviceIds.map((serviceId, index) => ({
    serviceId,
    sortOrder: index
  }))

const buildAppointmentPayload = (
  payload: Record<string, unknown>,
  options: { serviceId: string; endTime: string }
): Prisma.AppointmentUncheckedCreateInput => {
  const clientId = normalizeNullableId(payload.clientId)

  return {
    clientId,
    guestName: clientId ? null : normalizeNullableText(payload.guestName),
    guestPhone: clientId ? null : normalizeNullableText(payload.guestPhone),
    userId: String(payload.userId),
    serviceId: options.serviceId,
    cabin: payload.cabin as string,
    professional: normalizeProfessionalName(payload.professional),
    date: toDate(String(payload.date)),
    startTime: String(payload.startTime),
    endTime: options.endTime,
    status: payload.status as string,
    notes: payload.notes ? String(payload.notes) : null,
    reminder: payload.reminder === undefined ? true : Boolean(payload.reminder)
  }
}

const buildAppointmentUpdatePayload = (
  payload: Record<string, unknown>,
  options: { serviceId?: string; endTime?: string } = {}
): Prisma.AppointmentUncheckedUpdateInput => {
  const data: Prisma.AppointmentUncheckedUpdateInput = {}

  if (payload.clientId !== undefined) data.clientId = normalizeNullableId(payload.clientId)
  if (payload.guestName !== undefined) data.guestName = normalizeNullableText(payload.guestName)
  if (payload.guestPhone !== undefined) data.guestPhone = normalizeNullableText(payload.guestPhone)
  if (payload.userId !== undefined) data.userId = String(payload.userId)
  if (options.serviceId !== undefined) data.serviceId = options.serviceId
  if (payload.cabin !== undefined) data.cabin = payload.cabin as string
  if (payload.professional !== undefined) data.professional = normalizeProfessionalName(payload.professional)
  if (payload.date !== undefined) data.date = toDate(String(payload.date))
  if (payload.startTime !== undefined) data.startTime = String(payload.startTime)
  if (options.endTime !== undefined) data.endTime = options.endTime
  if (payload.status !== undefined) data.status = payload.status as string
  if (payload.notes !== undefined) data.notes = payload.notes ? String(payload.notes) : null
  if (payload.reminder !== undefined) data.reminder = Boolean(payload.reminder)

  return data
}

const buildCalendarSyncInput = (appointment: any): AppointmentSyncInput => {
  const clientName = getAppointmentDisplayName(appointment)
  const phone = getAppointmentDisplayPhone(appointment)
  const phoneLine = phone ? `\nTelefono: ${phone}` : ''
  const serviceLabel = getAppointmentServiceLabel(appointment) || String(appointment.service?.name || '').trim()

  return {
    appointmentId: appointment.id,
    existingEventId: appointment.googleCalendarEventId || null,
    title: `${serviceLabel} - ${clientName}`,
    description: `Cita para ${serviceLabel}\nCliente: ${clientName}${phoneLine}`,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    clientEmail: getAppointmentDisplayEmail(appointment),
    clientName
  }
}

const validateAppointmentPartyUpdate = (
  existing: {
    clientId?: string | null
    guestName?: string | null
    guestPhone?: string | null
  },
  updateData: Prisma.AppointmentUncheckedUpdateInput
) => {
  const existingIsGuest = !existing.clientId
  const nextClientId =
    updateData.clientId !== undefined ? (updateData.clientId as string | null) : existing.clientId || null
  const nextGuestName =
    updateData.guestName !== undefined ? (updateData.guestName as string | null) : existing.guestName || null
  const nextGuestPhone =
    updateData.guestPhone !== undefined ? (updateData.guestPhone as string | null) : existing.guestPhone || null
  const nextIsGuest = !nextClientId

  if (existingIsGuest !== nextIsGuest) {
    return 'No se puede cambiar una cita entre cliente registrado y cliente puntual'
  }

  if (!nextIsGuest && (hasText(nextGuestName) || hasText(nextGuestPhone))) {
    return 'Las citas de clientes registrados no pueden incluir datos de cliente puntual'
  }

  if (nextIsGuest && (!hasText(nextGuestName) || !hasText(nextGuestPhone))) {
    return 'Las citas puntuales deben conservar nombre y telefono'
  }

  return null
}

const releaseReservedBonoSessions = async (appointmentId: string) => {
  await prisma.bonoSession.updateMany({
    where: {
      appointmentId,
      status: 'AVAILABLE'
    },
    data: {
      appointmentId: null
    }
  })
}

const normalizeLegendName = (value: unknown) => String(value || '').trim()
const normalizeLegendColor = (value: unknown) => String(value || '').trim().toUpperCase()
const normalizeLegendMatch = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()

const mapAppointmentLegend = (legend: {
  id: string
  name: string
  color: string
  sortOrder: number
}) => ({
  id: legend.id,
  category: legend.name,
  color: legend.color,
  sortOrder: legend.sortOrder
})

const getAppointmentLegendCategoriesCatalog = async () => {
  const services = await prisma.service.findMany({
    select: {
      category: true
    },
    orderBy: {
      category: 'asc'
    }
  })

  const categoriesByKey = new Map<string, string>()

  for (const service of services) {
    const category = String(service.category || '').trim()
    const key = normalizeLegendMatch(category)
    if (!key || categoriesByKey.has(key)) continue
    categoriesByKey.set(key, category)
  }

  return [...categoriesByKey.values()].sort((left, right) =>
    left.localeCompare(right, 'es', { sensitivity: 'base' })
  )
}

const persistCalendarSyncResult = async (appointmentId: string, syncResult: Awaited<ReturnType<typeof googleCalendarService.upsertAppointmentEvent>>) => {
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

const buildAppointmentsWhere = (query: {
  startDate?: unknown
  endDate?: unknown
  status?: unknown
  clientId?: unknown
  cabin?: unknown
}) => {
  const where: Prisma.AppointmentWhereInput = {}

  if (query.startDate && query.endDate) {
    where.date = {
      gte: new Date(String(query.startDate)),
      lte: new Date(String(query.endDate))
    }
  }

  if (query.status) where.status = String(query.status)
  if (query.clientId) where.clientId = String(query.clientId)
  if (query.cabin) where.cabin = String(query.cabin)

  return where
}

const toAppointmentSpreadsheetError = (row: number, message: string): AppointmentSpreadsheetIssue => ({
  row,
  error: `Fila ${row}: ${message}`
})

const normalizeAppointmentImportError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return 'Error desconocido al importar la fila'
}

const selectAppointmentImportCatalogs = async () => {
  const [clients, services] = await Promise.all([
    prisma.client.findMany({
      select: {
        id: true,
        externalCode: true,
        firstName: true,
        lastName: true,
        fullName: true,
        phone: true,
        mobilePhone: true,
        landlinePhone: true,
        email: true
      }
    }),
    prisma.service.findMany({
      select: {
        id: true,
        serviceCode: true,
        name: true,
        duration: true,
        isActive: true,
        createdAt: true
      }
    })
  ])

  return {
    clients: clients as AppointmentImportClientRecord[],
    services: services as AppointmentImportServiceRecord[]
  }
}

type AppointmentImportMode = 'preview' | 'commit'

type MissingAppointmentClientCandidate = {
  key: string
  clientCode: string | null
  clientName: string
  phone: string | null
  email: string | null
  firstName: string
  lastName: string
  phoneForRecord: string
}

type AppointmentImportMissingClientSummary = {
  key: string
  clientCode: string | null
  clientName: string
  phone: string | null
  email: string | null
  rows: number[]
  action?: 'created' | 'skipped'
}

type AppointmentImportDuplicateSummary = {
  row: number
  message: string
}

type AppointmentImportConflictSummary = {
  row: number
  message: string
}

type PreparedAppointmentImportRow =
  | {
      kind: 'ready'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      date: Date
      startTime: string
      endTime: string
      minutes: number
      cabin: string
      professional: string
      notes: string | null
      clientId: string
      serviceId: string
      serviceName: string
      clientName: string
      importKey: string
    }
  | {
      kind: 'missing-client'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      date: Date
      startTime: string
      endTime: string
      minutes: number
      cabin: string
      professional: string
      notes: string | null
      serviceId: string
      serviceName: string
      missingClient: MissingAppointmentClientCandidate
    }
  | {
      kind: 'block' | 'error'
      rowNumber: number
      row: ReturnType<typeof buildNormalizedAppointmentImportRow>
      message: string
    }

const isPreparedReadyEntry = (
  entry: PreparedAppointmentImportRow
): entry is Extract<PreparedAppointmentImportRow, { kind: 'ready' }> => entry.kind === 'ready'

const isPreparedMissingClientEntry = (
  entry: PreparedAppointmentImportRow
): entry is Extract<PreparedAppointmentImportRow, { kind: 'missing-client' }> => entry.kind === 'missing-client'

const isPreparedActionableEntry = (
  entry: PreparedAppointmentImportRow
): entry is Extract<PreparedAppointmentImportRow, { kind: 'ready' | 'missing-client' }> =>
  isPreparedReadyEntry(entry) || isPreparedMissingClientEntry(entry)

const normalizeImportIdentity = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const normalizeImportPhone = (value: unknown) => String(value ?? '').replace(/\D+/g, '')

const normalizeImportEmail = (value: unknown) => {
  const email = String(value ?? '').trim().toLowerCase()
  return email && email.includes('@') ? email : null
}

const collapseWhitespace = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')

const formatAppointmentImportDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const splitImportedClientName = (value: unknown) => {
  const normalizedName = collapseWhitespace(value)
  if (!normalizedName) {
    return {
      firstName: 'SIN_NOMBRE',
      lastName: 'SIN_APELLIDOS'
    }
  }

  const tokens = normalizedName.split(' ')
  if (tokens.length === 1) {
    return {
      firstName: tokens[0],
      lastName: 'SIN_APELLIDOS'
    }
  }

  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' ')
  }
}

const buildMissingAppointmentClientCandidate = (
  rowNumber: number,
  row: ReturnType<typeof buildNormalizedAppointmentImportRow>
): MissingAppointmentClientCandidate => {
  const clientCode = normalizeNullableText(row.clientCode)
  const clientName = collapseWhitespace(row.clientName) || (clientCode ? `Cliente ${clientCode}` : 'Cliente importado')
  const phone = normalizeNullableText(row.phone)
  const email = normalizeImportEmail(row.email)
  const { firstName, lastName } = splitImportedClientName(clientName)
  const identityKey =
    (clientCode && `code:${normalizeImportIdentity(clientCode)}`) ||
    (email && `email:${normalizeImportIdentity(email)}`) ||
    (phone && `phone:${normalizeImportPhone(phone)}`) ||
    `name:${normalizeImportIdentity(clientName)}`

  return {
    key: identityKey,
    clientCode,
    clientName,
    phone,
    email,
    firstName,
    lastName,
    phoneForRecord: phone || `NO_PHONE_IMPORT_${clientCode || rowNumber}`
  }
}

const buildAppointmentImportKey = (input: {
  date: Date
  startTime: string
  endTime: string
  professional: string
  cabin: string
  serviceId: string
  clientId: string
}) =>
  [
    formatAppointmentImportDateKey(input.date),
    input.startTime,
    input.endTime,
    normalizeProfessionalName(input.professional),
    input.cabin,
    input.serviceId,
    input.clientId
  ].join('|')

const buildPreparedRowLabel = (
  rowNumber: number,
  clientName: string,
  serviceName: string,
  date: Date,
  startTime: string
) => {
  return `Fila ${rowNumber}: ${clientName} · ${formatAppointmentImportDateKey(date)} ${startTime} · ${serviceName}`
}

const buildDuplicateSummary = (
  rowNumber: number,
  clientName: string,
  serviceName: string,
  date: Date,
  startTime: string,
  reason: 'existing' | 'file'
): AppointmentImportDuplicateSummary => ({
  row: rowNumber,
  message:
    reason === 'existing'
      ? `${buildPreparedRowLabel(rowNumber, clientName, serviceName, date, startTime)} ya existe en la agenda`
      : `${buildPreparedRowLabel(rowNumber, clientName, serviceName, date, startTime)} está repetida dentro del Excel`
})

const previewCabinLabels: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CABINA_1: 'Cabina 1',
  CABINA_2: 'Cabina 2'
}

const formatPreviewProfessionalLabel = (professional: string) => normalizeProfessionalName(professional) || professional

const buildAppointmentImportConflictSummary = (row: number, message: string): AppointmentImportConflictSummary => ({
  row,
  message: `Fila ${row}: ${message}`
})

const timeRangesOverlap = (leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) =>
  leftStart < rightEnd && leftEnd > rightStart

const findAppointmentImportPlannedConflicts = (
  current: Extract<PreparedAppointmentImportRow, { kind: 'ready' | 'missing-client' }>,
  plannedEntries: Array<Extract<PreparedAppointmentImportRow, { kind: 'ready' | 'missing-client' }>>
) => {
  const conflicts: string[] = []

  for (const planned of plannedEntries) {
    if (formatAppointmentImportDateKey(planned.date) !== formatAppointmentImportDateKey(current.date)) {
      continue
    }

    if (!timeRangesOverlap(planned.startTime, planned.endTime, current.startTime, current.endTime)) {
      continue
    }

    if (planned.professional === current.professional) {
      conflicts.push(
        `${formatPreviewProfessionalLabel(current.professional)} ya tiene una cita de ${planned.startTime} a ${planned.endTime}`
      )
    }

    if (planned.cabin === current.cabin) {
      conflicts.push(
        `La cabina ${previewCabinLabels[current.cabin] || current.cabin} ya esta ocupada de ${planned.startTime} a ${planned.endTime}`
      )
    }
  }

  return [...new Set(conflicts)]
}

const buildMissingClientSummaryMap = (preparedRows: PreparedAppointmentImportRow[]) => {
  const summaries = new Map<string, AppointmentImportMissingClientSummary>()

  for (const entry of preparedRows) {
    if (entry.kind !== 'missing-client') continue

    const current = summaries.get(entry.missingClient.key)
    if (current) {
      current.rows.push(entry.rowNumber)
      continue
    }

    summaries.set(entry.missingClient.key, {
      key: entry.missingClient.key,
      clientCode: entry.missingClient.clientCode,
      clientName: entry.missingClient.clientName,
      phone: entry.missingClient.phone,
      email: entry.missingClient.email,
      rows: [entry.rowNumber]
    })
  }

  return summaries
}

const pushMissingClientOutcome = (
  summaryMap: Map<string, AppointmentImportMissingClientSummary>,
  candidate: MissingAppointmentClientCandidate,
  rowNumber: number,
  action: 'created' | 'skipped'
) => {
  const current = summaryMap.get(candidate.key)
  if (current) {
    if (!current.rows.includes(rowNumber)) {
      current.rows.push(rowNumber)
    }
    current.action = action
    return
  }

  summaryMap.set(candidate.key, {
    key: candidate.key,
    clientCode: candidate.clientCode,
    clientName: candidate.clientName,
    phone: candidate.phone,
    email: candidate.email,
    rows: [rowNumber],
    action
  })
}

const selectExistingImportAppointmentKeys = async (preparedRows: PreparedAppointmentImportRow[]) => {
  const uniqueDateKeys = [...new Set(
    preparedRows
      .filter(isPreparedActionableEntry)
      .map((entry) => formatAppointmentImportDateKey(entry.date))
  )]

  if (uniqueDateKeys.length === 0) {
    return new Set<string>()
  }

  const dateClauses = uniqueDateKeys.map((dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number)
    const start = new Date(year, month - 1, day, 0, 0, 0, 0)
    const end = new Date(year, month - 1, day, 23, 59, 59, 999)
    return { date: { gte: start, lte: end } }
  })

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
      OR: dateClauses
    },
    select: {
      clientId: true,
      serviceId: true,
      date: true,
      startTime: true,
      endTime: true,
      professional: true,
      cabin: true
    }
  })

  const keys = new Set<string>()
  for (const appointment of appointments) {
    if (!appointment.clientId) continue

    keys.add(
      buildAppointmentImportKey({
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        professional: normalizeProfessionalName(appointment.professional),
        cabin: appointment.cabin,
        serviceId: appointment.serviceId,
        clientId: appointment.clientId
      })
    )
  }

  return keys
}

const buildAppointmentImportPreview = async (
  preparedRows: PreparedAppointmentImportRow[],
  existingImportKeys: Set<string>
) => {
  const duplicateIssues: AppointmentImportDuplicateSummary[] = []
  const conflictIssues: AppointmentImportConflictSummary[] = []
  const errorIssues: AppointmentSpreadsheetIssue[] = []
  const blockIssues: AppointmentSpreadsheetIssue[] = []
  const plannedKeys = new Set<string>()
  const plannedEntries: Array<Extract<PreparedAppointmentImportRow, { kind: 'ready' | 'missing-client' }>> = []
  let ready = 0

  for (const entry of preparedRows) {
    if (entry.kind === 'error') {
      errorIssues.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    if (entry.kind === 'block') {
      blockIssues.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
      continue
    }

    if (isPreparedMissingClientEntry(entry)) {
      const validation = await validateAppointmentSlot(
        {
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          professional: entry.professional,
          cabin: entry.cabin,
          allowPastDate: true
        },
        prisma
      )
      const plannedConflicts = findAppointmentImportPlannedConflicts(entry, plannedEntries)
      const allConflictMessages = [
        ...validation.errors.map((validationError) => validationError.message),
        ...plannedConflicts
      ]

      if (allConflictMessages.length > 0) {
        conflictIssues.push(
          buildAppointmentImportConflictSummary(entry.rowNumber, [...new Set(allConflictMessages)].join('; '))
        )
        continue
      }

      plannedEntries.push(entry)
      continue
    }

    if (!isPreparedReadyEntry(entry)) {
      continue
    }

    if (existingImportKeys.has(entry.importKey)) {
      duplicateIssues.push(
        buildDuplicateSummary(
          entry.rowNumber,
          entry.clientName,
          entry.serviceName,
          entry.date,
          entry.startTime,
          'existing'
        )
      )
      continue
    }

    if (plannedKeys.has(entry.importKey)) {
      duplicateIssues.push(
        buildDuplicateSummary(
          entry.rowNumber,
          entry.clientName,
          entry.serviceName,
          entry.date,
          entry.startTime,
          'file'
        )
      )
      continue
    }

    const validation = await validateAppointmentSlot(
      {
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        professional: entry.professional,
        cabin: entry.cabin,
        allowPastDate: true
      },
      prisma
    )
    const plannedConflicts = findAppointmentImportPlannedConflicts(entry, plannedEntries)
    const allConflictMessages = [
      ...validation.errors.map((validationError) => validationError.message),
      ...plannedConflicts
    ]

    if (allConflictMessages.length > 0) {
      conflictIssues.push(
        buildAppointmentImportConflictSummary(entry.rowNumber, [...new Set(allConflictMessages)].join('; '))
      )
      continue
    }

    plannedKeys.add(entry.importKey)
    plannedEntries.push(entry)
    ready += 1
  }

  return {
    totalRows: preparedRows.length,
    ready,
    detectedProfessionals: [],
    duplicates: duplicateIssues,
    missingClients: [...buildMissingClientSummaryMap(preparedRows).values()].sort((left, right) =>
      left.clientName.localeCompare(right.clientName, 'es', { sensitivity: 'base' })
    ),
    blocks: blockIssues,
    conflicts: conflictIssues,
    errors: errorIssues
  }
}

const prepareAppointmentImportRows = (
  rawRows: Record<string, unknown>[],
  catalogs: {
    clients: AppointmentImportClientRecord[]
    services: AppointmentImportServiceRecord[]
  }
): PreparedAppointmentImportRow[] => {
  const preparedRows: PreparedAppointmentImportRow[] = []

  for (let index = 0; index < rawRows.length; index += 1) {
    const rowNumber = index + 2
    const row = buildNormalizedAppointmentImportRow(rawRows[index] || {})

    try {
      if (isLikelyAgendaBlockRow(row)) {
        preparedRows.push({
          kind: 'block',
          rowNumber,
          row,
          message: `La fila parece un bloqueo o nota de agenda (${String(row.clientName || 'sin titulo').trim()}). Los bloqueos se importaran en una fase posterior`
        })
        continue
      }

      const date = parseAppointmentDate(row.date)
      if (!date) throw new Error('Fecha invalida')

      const startTime = parseAppointmentTime(row.time)
      if (!startTime) throw new Error('Hora invalida')

      const minutes = parseAppointmentMinutes(row.minutes)
      if (!minutes) throw new Error('Minutos invalidos')

      const serviceMatch = matchAppointmentService(
        catalogs.services,
        row.serviceCode,
        row.serviceDescription,
        minutes
      )
      if (!serviceMatch.service || serviceMatch.error) {
        throw new Error(serviceMatch.error || 'Tratamiento invalido')
      }

      const professional = resolveAppointmentProfessional(row.professional, null)
      const cabin = resolveAppointmentCabin(row.cabin, professional)
      const resolvedProfessional = resolveAppointmentProfessional(row.professional, cabin)
      if (!resolvedProfessional) throw new Error('Profesional invalido')
      const endTime = resolveAppointmentEndTime(startTime, minutes)
      const notes = row.notes ? String(row.notes).trim() || null : null
      const clientMatch = matchAppointmentClient(catalogs.clients, {
        clientCode: row.clientCode,
        clientName: row.clientName,
        phone: row.phone,
        email: row.email
      })

      if (clientMatch.status === 'missing') {
        preparedRows.push({
          kind: 'missing-client',
          rowNumber,
          row,
          date,
          startTime,
          endTime,
          minutes,
          cabin,
          professional: resolvedProfessional,
          notes,
          serviceId: serviceMatch.service.id,
          serviceName: String(serviceMatch.service.name || row.serviceDescription || '').trim(),
          missingClient: buildMissingAppointmentClientCandidate(rowNumber, row)
        })
        continue
      }

      if (!clientMatch.client || clientMatch.error) {
        throw new Error(clientMatch.error || 'Cliente invalido')
      }

      preparedRows.push({
        kind: 'ready',
        rowNumber,
        row,
        date,
        startTime,
        endTime,
        minutes,
        cabin,
        professional: resolvedProfessional,
        notes,
        clientId: clientMatch.client.id,
        serviceId: serviceMatch.service.id,
        serviceName: String(serviceMatch.service.name || row.serviceDescription || '').trim(),
        clientName: collapseWhitespace(row.clientName) || `${clientMatch.client.firstName || ''} ${clientMatch.client.lastName || ''}`.trim(),
        importKey: buildAppointmentImportKey({
          date,
          startTime,
          endTime,
          professional: resolvedProfessional,
          cabin,
          serviceId: serviceMatch.service.id,
          clientId: clientMatch.client.id
        })
      })
    } catch (error) {
      preparedRows.push({
        kind: 'error',
        rowNumber,
        row,
        message: normalizeAppointmentImportError(error)
      })
    }
  }

  return preparedRows
}

const createClientFromAppointmentImport = async (
  candidate: MissingAppointmentClientCandidate
): Promise<AppointmentImportClientRecord> => {
  const createdClient = await prisma.client.create({
    data: {
      externalCode: candidate.clientCode,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: `${candidate.firstName} ${candidate.lastName}`.trim(),
      phone: candidate.phoneForRecord,
      mobilePhone: candidate.phone || null,
      email: candidate.email,
      notes: 'Ficha creada automáticamente al importar citas desde Excel.',
      isActive: true
    },
    select: {
      id: true,
      externalCode: true,
      firstName: true,
      lastName: true,
      fullName: true,
      phone: true,
      mobilePhone: true,
      landlinePhone: true,
      email: true
    }
  })

  return createdClient as AppointmentImportClientRecord
}

export const getAppointments = async (req: Request, res: Response) => {
  try {
    const where = buildAppointmentsWhere(req.query)

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    res.json(appointments)
  } catch (error) {
    logError('Get appointments error', error, { query: req.query })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const { date } = req.params
    const targetDate = new Date(`${date}T00:00:00.000Z`)

    const startOfDay = new Date(targetDate)
    startOfDay.setUTCHours(0, 0, 0, 0)

    const endOfDay = new Date(targetDate)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const appointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: appointmentInclude,
      orderBy: [{ cabin: 'asc' }, { startTime: 'asc' }]
    })

    res.json(appointments)
  } catch (error) {
    logError('Get appointments by date error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const exportAppointments = async (req: Request, res: Response) => {
  try {
    const where = buildAppointmentsWhere(req.query)
    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    })

    const workbook = buildAppointmentsExportWorkbook(appointments as any[])
    const buffer = await workbook.xlsx.writeBuffer()

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="appointments.xlsx"')
    res.send(Buffer.from(buffer))
  } catch (error) {
    logError('Export appointments error', error, { query: req.query })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importAppointmentsFromExcel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const mode: AppointmentImportMode = req.body?.mode === 'preview' ? 'preview' : 'commit'
    const createMissingClients = Boolean(req.body?.createMissingClients)
    const rows = await loadAppointmentRowsFromBuffer(req.file.buffer)
    const catalogs = await selectAppointmentImportCatalogs()
    const preparedRows = prepareAppointmentImportRows(rows, catalogs)
    const existingImportKeys = await selectExistingImportAppointmentKeys(preparedRows)
    const configuredProfessionals = await getProfessionalCatalog()
    const detectedProfessionals = findUnknownProfessionalNames(
      preparedRows.filter(isPreparedActionableEntry).map((entry) => entry.professional),
      configuredProfessionals
    )

    if (mode === 'preview') {
      const preview = await buildAppointmentImportPreview(preparedRows, existingImportKeys)
      return res.json({
        stage: 'preview',
        preview: {
          ...preview,
          detectedProfessionals
        }
      })
    }

    const results: AppointmentSpreadsheetResult & {
      createdClients: number
      detectedProfessionals: string[]
      duplicates: AppointmentImportDuplicateSummary[]
      conflicts: AppointmentImportConflictSummary[]
      blocks: AppointmentSpreadsheetIssue[]
      missingClients: AppointmentImportMissingClientSummary[]
    } = {
      success: 0,
      skipped: 0,
      createdClients: 0,
      detectedProfessionals,
      duplicates: [],
      conflicts: [],
      blocks: [],
      missingClients: [],
      errors: []
    }
    const processedImportKeys = new Set<string>(existingImportKeys)
    const missingClientOutcomes = new Map<string, AppointmentImportMissingClientSummary>()
    const createdClientsByKey = new Map<string, AppointmentImportClientRecord>()

    for (const entry of preparedRows) {
      if (entry.kind === 'block') {
        results.skipped += 1
        results.blocks.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
        continue
      }

      if (entry.kind === 'error') {
        results.skipped += 1
        results.errors.push(toAppointmentSpreadsheetError(entry.rowNumber, entry.message))
        continue
      }

      const actionableEntry = entry as Extract<PreparedAppointmentImportRow, { kind: 'ready' | 'missing-client' }>

      try {
        let clientId = isPreparedReadyEntry(actionableEntry) ? actionableEntry.clientId : null
        let clientName = isPreparedReadyEntry(actionableEntry)
          ? actionableEntry.clientName
          : actionableEntry.missingClient.clientName

        if (isPreparedMissingClientEntry(actionableEntry)) {
          if (!createMissingClients) {
            results.skipped += 1
            pushMissingClientOutcome(
              missingClientOutcomes,
              actionableEntry.missingClient,
              actionableEntry.rowNumber,
              'skipped'
            )
            continue
          }

          let createdClient = createdClientsByKey.get(actionableEntry.missingClient.key) || null
          if (!createdClient) {
            createdClient = await createClientFromAppointmentImport(actionableEntry.missingClient)
            createdClientsByKey.set(actionableEntry.missingClient.key, createdClient)
            catalogs.clients.push(createdClient)
            results.createdClients += 1
          }

          clientId = createdClient.id
          clientName =
            `${createdClient.firstName || ''} ${createdClient.lastName || ''}`.trim() ||
            actionableEntry.missingClient.clientName
          pushMissingClientOutcome(
            missingClientOutcomes,
            actionableEntry.missingClient,
            actionableEntry.rowNumber,
            'created'
          )
        }

        if (!clientId) {
          throw new Error('Cliente invalido')
        }

        const importKey = buildAppointmentImportKey({
          date: actionableEntry.date,
          startTime: actionableEntry.startTime,
          endTime: actionableEntry.endTime,
          professional: actionableEntry.professional,
          cabin: actionableEntry.cabin,
          serviceId: actionableEntry.serviceId,
          clientId
        })

        if (processedImportKeys.has(importKey)) {
          results.skipped += 1
          results.duplicates.push(
            buildDuplicateSummary(
              actionableEntry.rowNumber,
              clientName,
              actionableEntry.serviceName,
              actionableEntry.date,
              actionableEntry.startTime,
              existingImportKeys.has(importKey) ? 'existing' : 'file'
            )
          )
          continue
        }

        const validation = await validateAppointmentSlot(
          {
            date: actionableEntry.date,
            startTime: actionableEntry.startTime,
            endTime: actionableEntry.endTime,
            professional: actionableEntry.professional,
            cabin: actionableEntry.cabin,
            allowPastDate: true
          },
          prisma
        )

        if (validation.errors.length > 0) {
          results.skipped += 1
          results.conflicts.push(
            buildAppointmentImportConflictSummary(
              actionableEntry.rowNumber,
              validation.errors.map((validationError) => validationError.message).join('; ')
            )
          )
          continue
        }

        await prisma.appointment.create({
          data: {
            clientId,
            userId: req.user.id,
            serviceId: actionableEntry.serviceId,
            cabin: actionableEntry.cabin,
            professional: actionableEntry.professional,
            date: actionableEntry.date,
            startTime: actionableEntry.startTime,
            endTime: actionableEntry.endTime,
            status: 'SCHEDULED',
            notes: actionableEntry.notes,
            reminder: true
          }
        })

        processedImportKeys.add(importKey)
        results.success += 1
      } catch (error) {
        results.skipped += 1
        results.errors.push(
          toAppointmentSpreadsheetError(actionableEntry.rowNumber, normalizeAppointmentImportError(error))
        )
      }
    }

    results.missingClients = [...missingClientOutcomes.values()].sort((left, right) =>
      left.clientName.localeCompare(right.clientName, 'es', { sensitivity: 'base' })
    )

    return res.json({
      stage: 'commit',
      results
    })
  } catch (error) {
    logError('Import appointments error', error, { userId: req.user?.id || null })

    if (error instanceof Error && error.message === 'No worksheet found in the uploaded file') {
      return res.status(400).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: appointmentInclude
    })

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    res.json(appointment)
  } catch (error) {
    logError('Get appointment error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentLegends = async (_req: Request, res: Response) => {
  try {
    const legends = await prisma.appointmentLegend.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })

    res.json(legends.map(mapAppointmentLegend))
  } catch (error) {
    logError('Get appointment legends error', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAppointmentLegendCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await getAppointmentLegendCategoriesCatalog()
    res.json(categories)
  } catch (error) {
    logError('Get appointment legend categories error', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAppointmentLegend = async (req: Request, res: Response) => {
  try {
    const requestedCategory = normalizeLegendName(req.body.category)
    const requestedCategoryKey = normalizeLegendMatch(requestedCategory)
    const nextColor = normalizeLegendColor(req.body.color)
    const availableCategories = await getAppointmentLegendCategoriesCatalog()
    const matchedCategory =
      availableCategories.find(
        (category) => normalizeLegendMatch(category) === requestedCategoryKey
      ) || null

    if (!matchedCategory) {
      return res.status(400).json({ error: 'La categoría seleccionada no existe en tratamientos' })
    }

    const existingLegends = await prisma.appointmentLegend.findMany({
      select: {
        id: true,
        name: true,
        sortOrder: true
      }
    })

    const duplicateLegend = existingLegends.find(
      (legend) => normalizeLegendMatch(legend.name) === requestedCategoryKey
    )

    if (duplicateLegend) {
      return res.status(409).json({ error: 'Ya existe una leyenda para esa categoría' })
    }

    const nextSortOrder =
      existingLegends.reduce((maxValue, legend) => Math.max(maxValue, Number(legend.sortOrder || 0)), -1) + 1

    const legend = await prisma.appointmentLegend.create({
      data: {
        name: matchedCategory,
        color: nextColor,
        sortOrder: nextSortOrder
      }
    })

    res.status(201).json(mapAppointmentLegend(legend))
  } catch (error) {
    logError('Create appointment legend error', error, { body: req.body })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAppointmentLegend = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const legend = await prisma.appointmentLegend.findUnique({
      where: { id }
    })

    if (!legend) {
      return res.status(404).json({ error: 'Leyenda no encontrada' })
    }

    await prisma.appointmentLegend.delete({
      where: { id }
    })

    res.json({ message: 'Leyenda eliminada correctamente' })
  } catch (error) {
    logError('Delete appointment legend error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const requestedServiceIds = deriveAppointmentServiceIds(req.body)
    let selectedServices: SelectedAppointmentService[]

    try {
      selectedServices = await loadSelectedAppointmentServices(requestedServiceIds)
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Servicios no válidos' })
    }

    if (selectedServices.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un servicio' })
    }

    const selectedServiceIds = selectedServices.map((service) => service.id)
    const computedEndTime = calculateAppointmentEndTime(
      String(req.body.startTime || ''),
      selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
    )
    const data = buildAppointmentPayload(req.body, {
      serviceId: selectedServiceIds[0],
      endTime: computedEndTime
    })
    const resolvedProfessional = await resolveProfessionalName(data.userId, data.professional)

    if (!resolvedProfessional) {
      return res.status(400).json({ error: 'Debe indicar un profesional valido' })
    }

    data.professional = resolvedProfessional

    const validation = await validateAppointmentSlot({
      date: data.date as Date,
      startTime: data.startTime as string,
      endTime: data.endTime as string,
      professional: resolvedProfessional,
      cabin: data.cabin as string,
    }, prisma)

    if (validation.errors.length > 0) {
      const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400
      return res.status(statusCode).json({
        error: validation.errors[0].message,
        code: validation.errors[0].code,
        allErrors: validation.errors,
        warnings: validation.warnings
      })
    }

    const createdAppointment = await prisma.appointment.create({
      data: {
        ...data,
        appointmentServices: {
          create: buildAppointmentServicesCreateData(selectedServiceIds)
        }
      },
      include: appointmentInclude
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(createdAppointment))
    const appointment = await persistCalendarSyncResult(createdAppointment.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Appointment created but Google Calendar sync failed', {
        appointmentId: createdAppointment.id,
        syncError: syncResult.error,
        clientId: createdAppointment.clientId,
        serviceId: createdAppointment.serviceId,
        date: createdAppointment.date,
        startTime: createdAppointment.startTime,
        endTime: createdAppointment.endTime
      })
    }

    if (data.reminder) {
      const appointmentName = getAppointmentDisplayName(appointment)
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada',
          message: `Cita con ${appointmentName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    logError('Create appointment error', error, {
      userId: req.user?.id || null,
      body: req.body
    })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const existing = await prisma.appointment.findUnique({ 
      where: { id }, 
      include: appointmentInclude 
    })

    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    const nextServiceIds = deriveAppointmentServiceIds(req.body, getExistingAppointmentServiceIds(existing))
    let selectedServices: SelectedAppointmentService[]

    try {
      selectedServices = await loadSelectedAppointmentServices(nextServiceIds)
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Servicios no válidos' })
    }

    if (selectedServices.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un servicio' })
    }

    const serviceSelectionChanged = req.body.serviceId !== undefined || req.body.serviceIds !== undefined
    const shouldRecalculateEndTime = serviceSelectionChanged || req.body.startTime !== undefined
    const updateData = buildAppointmentUpdatePayload(req.body, {
      serviceId: selectedServices[0].id,
      endTime: shouldRecalculateEndTime
        ? calculateAppointmentEndTime(
            String(req.body.startTime || existing.startTime),
            selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
          )
        : undefined
    })
    const partyValidationError = validateAppointmentPartyUpdate(existing, updateData)

    if (partyValidationError) {
      return res.status(400).json({ error: partyValidationError })
    }

    // Validate only if scheduling-relevant fields are changing
    const schedulingFieldChanged =
      updateData.date !== undefined ||
      updateData.startTime !== undefined ||
      updateData.endTime !== undefined ||
      updateData.professional !== undefined ||
      updateData.cabin !== undefined
    const nextStatus = String(updateData.status ?? existing.status)
    const shouldValidateScheduling =
      schedulingFieldChanged ||
      (!isActiveAppointmentStatus(existing.status) && isActiveAppointmentStatus(nextStatus))

    if (shouldValidateScheduling) {
      const validation = await validateAppointmentSlot({
        date: (updateData.date as Date) || existing.date,
        startTime: (updateData.startTime as string) || existing.startTime,
        endTime: (updateData.endTime as string) || existing.endTime,
        professional: (updateData.professional as string) || existing.professional,
        cabin: (updateData.cabin as string) || existing.cabin,
        excludeAppointmentId: id,
      }, prisma)

      if (validation.errors.length > 0) {
        const statusCode = validation.errors[0].code.includes('CONFLICT') ? 409 : 400
        return res.status(statusCode).json({
          error: validation.errors[0].message,
          code: validation.errors[0].code,
          allErrors: validation.errors,
          warnings: validation.warnings
        })
      }
    }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          ...updateData,
          ...(serviceSelectionChanged
            ? {
                appointmentServices: {
                  deleteMany: {},
                  create: buildAppointmentServicesCreateData(selectedServices.map((service) => service.id))
                }
              }
            : {})
        },
        include: appointmentInclude
      })

    const movedToCancelled =
      updatedAppointment.status === 'CANCELLED' || updatedAppointment.status === 'NO_SHOW'

    if (movedToCancelled) {
      await releaseReservedBonoSessions(updatedAppointment.id)
    }

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(updatedAppointment))
    const appointment = await persistCalendarSyncResult(updatedAppointment.id, syncResult)

    if (syncResult.status === 'ERROR') {
      logWarn('Appointment updated but Google Calendar sync failed', {
        appointmentId: updatedAppointment.id,
        syncError: syncResult.error,
        clientId: updatedAppointment.clientId,
        serviceId: updatedAppointment.serviceId,
        date: updatedAppointment.date,
        startTime: updatedAppointment.startTime,
        endTime: updatedAppointment.endTime
      })
    }

    res.json(appointment)
  } catch (error) {
    logError('Update appointment error', error, {
      userId: req.user?.id || null,
      params: req.params,
      body: req.body
    })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true, status: true } },
        client: true,
        service: true
      }
    })

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' })
    }

    if (appointment.sale?.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot delete an appointment with a completed sale linked' })
    }

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

    await prisma.appointment.delete({
      where: { id }
    })

    res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    logError('Delete appointment error', error, { params: req.params })
    res.status(500).json({ error: 'Internal server error' })
  }
}
