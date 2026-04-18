import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { loadWorkbookFromBuffer, worksheetToObjects } from './spreadsheet'
import { normalizeProfessionalName, professionalNameKey } from './professional-catalog'

export type AppointmentSpreadsheetIssue = {
  row: number
  error: string
}

export type AppointmentSpreadsheetResult = {
  success: number
  skipped: number
  errors: AppointmentSpreadsheetIssue[]
}

export type AppointmentImportClientRecord = {
  id: string
  externalCode?: string | null
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  phone?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  email?: string | null
}

export type AppointmentImportServiceRecord = {
  id: string
  serviceCode?: string | null
  name?: string | null
  duration?: number | null
  isActive?: boolean | null
  createdAt?: Date | string | null
}

export type AppointmentExportRecord = {
  date: Date | string
  startTime: string
  endTime: string
  cabin?: string | null
  professional?: string | null
  notes?: string | null
  client?: {
    externalCode?: string | null
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    mobilePhone?: string | null
    email?: string | null
  } | null
  guestName?: string | null
  guestPhone?: string | null
  service?: {
    serviceCode?: string | null
    name?: string | null
    duration?: number | null
  } | null
}

export type AppointmentImportMatchStatus = 'matched' | 'missing' | 'ambiguous' | 'invalid'

export type AppointmentClientMatchResult = {
  client: AppointmentImportClientRecord | null
  error: string | null
  status: AppointmentImportMatchStatus
}

export type AppointmentServiceMatchResult = {
  service: AppointmentImportServiceRecord | null
  error: string | null
  status: AppointmentImportMatchStatus
}

const spreadsheetHeaders = [
  'Fecha',
  'Hora',
  'Minutos',
  'cliente',
  'Nombre',
  'Código',
  'Descripción',
  'Cabina',
  'Profesional',
  'Teléfono',
  'Mail',
  'Notas'
] as const

const importAliases = {
  date: ['Fecha', 'date'],
  time: ['Hora', 'Hora inicio', 'Hora Inicio', 'time'],
  minutes: ['Minutos', 'minutes', 'Duracion', 'Duración'],
  clientCode: ['Nº Cliente', 'Numero cliente', 'NCliente', 'cliente', 'externalCode'],
  clientName: ['Nombre', 'Nombre cliente', 'Cliente', 'guestName'],
  serviceCode: ['Código', 'Codigo', 'Código servicio', 'Codigo servicio', 'serviceCode'],
  serviceDescription: ['Descripción', 'Descripcion', 'Servicio', 'serviceName', 'Descripción del tratamiento'],
  cabin: ['Cabina', 'cabin'],
  professional: ['Profesional', 'professional'],
  phone: ['Teléfono', 'Telefono', 'phone'],
  email: ['Mail', 'Email', 'email'],
  notes: ['Notas', 'notes']
} as const

const knownCabins = new Set(['LUCY', 'TAMARA', 'CABINA_1', 'CABINA_2'])

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const normalizeKey = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const normalizeSearchText = (value: unknown) => normalizeKey(value)
const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D+/g, '')

const normalizeRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value
  }

  return normalized
}

const getRowValue = (row: Record<string, unknown>, aliases: readonly string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

const formatMinutes = (value: number) => String(Math.max(0, Math.round(value)))

const parseDateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const text = normalizeText(value)
  if (!text) return null

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2]) - 1
    const day = Number(isoMatch[3])
    const parsed = new Date(year, month, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2]) - 1
    let year = Number(dmyMatch[3])
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000
    }

    const parsed = new Date(year, month, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

const parseTimeValue = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60)
      const hours = Math.floor(totalMinutes / 60) % 24
      const minutes = totalMinutes % 60
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }

  const text = normalizeText(value)
  if (!text) return null

  const match = text.match(/^(\d{1,2})(?::|\.)(\d{2})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours > 23 || minutes > 59) return null

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const parseMinutesValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value)
    return rounded > 0 ? rounded : null
  }

  const text = normalizeText(value)
  if (!text) return null

  const match = text.match(/\d+/)
  if (!match) return null

  const parsed = Number(match[0])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const addMinutesToTime = (time: string, minutes: number) => {
  const [hoursPart, minutesPart] = time.split(':').map(Number)
  const totalMinutes = hoursPart * 60 + minutesPart + minutes
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalizedMinutes / 60)
  const mins = normalizedMinutes % 60

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const normalizeCabinValue = (value: unknown, professional: string) => {
  const text = normalizeSearchText(value).toUpperCase()
  if (!text) {
    const professionalKey = professionalNameKey(professional)
    if (professionalKey === 'lucy') {
      return 'LUCY'
    }

    if (professionalKey === 'tamara') {
      return 'TAMARA'
    }

    return 'LUCY'
  }

  if (text === 'CABINA') return 'CABINA_1'
  if (text === 'CABINA1') return 'CABINA_1'
  if (text === 'CABINA2') return 'CABINA_2'
  if (knownCabins.has(text)) return text

  return normalizeText(value).toUpperCase()
}

