import { prisma } from '../../../db'
import {
  type AppointmentImportClientRecord,
  type AppointmentImportServiceRecord,
  type AppointmentSpreadsheetIssue,
  buildNormalizedAppointmentImportRow,
  isLikelyAgendaBlockRow,
  matchAppointmentClient,
  matchAppointmentService,
  parseAppointmentDate,
  parseAppointmentMinutes,
  parseAppointmentTime,
  resolveAppointmentCabin,
  resolveAppointmentEndTime,
  resolveAppointmentProfessional
} from '../../../utils/appointment-spreadsheet'
import { normalizeProfessionalName } from '../../../utils/professional-catalog'
import { normalizeNullableText } from '../shared'
import type {
  AppointmentImportCatalogs,
  AppointmentImportConflictSummary,
  AppointmentImportDuplicateSummary,
  AppointmentImportMissingClientSummary,
  MissingAppointmentClientCandidate,
  PreparedActionableAppointmentImportRow,
  PreparedAppointmentImportRow
} from './types'

export const isPreparedReadyEntry = (
  entry: PreparedAppointmentImportRow
): entry is Extract<PreparedAppointmentImportRow, { kind: 'ready' }> => entry.kind === 'ready'

export const isPreparedMissingClientEntry = (
  entry: PreparedAppointmentImportRow
): entry is Extract<PreparedAppointmentImportRow, { kind: 'missing-client' }> => entry.kind === 'missing-client'

export const isPreparedActionableEntry = (
  entry: PreparedAppointmentImportRow
): entry is PreparedActionableAppointmentImportRow =>
  isPreparedReadyEntry(entry) || isPreparedMissingClientEntry(entry)

export const toAppointmentSpreadsheetError = (row: number, message: string): AppointmentSpreadsheetIssue => ({
  row,
  error: `Fila ${row}: ${message}`
})

export const normalizeAppointmentImportError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return 'Error desconocido al importar la fila'
}

export const selectAppointmentImportCatalogs = async (): Promise<AppointmentImportCatalogs> => {
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

export const formatAppointmentImportDateKey = (date: Date) => {
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

export const buildAppointmentImportKey = (input: {
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
) => `Fila ${rowNumber}: ${clientName} · ${formatAppointmentImportDateKey(date)} ${startTime} · ${serviceName}`

export const buildDuplicateSummary = (
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

export const buildAppointmentImportConflictSummary = (
  row: number,
  message: string
): AppointmentImportConflictSummary => ({
  row,
  message: `Fila ${row}: ${message}`
})

const timeRangesOverlap = (leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) =>
  leftStart < rightEnd && leftEnd > rightStart

export const findAppointmentImportPlannedConflicts = (
  current: PreparedActionableAppointmentImportRow,
  plannedEntries: PreparedActionableAppointmentImportRow[]
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

export const buildMissingClientSummaryMap = (preparedRows: PreparedAppointmentImportRow[]) => {
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

export const pushMissingClientOutcome = (
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

export const sortMissingClientSummaries = (summaries: AppointmentImportMissingClientSummary[]) =>
  [...summaries].sort((left, right) => left.clientName.localeCompare(right.clientName, 'es', { sensitivity: 'base' }))

export const selectExistingImportAppointmentKeys = async (preparedRows: PreparedAppointmentImportRow[]) => {
  const uniqueDateKeys = [
    ...new Set(
      preparedRows
        .filter(isPreparedActionableEntry)
        .map((entry) => formatAppointmentImportDateKey(entry.date))
    )
  ]

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

export const prepareAppointmentImportRows = (
  rawRows: Record<string, unknown>[],
  catalogs: AppointmentImportCatalogs
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
        clientName:
          collapseWhitespace(row.clientName) ||
          `${clientMatch.client.firstName || ''} ${clientMatch.client.lastName || ''}`.trim(),
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

export const createClientFromAppointmentImport = async (
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