const normalizeProfessionalValue = (value: unknown, cabin: string | null) => {
  const normalizedProfessional = normalizeProfessionalName(value)
  if (normalizedProfessional) {
    return normalizedProfessional
  }

  if (cabin === 'LUCY' || cabin === 'TAMARA') {
    return normalizeProfessionalName(cabin)
  }

  return ''
}

const buildClientSearchName = (client: AppointmentImportClientRecord) =>
  normalizeSearchText(client.fullName || `${client.firstName || ''} ${client.lastName || ''}`.trim())

const compareServiceCandidates = (
  left: AppointmentImportServiceRecord,
  right: AppointmentImportServiceRecord
) => {
  const activeDiff = Number(Boolean(right.isActive)) - Number(Boolean(left.isActive))
  if (activeDiff !== 0) return activeDiff

  const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0
  const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt
  }

  return left.id.localeCompare(right.id)
}

const getCanonicalServiceVariants = (services: AppointmentImportServiceRecord[]) => {
  const variants = new Map<string, AppointmentImportServiceRecord>()

  for (const service of [...services].sort(compareServiceCandidates)) {
    const key = [
      normalizeSearchText(service.serviceCode),
      normalizeSearchText(service.name),
      Number(service.duration || 0)
    ].join('|')

    if (!variants.has(key)) {
      variants.set(key, service)
    }
  }

  return [...variants.values()]
}

const descriptionsRoughlyMatch = (left: unknown, right: unknown) => {
  const normalizedLeft = normalizeSearchText(left)
  const normalizedRight = normalizeSearchText(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
}

const buildTreatmentLabel = (serviceCode: unknown, serviceDescription: unknown, minutes: number) =>
  `${String(serviceCode).trim()} / ${String(serviceDescription).trim()} / ${minutes}`

const agendaBlockPatterns = [
  /^PILATES$/i,
  /^LIBRES?$/i,
  /^MICRO$/i,
  /^COMIDA\b/i,
  /^FIESTA\b/i,
  /^NAVIDAD$/i,
  /^INMACULADA$/i,
  /^CONSTITUCION$/i,
  /^TODOS LOS SANTOS$/i,
  /^ZOOM\b/i,
  /^OTORRINO\b/i,
  /^MEDITACION$/i
]

export const buildNormalizedAppointmentImportRow = (row: Record<string, unknown>) => {
  const normalized = normalizeRow(row)

  return {
    date: getRowValue(normalized, importAliases.date),
    time: getRowValue(normalized, importAliases.time),
    minutes: getRowValue(normalized, importAliases.minutes),
    clientCode: getRowValue(normalized, importAliases.clientCode),
    clientName: getRowValue(normalized, importAliases.clientName),
    serviceCode: getRowValue(normalized, importAliases.serviceCode),
    serviceDescription: getRowValue(normalized, importAliases.serviceDescription),
    cabin: getRowValue(normalized, importAliases.cabin),
    professional: getRowValue(normalized, importAliases.professional),
    phone: getRowValue(normalized, importAliases.phone),
    email: getRowValue(normalized, importAliases.email),
    notes: getRowValue(normalized, importAliases.notes)
  }
}

export const isLikelyAgendaBlockRow = (row: {
  clientCode?: unknown
  clientName?: unknown
  serviceCode?: unknown
  serviceDescription?: unknown
}) => {
  const normalizedClientCode = normalizeSearchText(row.clientCode)
  const normalizedName = normalizeText(row.clientName).toUpperCase()
  const hasService =
    Boolean(normalizeSearchText(row.serviceCode)) || Boolean(normalizeSearchText(row.serviceDescription))

  if (!hasService && normalizedClientCode === '1') {
    return true
  }

  return !hasService && agendaBlockPatterns.some((pattern) => pattern.test(normalizedName))
}

export const parseAppointmentDate = (value: unknown) => parseDateValue(value)

export const parseAppointmentTime = (value: unknown) => parseTimeValue(value)

export const parseAppointmentMinutes = (value: unknown) => parseMinutesValue(value)

export const resolveAppointmentCabin = (value: unknown, professional: string) => normalizeCabinValue(value, professional)

export const resolveAppointmentProfessional = (value: unknown, cabin: string | null) =>
  normalizeProfessionalValue(value, cabin)

export const resolveAppointmentEndTime = (startTime: string, minutes: number) =>
  addMinutesToTime(startTime, minutes)

export const matchAppointmentClient = (
  clients: AppointmentImportClientRecord[],
  input: {
    clientCode?: unknown
    clientName?: unknown
    phone?: unknown
    email?: unknown
  }
): AppointmentClientMatchResult => {
  const normalizedClientCode = normalizeSearchText(input.clientCode)
  if (normalizedClientCode) {
    const codeMatches = clients.filter(
      (client) => normalizeSearchText(client.externalCode) === normalizedClientCode
    )

    if (codeMatches.length === 1) {
      return { client: codeMatches[0], error: null, status: 'matched' }
    }

    if (codeMatches.length > 1) {
      return {
        client: null,
        error: `El cliente ${String(input.clientCode).trim()} es ambiguo en la base de datos`,
        status: 'ambiguous'
      }
    }
  }

  const normalizedEmail = normalizeSearchText(input.email)
  if (normalizedEmail) {
    const emailMatches = clients.filter(
      (client) => normalizeSearchText(client.email) === normalizedEmail
    )

    if (emailMatches.length === 1) {
      return { client: emailMatches[0], error: null, status: 'matched' }
    }

    if (emailMatches.length > 1) {
      return {
        client: null,
        error: `El email ${String(input.email).trim()} es ambiguo en la base de datos`,
        status: 'ambiguous'
      }
    }
  }

  const normalizedPhone = normalizePhone(input.phone)
  if (normalizedPhone) {
    const phoneMatches = clients.filter((client) =>
      [client.phone, client.mobilePhone, client.landlinePhone].some(
        (phone) => normalizePhone(phone) === normalizedPhone
      )
    )

    if (phoneMatches.length === 1) {
      return { client: phoneMatches[0], error: null, status: 'matched' }
    }

    if (phoneMatches.length > 1) {
      return {
        client: null,
        error: `El telefono ${String(input.phone).trim()} es ambiguo en la base de datos`,
        status: 'ambiguous'
      }
    }
  }

  const normalizedClientName = normalizeSearchText(input.clientName)
  if (normalizedClientName) {
    const nameMatches = clients.filter((client) => buildClientSearchName(client) === normalizedClientName)

    if (nameMatches.length === 1) {
      return { client: nameMatches[0], error: null, status: 'matched' }
    }

    if (nameMatches.length > 1) {
      return {
        client: null,
        error: `El nombre ${String(input.clientName).trim()} es ambiguo en la base de datos`,
        status: 'ambiguous'
      }
    }
  }

  if (normalizedClientCode) {
    return {
      client: null,
      error: `No se encontro el cliente ${String(input.clientCode).trim()} ni coincidencias por telefono, email o nombre`,
      status: 'missing'
    }
  }

  return {
    client: null,
    error: 'Falta el numero de cliente y no hubo coincidencias por telefono, email o nombre',
    status: 'missing'
  }
}

export const matchAppointmentService = (
  services: AppointmentImportServiceRecord[],
  serviceCode: unknown,
  serviceDescription: unknown,
  minutes: unknown
): AppointmentServiceMatchResult => {
  const normalizedCode = normalizeSearchText(serviceCode)
  const normalizedDescription = normalizeSearchText(serviceDescription)
  const normalizedMinutes = parseMinutesValue(minutes)

  if (!normalizedCode || !normalizedDescription || !normalizedMinutes) {
    return {
      service: null,
      error: 'Faltan codigo, descripcion o minutos del tratamiento',
      status: 'invalid'
    }
  }

  const compatibleServices = services.filter((service) => {
    return (
      normalizeSearchText(service.serviceCode) === normalizedCode &&
      normalizeSearchText(service.name) === normalizedDescription
    )
  })

  const fuzzyCompatibleServices =
    compatibleServices.length > 0
      ? compatibleServices
      : services.filter((service) => {
          return (
            normalizeSearchText(service.serviceCode) === normalizedCode &&
            descriptionsRoughlyMatch(service.name, serviceDescription)
          )
        })

  if (fuzzyCompatibleServices.length === 0) {
    return {
      service: null,
      error: `No se encontro el tratamiento ${buildTreatmentLabel(serviceCode, serviceDescription, normalizedMinutes)}`,
      status: 'missing'
    }
  }

  const exactMatches = getCanonicalServiceVariants(
    fuzzyCompatibleServices.filter((service) => Number(service.duration || 0) === normalizedMinutes)
  )

  if (exactMatches.length === 1) {
    return { service: exactMatches[0], error: null, status: 'matched' }
  }

  if (exactMatches.length > 1) {
    return {
      service: null,
      error: `El tratamiento ${buildTreatmentLabel(serviceCode, serviceDescription, normalizedMinutes)} es ambiguo`,
      status: 'ambiguous'
    }
  }

  const fallbackMatches = getCanonicalServiceVariants(fuzzyCompatibleServices)

  if (fallbackMatches.length === 1) {
    return { service: fallbackMatches[0], error: null, status: 'matched' }
  }

  const availableDurations = [...new Set(
    fallbackMatches
      .map((service) => Number(service.duration || 0))
      .filter((duration) => Number.isFinite(duration) && duration > 0)
  )].sort((left, right) => left - right)

  return {
    service: null,
    error: `El tratamiento ${buildTreatmentLabel(serviceCode, serviceDescription, normalizedMinutes)} es ambiguo. Variantes disponibles: ${availableDurations.join(', ')}`,
    status: 'ambiguous'
  }
}

export const loadAppointmentRowsFromBuffer = async (buffer: Buffer) => {
  const workbook = await loadWorkbookFromBuffer(buffer)
  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    throw new Error('No worksheet found in the uploaded file')
  }

  return worksheetToObjects(worksheet)
}

export const buildAppointmentsExportWorkbook = (appointments: AppointmentExportRecord[]) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Citas')

  worksheet.columns = spreadsheetHeaders.map((header) => ({
    key: header,
    width: 16
  }))

  worksheet.addRow([...spreadsheetHeaders])

  for (const appointment of appointments) {
    const clientName =
      appointment.client && (appointment.client.firstName || appointment.client.lastName)
        ? `${appointment.client.firstName || ''} ${appointment.client.lastName || ''}`.trim()
        : String(appointment.guestName || '').trim()

    const phone = appointment.client?.phone || appointment.client?.mobilePhone || appointment.guestPhone || ''

    const email = appointment.client?.email || ''
    const serviceMinutes =
      Number.isFinite(Number(appointment.service?.duration)) && Number(appointment.service?.duration) > 0
        ? Number(appointment.service?.duration)
        : null

    const startMinutes = parseTimeValue(appointment.startTime)
    const endMinutes = parseTimeValue(appointment.endTime)
    const computedMinutes =
      serviceMinutes ||
      (startMinutes && endMinutes
        ? (() => {
            const [startHours, startMins] = startMinutes.split(':').map(Number)
            const [endHours, endMins] = endMinutes.split(':').map(Number)
            return Math.max(0, endHours * 60 + endMins - (startHours * 60 + startMins))
          })()
        : 0)

    worksheet.addRow([
      format(new Date(appointment.date), 'dd-MM-yy'),
      appointment.startTime,
      formatMinutes(computedMinutes),
      appointment.client?.externalCode || '',
      clientName,
      appointment.service?.serviceCode || '',
      appointment.service?.name || '',
      appointment.cabin || '',
      appointment.professional || '',
      phone,
      email,
      appointment.notes || ''
    ])
  }

  worksheet.getRow(1).font = { bold: true }

  return workbook
}
