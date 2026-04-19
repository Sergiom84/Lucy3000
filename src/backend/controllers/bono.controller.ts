import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { Workbook } from 'exceljs'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { AppointmentSyncInput, googleCalendarService } from '../services/googleCalendar.service'
import { validateAppointmentSlot } from '../utils/appointment-validation'
import {
  getAppointmentDisplayEmail,
  getAppointmentDisplayName,
  getAppointmentDisplayPhone
} from '../utils/customer-display'
import {
  calculateAppointmentEndTime,
  deriveAppointmentServiceIds,
  getAppointmentServiceLabel
} from '../utils/appointment-services'
import { loadLegacySpreadsheetSheet } from '../utils/legacy-spreadsheet'
import { normalizeTopUpPaymentMethod } from '../utils/payment-breakdown'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../utils/spreadsheet'

class AccountBalanceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

class BonoOperationError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

const toNumber = (value: unknown) => Number(value || 0)
const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'
const CLIENT_BONO_IMPORT_SOURCE = 'LEGACY_CLIENT_BONO'
const ACCOUNT_BALANCE_IMPORT_SOURCE = 'LEGACY_ACCOUNT_BALANCE'

type BonoTemplate = {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

const sortBonoTemplates = (templates: BonoTemplate[]) =>
  [...templates].sort((left, right) => {
    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'es', {
      sensitivity: 'base'
    })
    if (categoryCompare !== 0) return categoryCompare

    const descriptionCompare = String(left.description || '').localeCompare(String(right.description || ''), 'es', {
      sensitivity: 'base'
    })
    if (descriptionCompare !== 0) return descriptionCompare

    return Number(left.totalSessions || 0) - Number(right.totalSessions || 0)
  })

const normalizeTemplateKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const buildNormalizedTemplateRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeTemplateKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

const getTemplateRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeTemplateKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const parseTemplatePrice = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return 0
  const normalized = String(value).trim().replace(/\s*€\s*/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? normalizeMoney(parsed) : 0
}

const parseTemplateSessions = (value: unknown) => {
  if (value === null || value === undefined) return null
  const match = String(value).match(/(\d+)/)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const buildBonoTemplateIdentityKey = (
  serviceId: string,
  description: string,
  totalSessions: number
) => {
  const normalizedServiceId = String(serviceId || '').trim()
  const normalizedDescription = normalizeSearchText(description)
  const parsedSessions = Number(totalSessions || 0)

  if (!normalizedServiceId || !normalizedDescription || !Number.isFinite(parsedSessions) || parsedSessions < 1) {
    return null
  }

  return `${normalizedServiceId}::${normalizedDescription}::${parsedSessions}`
}

const buildBonoTemplateServiceLookup = (service: { serviceCode?: string | null; name: string }) =>
  String(service.serviceCode || service.name || '').trim()

const readBonoTemplates = async () => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY }
  })

  if (!setting) return [] as BonoTemplate[]

  try {
    const parsed = JSON.parse(setting.value)
    return Array.isArray(parsed) ? (parsed as BonoTemplate[]) : []
  } catch {
    return []
  }
}

const writeBonoTemplates = async (templates: BonoTemplate[]) => {
  await prisma.setting.upsert({
    where: { key: BONO_TEMPLATES_SETTING_KEY },
    update: {
      value: JSON.stringify(sortBonoTemplates(templates)),
      description: 'Catalogo importado de bonos'
    },
    create: {
      key: BONO_TEMPLATES_SETTING_KEY,
      value: JSON.stringify(sortBonoTemplates(templates)),
      description: 'Catalogo importado de bonos'
    }
  })
}

const selectBonoTemplateSheet = (workbook: Workbook) => {
  let bestMatch: {
    sheetName: string
    rawRows: Record<string, unknown>[]
    score: number
  } | null = null

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name
    const rawRows = worksheetToObjects(worksheet)
    const normalizedRows = rawRows.slice(0, 25).map((row) => buildNormalizedTemplateRow(row || {}))

    const hasDescriptionColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) !== null
    )
    const hasServiceLookupColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) !== null
    )
    const hasPriceColumn = normalizedRows.some((row) =>
      getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP']) !== null
    )
    const bonusHintCount = normalizedRows.filter((row) => {
      return ['Descripcion', 'Descripción', 'Nombre', 'Bono'].some((alias) => {
        const value = getTemplateRowValue(row, [alias])
        return typeof value === 'string' && normalizeSearchText(value).includes('bono')
      })
    }).length

    const score =
      (rawRows.length > 0 ? 1 : 0) +
      (hasDescriptionColumn ? 3 : 0) +
      (hasServiceLookupColumn ? 3 : 0) +
      (hasPriceColumn ? 2 : 0) +
      bonusHintCount * 5

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { sheetName, rawRows, score }
    }
  }

  return bestMatch
}

type ImportListItem = {
  row: number
  message: string
}

type PreparedClientBonoRow = {
  row: number
  message: string
  clientId: string
  legacyRef: string
  name: string
  serviceId: string | null
  totalSessions: number
  consumedSessions: number
  remainingSessions: number
  purchaseDate: Date
  expiryDate: Date | null
  price: number
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  notes: string | null
  lastSessionAt: Date | null
}

type PreparedAccountBalanceRow = {
  row: number
  message: string
  clientId: string
  legacyRef: string
  description: string
  amount: number
  operationDate: Date
  notes: string | null
}

type MissingLegacyImportClientCandidate = {
  key: string
  clientCode: string | null
  clientName: string
  firstName: string
  lastName: string
  phoneForRecord: string
}

type MissingLegacyImportClientSummary = {
  key: string
  clientCode: string | null
  clientName: string
  rows: number[]
  action?: 'created' | 'skipped'
}

type PreparedClientBonoMissingRow = Omit<PreparedClientBonoRow, 'clientId'> & {
  missingClient: MissingLegacyImportClientCandidate
}

type PreparedAccountBalanceMissingRow = Omit<PreparedAccountBalanceRow, 'clientId'> & {
  missingClient: MissingLegacyImportClientCandidate
}

type LegacyClientLookupRecord = {
  id: string
  externalCode: string | null
  firstName: string
  lastName: string
}

type LegacyServiceLookupRecord = {
  id: string
  serviceCode: string | null
  name: string
}

const toSection = <T>(items: T[]) => ({
  count: items.length,
  items
})

const formatImportCurrency = (value: number) =>
  `${normalizeMoney(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}€`

const formatImportDate = (value: Date | null) =>
  value
    ? value.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : 'sin fecha'

const parseImportInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value)
    return rounded >= 0 ? rounded : null
  }

  if (value === null || value === undefined) return null

  const match = String(value).match(/-?\d+/)
  if (!match) return null

  const parsed = Number.parseInt(match[0], 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const parseImportMoney = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeMoney(value)
  }

  if (value === null || value === undefined) return null

  const normalized = String(value)
    .trim()
    .replace(/\s*€\s*/g, '')
    .replace(/\s/g, '')

  if (!normalized) return null

  const candidate =
    normalized.includes(',') && normalized.includes('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(',', '.')

  const parsed = Number.parseFloat(candidate)
  return Number.isFinite(parsed) ? normalizeMoney(parsed) : null
}

const parseImportDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const dmyMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (dmyMatch) {
    let year = Number(dmyMatch[3])
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000
    }

    const parsed = new Date(year, Number(dmyMatch[2]) - 1, Number(dmyMatch[1]))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

const buildClientDisplayLabel = (clientCode: string, clientName: string) => {
  const parts = [clientCode ? `#${clientCode}` : null, clientName || 'Cliente sin nombre'].filter(Boolean)
  return parts.join(' · ')
}

const splitImportedLegacyClientName = (value: unknown) => {
  const normalizedName = String(value ?? '').trim().replace(/\s+/g, ' ')
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

const buildMissingLegacyImportClientCandidate = (
  rowNumber: number,
  clientCode: string,
  clientName: string
): MissingLegacyImportClientCandidate => {
  const normalizedClientCode = String(clientCode || '').trim() || null
  const resolvedClientName = String(clientName || '').trim() || (normalizedClientCode ? `Cliente ${normalizedClientCode}` : 'Cliente importado')
  const { firstName, lastName } = splitImportedLegacyClientName(resolvedClientName)

  return {
    key: normalizedClientCode
      ? `code:${normalizeTemplateKey(normalizedClientCode)}`
      : `name:${normalizeSearchText(resolvedClientName)}`,
    clientCode: normalizedClientCode,
    clientName: resolvedClientName,
    firstName,
    lastName,
    phoneForRecord: `NO_PHONE_IMPORT_${normalizedClientCode || rowNumber}`
  }
}

const canAutoCreateLegacyClient = (
  resolutionError: string | null,
  candidate: MissingLegacyImportClientCandidate
) => {
  if (!resolutionError) return false
  if (!candidate.clientCode && !candidate.clientName) return false
  if (/coincide con varios clientes/i.test(resolutionError)) return false
  if (/falta el cliente de referencia/i.test(resolutionError)) return false
  return true
}

const buildMissingLegacyClientSummaryMap = <
  T extends { row: number; missingClient: MissingLegacyImportClientCandidate }
>(
  rows: T[]
) => {
  const summaries = new Map<string, MissingLegacyImportClientSummary>()

  for (const row of rows) {
    const current = summaries.get(row.missingClient.key)
    if (current) {
      if (!current.rows.includes(row.row)) {
        current.rows.push(row.row)
      }
      continue
    }

    summaries.set(row.missingClient.key, {
      key: row.missingClient.key,
      clientCode: row.missingClient.clientCode,
      clientName: row.missingClient.clientName,
      rows: [row.row]
    })
  }

  return summaries
}

const pushMissingLegacyClientOutcome = (
  summaryMap: Map<string, MissingLegacyImportClientSummary>,
  candidate: MissingLegacyImportClientCandidate,
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
    rows: [rowNumber],
    action
  })
}

const sortMissingLegacyClientSummaries = (items: MissingLegacyImportClientSummary[]) =>
  [...items].sort((left, right) => left.clientName.localeCompare(right.clientName, 'es', { sensitivity: 'base' }))

const createClientFromLegacyImport = async (
  candidate: MissingLegacyImportClientCandidate
): Promise<LegacyClientLookupRecord> => {
  const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || candidate.clientName

  return prisma.client.create({
    data: {
      externalCode: candidate.clientCode,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName,
      phone: candidate.phoneForRecord,
      mobilePhone: candidate.phoneForRecord,
      notes: 'Ficha creada automaticamente durante una importacion legacy',
      isActive: true
    },
    select: {
      id: true,
      externalCode: true,
      firstName: true,
      lastName: true
    }
  })
}

const buildClientBonoImportKey = (clientId: string, legacyRef: string) =>
  `${clientId}::${normalizeTemplateKey(String(legacyRef || ''))}`

const buildAccountBalanceImportKey = (clientId: string, legacyRef: string) =>
  `${clientId}::${normalizeTemplateKey(String(legacyRef || ''))}`

const buildLegacyClientLookup = (clients: LegacyClientLookupRecord[]) => {
  const byExternalCode = new Map<string, LegacyClientLookupRecord>()
  const byFullName = new Map<string, LegacyClientLookupRecord[]>()

  for (const client of clients) {
    const externalCodeKey = normalizeTemplateKey(String(client.externalCode || ''))
    if (externalCodeKey && !byExternalCode.has(externalCodeKey)) {
      byExternalCode.set(externalCodeKey, client)
    }

    const fullNameKey = normalizeSearchText(`${client.firstName || ''} ${client.lastName || ''}`)
    if (!fullNameKey) continue

    const existing = byFullName.get(fullNameKey) || []
    existing.push(client)
    byFullName.set(fullNameKey, existing)
  }

  return { byExternalCode, byFullName }
}

const resolveLegacyClient = (
  clientCode: string,
  clientName: string,
  lookup: ReturnType<typeof buildLegacyClientLookup>
) => {
  const externalCodeKey = normalizeTemplateKey(clientCode)
  if (externalCodeKey) {
    const matchedByCode = lookup.byExternalCode.get(externalCodeKey) || null
    if (matchedByCode) {
      return { client: matchedByCode, warning: null, error: null }
    }

    return {
      client: null,
      warning: null,
      error: `No se encontró el cliente con código ${clientCode}`
    }
  }

  const fullNameKey = normalizeSearchText(clientName)
  if (!fullNameKey) {
    return { client: null, warning: null, error: 'Falta el cliente de referencia' }
  }

  const nameMatches = lookup.byFullName.get(fullNameKey) || []
  if (nameMatches.length === 1) {
    return {
      client: nameMatches[0],
      warning: 'Coincidencia por nombre exacto',
      error: null
    }
  }

  if (nameMatches.length > 1) {
    return {
      client: null,
      warning: null,
      error: `El nombre ${clientName} coincide con varios clientes`
    }
  }

  return {
    client: null,
    warning: null,
    error: `No se encontró el cliente ${clientName}`
  }
}

const buildLegacyServiceLookup = (services: LegacyServiceLookupRecord[]) => {
  const byCode = new Map<string, LegacyServiceLookupRecord>()
  const byName = new Map<string, LegacyServiceLookupRecord[]>()

  for (const service of services) {
    const serviceCodeKey = normalizeTemplateKey(String(service.serviceCode || ''))
    if (serviceCodeKey && !byCode.has(serviceCodeKey)) {
      byCode.set(serviceCodeKey, service)
    }

    const serviceNameKey = normalizeSearchText(service.name)
    if (!serviceNameKey) continue

    const existing = byName.get(serviceNameKey) || []
    existing.push(service)
    byName.set(serviceNameKey, existing)
  }

  return { byCode, byName }
}

const resolveLegacyService = (
  serviceCode: string,
  description: string,
  lookup: ReturnType<typeof buildLegacyServiceLookup>
) => {
  const serviceCodeKey = normalizeTemplateKey(serviceCode)
  if (serviceCodeKey) {
    const matchedByCode = lookup.byCode.get(serviceCodeKey) || null
    if (matchedByCode) {
      return { service: matchedByCode, warning: null }
    }
  }

  const descriptionKey = normalizeSearchText(description)
  if (!descriptionKey) {
    return { service: null, warning: null }
  }

  const matchedByName = lookup.byName.get(descriptionKey) || []
  if (matchedByName.length === 1) {
    return {
      service: matchedByName[0],
      warning: serviceCode ? 'Tratamiento enlazado por descripción exacta' : null
    }
  }

  return {
    service: null,
    warning: serviceCode ? `No se vinculó el tratamiento ${serviceCode}` : 'No se vinculó el tratamiento'
  }
}

const isExpiredStatusDate = (expiryDate: Date | null) => {
  if (!expiryDate) return false

  const today = new Date()
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return expiryDate < normalizedToday
}

const buildClientBonoImportPreview = (
  rawRows: Record<string, unknown>[],
  clients: LegacyClientLookupRecord[],
  services: LegacyServiceLookupRecord[],
  existingImportKeys: Set<string>
) => {
  const ready: PreparedClientBonoRow[] = []
  const readyItems: ImportListItem[] = []
  const existingItems: ImportListItem[] = []
  const depletedItems: ImportListItem[] = []
  const missingClientRows: PreparedClientBonoMissingRow[] = []
  const errorItems: ImportListItem[] = []
  const processedImportKeys = new Set<string>()
  const clientLookup = buildLegacyClientLookup(clients)
  const serviceLookup = buildLegacyServiceLookup(services)

  for (let index = 0; index < rawRows.length; index += 1) {
    const rowNumber = index + 2
    const row = buildNormalizedTemplateRow(rawRows[index] || {})

    try {
      const clientCode = String(getTemplateRowValue(row, ['Cliente', 'Nº Cliente', 'Numero cliente']) || '').trim()
      const clientName = String(getTemplateRowValue(row, ['Nombre', 'Cliente']) || '').trim()
      const legacyRef = String(getTemplateRowValue(row, ['Nº', 'Numero', 'Bono', 'Referencia']) || '').trim()
      const serviceCode = String(getTemplateRowValue(row, ['Código', 'Codigo', 'Cod']) || '').trim()
      const description = String(
        getTemplateRowValue(row, ['Descripción', 'Descripcion', 'Tratamiento', 'Servicio']) || ''
      ).trim()
      const totalSessions = parseImportInteger(
        getTemplateRowValue(row, ['Nominal', 'Sesiones', 'Total sesiones'])
      )
      const consumedRaw = parseImportInteger(getTemplateRowValue(row, ['Consumo', 'Consumido']))
      const remainingRaw = parseImportInteger(getTemplateRowValue(row, ['Saldo', 'Restante']))
      const purchaseDate =
        parseImportDate(getTemplateRowValue(row, ['Comprado', 'Fecha compra', 'Fecha'])) || new Date()
      const lastSessionAt = parseImportDate(
        getTemplateRowValue(row, ['Últ.Sesión', 'Ult.Sesion', 'Última sesión', 'Ultima sesion'])
      )
      const expiryDate = parseImportDate(getTemplateRowValue(row, ['Caduca', 'Caducidad']))
      const price = parseImportMoney(getTemplateRowValue(row, ['Importe', 'Precio'])) || 0

      if (!legacyRef) {
        throw new Error('Falta la referencia legacy del bono')
      }

      if (!description) {
        throw new Error('Falta la descripción del bono')
      }

      if (!totalSessions || totalSessions < 1) {
        throw new Error('El bono no tiene un número válido de sesiones')
      }

      let consumedSessions =
        consumedRaw !== null
          ? Math.min(totalSessions, Math.max(0, consumedRaw))
          : Math.max(0, totalSessions - Math.max(0, remainingRaw || 0))
      let remainingSessions =
        remainingRaw !== null
          ? Math.min(totalSessions, Math.max(0, remainingRaw))
          : Math.max(totalSessions - consumedSessions, 0)

      const warningParts: string[] = []
      if (consumedSessions + remainingSessions > totalSessions) {
        remainingSessions = Math.max(totalSessions - consumedSessions, 0)
        warningParts.push('sesiones ajustadas al nominal')
      }

      if (remainingSessions <= 0) {
        depletedItems.push({
          row: rowNumber,
          message: `${buildClientDisplayLabel(clientCode, clientName)} · bono ${legacyRef} agotado`
        })
        continue
      }

      const serviceResolution = resolveLegacyService(serviceCode, description, serviceLookup)
      if (serviceResolution.warning) {
        warningParts.push(serviceResolution.warning)
      }

      const status = isExpiredStatusDate(expiryDate) ? 'EXPIRED' : 'ACTIVE'
      const name = `${description} · ${totalSessions} sesiones`
      const displayLabel = buildClientDisplayLabel(clientCode, clientName)
      const clientResolution = resolveLegacyClient(clientCode, clientName, clientLookup)
      if (clientResolution.client && clientResolution.warning) {
        warningParts.push(clientResolution.warning)
      }
      const notes = [
        `Importado desde sistema legacy (bono ${legacyRef})`,
        serviceCode ? `Código origen: ${serviceCode}` : null,
        consumedSessions > 0 ? `Sesiones consumidas previas: ${consumedSessions}` : null,
        lastSessionAt ? `Última sesión registrada: ${formatImportDate(lastSessionAt)}` : null,
        warningParts.length > 0 ? `Avisos: ${warningParts.join(', ')}` : null
      ]
        .filter(Boolean)
        .join(' · ')

      const message = [
        displayLabel,
        name,
        `${remainingSessions}/${totalSessions} disponibles`,
        formatImportCurrency(price),
        status === 'EXPIRED' ? 'caducado' : null,
        warningParts.length > 0 ? warningParts.join(', ') : null
      ]
        .filter(Boolean)
        .join(' · ')

      if (!clientResolution.client) {
        const missingClient = buildMissingLegacyImportClientCandidate(rowNumber, clientCode, clientName)

        if (!canAutoCreateLegacyClient(clientResolution.error, missingClient)) {
          errorItems.push({
            row: rowNumber,
            message: `${displayLabel} · ${clientResolution.error}`
          })
          continue
        }

        missingClientRows.push({
          row: rowNumber,
          message,
          legacyRef,
          name,
          serviceId: serviceResolution.service?.id || null,
          totalSessions,
          consumedSessions,
          remainingSessions,
          purchaseDate,
          expiryDate,
          price,
          status,
          notes: notes || null,
          lastSessionAt,
          missingClient
        })
        continue
      }

      const importKey = buildClientBonoImportKey(clientResolution.client.id, legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: rowNumber,
          message: `${displayLabel} · bono ${legacyRef} ya importado`
        })
        continue
      }

      processedImportKeys.add(importKey)
      ready.push({
        row: rowNumber,
        message,
        clientId: clientResolution.client.id,
        legacyRef,
        name,
        serviceId: serviceResolution.service?.id || null,
        totalSessions,
        consumedSessions,
        remainingSessions,
        purchaseDate,
        expiryDate,
        price,
        status,
        notes: notes || null,
        lastSessionAt
      })
      readyItems.push({
        row: rowNumber,
        message
      })
    } catch (error: any) {
      errorItems.push({
        row: rowNumber,
        message: error.message
      })
    }
  }

  return {
    ready,
    missingClientRows,
    preview: {
      ready: toSection(readyItems),
      existing: toSection(existingItems),
      depleted: toSection(depletedItems),
      missingClients: toSection(sortMissingLegacyClientSummaries([...buildMissingLegacyClientSummaryMap(missingClientRows).values()])),
      errors: toSection(errorItems)
    }
  }
}

const buildAccountBalanceImportPreview = (
  rawRows: Record<string, unknown>[],
  clients: LegacyClientLookupRecord[],
  existingImportKeys: Set<string>
) => {
  const ready: PreparedAccountBalanceRow[] = []
  const readyItems: ImportListItem[] = []
  const existingItems: ImportListItem[] = []
  const withoutBalanceItems: ImportListItem[] = []
  const missingClientRows: PreparedAccountBalanceMissingRow[] = []
  const errorItems: ImportListItem[] = []
  const processedImportKeys = new Set<string>()
  const clientLookup = buildLegacyClientLookup(clients)

  for (let index = 0; index < rawRows.length; index += 1) {
    const rowNumber = index + 2
    const row = buildNormalizedTemplateRow(rawRows[index] || {})

    try {
      const clientCode = String(getTemplateRowValue(row, ['Cliente', 'Nº Cliente', 'Numero cliente']) || '').trim()
      const clientName = String(getTemplateRowValue(row, ['Nombre', 'Cliente']) || '').trim()
      const legacyRef = String(getTemplateRowValue(row, ['Abono', 'Nº', 'Numero', 'Referencia']) || '').trim()
      const description = String(getTemplateRowValue(row, ['Descripción', 'Descripcion']) || 'Abono').trim()
      const nominal = parseImportMoney(getTemplateRowValue(row, ['Nominal', 'Importe nominal']))
      const consumed = parseImportMoney(getTemplateRowValue(row, ['Consumo', 'Consumido']))
      const balance = parseImportMoney(getTemplateRowValue(row, ['Saldo', 'Restante']))
      const operationDate =
        parseImportDate(getTemplateRowValue(row, ['Fecha', 'Comprado', 'Fecha compra'])) || new Date()
      const expiryDate = parseImportDate(getTemplateRowValue(row, ['Caduca', 'Caducidad']))

      if (!legacyRef) {
        throw new Error('Falta la referencia legacy del abono')
      }

      if (balance === null) {
        throw new Error('Falta el saldo del abono')
      }

      if (balance <= 0) {
        withoutBalanceItems.push({
          row: rowNumber,
          message: `${buildClientDisplayLabel(clientCode, clientName)} · abono ${legacyRef} sin saldo disponible`
        })
        continue
      }

      const displayLabel = buildClientDisplayLabel(clientCode, clientName)
      const warningParts: string[] = []
      const clientResolution = resolveLegacyClient(clientCode, clientName, clientLookup)
      if (clientResolution.client && clientResolution.warning) {
        warningParts.push(clientResolution.warning)
      }

      const notes = [
        `Importado desde sistema legacy (abono ${legacyRef})`,
        nominal !== null ? `Nominal original: ${formatImportCurrency(nominal)}` : null,
        consumed !== null ? `Consumo previo: ${formatImportCurrency(consumed)}` : null,
        expiryDate ? `Caducidad origen: ${formatImportDate(expiryDate)}` : null,
        warningParts.length > 0 ? `Avisos: ${warningParts.join(', ')}` : null
      ]
        .filter(Boolean)
        .join(' · ')

      const message = [
        displayLabel,
        `${description || 'Abono'} (${legacyRef})`,
        `saldo ${formatImportCurrency(balance)}`,
        warningParts.length > 0 ? warningParts.join(', ') : null
      ]
        .filter(Boolean)
        .join(' · ')

      if (!clientResolution.client) {
        const missingClient = buildMissingLegacyImportClientCandidate(rowNumber, clientCode, clientName)

        if (!canAutoCreateLegacyClient(clientResolution.error, missingClient)) {
          errorItems.push({
            row: rowNumber,
            message: `${displayLabel} · ${clientResolution.error}`
          })
          continue
        }

        missingClientRows.push({
          row: rowNumber,
          message,
          legacyRef,
          description: description || 'Abono',
          amount: balance,
          operationDate,
          notes: notes || null,
          missingClient
        })
        continue
      }

      const importKey = buildAccountBalanceImportKey(clientResolution.client.id, legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: rowNumber,
          message: `${displayLabel} · abono ${legacyRef} ya importado`
        })
        continue
      }

      processedImportKeys.add(importKey)
      ready.push({
        row: rowNumber,
        message,
        clientId: clientResolution.client.id,
        legacyRef,
        description: description || 'Abono',
        amount: balance,
        operationDate,
        notes: notes || null
      })
      readyItems.push({
        row: rowNumber,
        message
      })
    } catch (error: any) {
      errorItems.push({
        row: rowNumber,
        message: error.message
      })
    }
  }

  return {
    ready,
    missingClientRows,
    preview: {
      ready: toSection(readyItems),
      existing: toSection(existingItems),
      withoutBalance: toSection(withoutBalanceItems),
      missingClients: toSection(sortMissingLegacyClientSummaries([...buildMissingLegacyClientSummaryMap(missingClientRows).values()])),
      errors: toSection(errorItems)
    }
  }
}

const buildImportedBonoSessions = (row: PreparedClientBonoRow) => {
  const fallbackConsumedAt = row.lastSessionAt || row.purchaseDate

  return Array.from({ length: row.totalSessions }, (_, index) => {
    const sessionNumber = index + 1
    const isConsumed = sessionNumber <= row.consumedSessions

    return {
      sessionNumber,
      status: isConsumed ? 'CONSUMED' : 'AVAILABLE',
      consumedAt: isConsumed ? fallbackConsumedAt : null
    }
  })
}

const persistImportedClientBono = async (row: PreparedClientBonoRow) =>
  prisma.bonoPack.create({
    data: {
      clientId: row.clientId,
      name: row.name,
      serviceId: row.serviceId,
      legacyRef: row.legacyRef,
      importSource: CLIENT_BONO_IMPORT_SOURCE,
      totalSessions: row.totalSessions,
      price: row.price,
      purchaseDate: row.purchaseDate,
      expiryDate: row.expiryDate,
      status: row.status,
      notes: row.notes,
      sessions: {
        create: buildImportedBonoSessions(row)
      }
    }
  })

const persistImportedAccountBalance = async (row: PreparedAccountBalanceRow) =>
  prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: row.clientId },
      select: { id: true, accountBalance: true }
    })

    if (!client) {
      throw new AccountBalanceError(404, 'Client not found')
    }

    const currentBalance = toNumber(client.accountBalance)
    const nextBalance = normalizeMoney(currentBalance + row.amount)

    await tx.client.update({
      where: { id: row.clientId },
      data: { accountBalance: nextBalance }
    })

    await tx.accountBalanceMovement.create({
      data: {
        clientId: row.clientId,
        type: 'TOP_UP',
        paymentMethod: null,
        operationDate: row.operationDate,
        description: row.description,
        referenceItem: null,
        legacyRef: row.legacyRef,
        importSource: ACCOUNT_BALANCE_IMPORT_SOURCE,
        amount: row.amount,
        balanceAfter: nextBalance,
        notes: row.notes
      }
    })
  })

const serializeMovement = (movement: {
  id: string
  clientId: string
  saleId: string | null
  type: string
  paymentMethod?: string | null
  operationDate: Date
  description: string
  referenceItem: string | null
  amount: Prisma.Decimal
  balanceAfter: Prisma.Decimal
  notes: string | null
  createdAt: Date
}) => ({
  ...movement,
  amount: toNumber(movement.amount),
  balanceAfter: toNumber(movement.balanceAfter)
})

const toHttpError = (error: unknown) => {
  if (error instanceof AccountBalanceError || error instanceof BonoOperationError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  return { statusCode: 500, message: 'Internal server error' }
}

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

type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>

const buildAppointmentServicesCreateData = (serviceIds: string[]) =>
  serviceIds.map((serviceId, index) => ({
    serviceId,
    sortOrder: index
  }))

const sessionInclude = {
  orderBy: { sessionNumber: 'asc' as const },
  include: {
    appointment: {
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        cabin: true
      }
    }
  }
}

const toDate = (value: string | Date) => new Date(value)

const resolveProfessionalName = async (userId: unknown, professional: unknown) => {
  const normalizedProfessional = String(professional ?? '').trim()
  if (normalizedProfessional) {
    return normalizedProfessional
  }

  const normalizedUserId = String(userId ?? '').trim()
  if (!normalizedUserId) {
    return ''
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: { name: true }
  })

  return String(user?.name ?? '').trim()
}

const toAppointmentDateTime = (appointment: { date: Date; startTime: string }) => {
  const at = new Date(appointment.date)
  const [hours, minutes] = String(appointment.startTime || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10))
  at.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return at
}

const buildCalendarSyncInput = (appointment: AppointmentRecord): AppointmentSyncInput => {
  const clientName = getAppointmentDisplayName(appointment, 'Cliente')
  const phone = getAppointmentDisplayPhone(appointment)
  const phoneLine = phone ? `\nTelefono: ${phone}` : ''
  const serviceLabel = getAppointmentServiceLabel(appointment) || appointment.service.name

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

const persistCalendarSyncResult = async (
  appointmentId: string,
  syncResult: Awaited<ReturnType<typeof googleCalendarService.upsertAppointmentEvent>>
) => {
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

export const getClientBonos = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params

    const bonoPacks = await prisma.bonoPack.findMany({
      where: { clientId },
      include: {
        service: { select: { id: true, name: true } },
        sessions: sessionInclude
      },
      orderBy: { purchaseDate: 'desc' }
    })

    res.json(bonoPacks)
  } catch (error) {
    console.error('Get client bonos error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getBonoTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await readBonoTemplates()
    res.json(sortBonoTemplates(templates.filter((template) => template.isActive !== false)))
  } catch (error) {
    console.error('Get bono templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoTemplate = async (req: Request, res: Response) => {
  try {
    const category = String(req.body.category || '').trim()
    const description = String(req.body.description || '').trim()
    const serviceId = String(req.body.serviceId || '').trim()
    const totalSessions = Number.parseInt(String(req.body.totalSessions), 10)
    const price = normalizeMoney(Number(req.body.price || 0))
    const isActive = req.body.isActive !== false

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    if (!service) {
      return res.status(404).json({ error: 'No se encontró el tratamiento base seleccionado' })
    }

    const templates = await readBonoTemplates()
    const templateIdentityKey = buildBonoTemplateIdentityKey(service.id, description, totalSessions)
    const duplicateTemplate = templateIdentityKey
      ? templates.find((template) => {
          const currentKey = buildBonoTemplateIdentityKey(
            template.serviceId,
            template.description,
            Number(template.totalSessions || 0)
          )
          return currentKey === templateIdentityKey
        })
      : null

    if (duplicateTemplate) {
      return res.status(409).json({
        error: 'Ya existe un bono con ese tratamiento, descripción y número de sesiones'
      })
    }

    const nextTemplate: BonoTemplate = {
      id: randomUUID(),
      category: category || String(service.category || '').trim() || 'Bonos',
      description,
      serviceId: service.id,
      serviceName: service.name,
      serviceLookup: buildBonoTemplateServiceLookup(service),
      totalSessions,
      price,
      isActive,
      createdAt: new Date().toISOString()
    }

    await writeBonoTemplates([...templates, nextTemplate])
    res.status(201).json(nextTemplate)
  } catch (error) {
    console.error('Create bono template error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importBonoTemplatesFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const selectedSheet = selectBonoTemplateSheet(workbook)

    if (!selectedSheet || selectedSheet.rawRows.length === 0) {
      return res.status(400).json({ error: 'No se encontró una hoja válida para importar bonos' })
    }

    const { sheetName, rawRows } = selectedSheet

    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        serviceCode: true,
        category: true
      }
    })

    const resolveService = (lookupValue: string) => {
      const normalizedLookup = normalizeSearchText(lookupValue)
      if (!normalizedLookup) return null

      return (
        services.find((service) => normalizeSearchText(service.serviceCode) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(service.name) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(`${service.name} ${service.category}`) === normalizedLookup) ||
        services.find((service) => normalizeSearchText(service.name).includes(normalizedLookup))
      )
    }

    const results = {
      success: 0,
      created: 0,
      updated: 0,
      errors: [] as { row: number; error: string }[],
      skipped: 0
    }

    const existingTemplates = await readBonoTemplates()
    const mergedTemplates = [...existingTemplates]
    const templateIndexByKey = new Map<string, number>()
    const processedTemplateKeys = new Set<string>()

    mergedTemplates.forEach((template, index) => {
      const templateKey = buildBonoTemplateIdentityKey(
        template.serviceId,
        template.description,
        Number(template.totalSessions || 0)
      )
      if (templateKey && !templateIndexByKey.has(templateKey)) {
        templateIndexByKey.set(templateKey, index)
      }
    })

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = buildNormalizedTemplateRow(rawRows[i] || {})

      try {
        const category = String(
          getTemplateRowValue(row, ['Categoria', 'Categoría', 'Familia', 'family']) || ''
        ).trim()
        const serviceLookup = String(
          getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) || ''
        ).trim()
        const description = String(
          getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) || ''
        ).trim()
        const price = parseTemplatePrice(
          getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP'])
        )
        const totalSessions =
          parseTemplateSessions(getTemplateRowValue(row, ['Sesiones', 'Total sesiones', 'Numero sesiones'])) ||
          parseTemplateSessions(description)

        if (!serviceLookup || !description) {
          results.skipped += 1
          continue
        }

        if (!totalSessions) {
          throw new Error('No se pudo deducir el número de sesiones')
        }

        const resolvedService = resolveService(serviceLookup)
        if (!resolvedService) {
          throw new Error(`No se encontró el tratamiento base: ${serviceLookup}`)
        }

        const templateKey = buildBonoTemplateIdentityKey(resolvedService.id, description, totalSessions)
        if (!templateKey) {
          throw new Error('No se pudo construir la identidad del bono importado')
        }

        if (processedTemplateKeys.has(templateKey)) {
          results.skipped += 1
          continue
        }

        const existingTemplateIndex = templateIndexByKey.get(templateKey)
        const nextTemplate: BonoTemplate = {
          id: existingTemplateIndex !== undefined ? mergedTemplates[existingTemplateIndex].id : randomUUID(),
          category: category || resolvedService.category || 'Bonos',
          description,
          serviceId: resolvedService.id,
          serviceName: resolvedService.name,
          serviceLookup: buildBonoTemplateServiceLookup(resolvedService),
          totalSessions,
          price,
          isActive: true,
          createdAt:
            existingTemplateIndex !== undefined
              ? mergedTemplates[existingTemplateIndex].createdAt
              : new Date().toISOString()
        }

        if (existingTemplateIndex !== undefined) {
          mergedTemplates[existingTemplateIndex] = nextTemplate
          results.updated += 1
        } else {
          mergedTemplates.push(nextTemplate)
          templateIndexByKey.set(templateKey, mergedTemplates.length - 1)
          results.created += 1
        }

        processedTemplateKeys.add(templateKey)
        results.success += 1
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped += 1
      }
    }

    if (results.success > 0) {
      await writeBonoTemplates(mergedTemplates)
    }

    res.json({
      message: `Bonus catalog imported from ${sheetName}`,
      results
    })
  } catch (error) {
    console.error('Import bono templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importClientBonosFromSpreadsheet = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const mode = String(req.body?.mode || 'preview').trim().toLowerCase() === 'commit' ? 'commit' : 'preview'
    const createMissingClients =
      req.body?.createMissingClients === true ||
      String(req.body?.createMissingClients || '')
        .trim()
        .toLowerCase() === 'true'
    const sheet = await loadLegacySpreadsheetSheet(req.file.buffer, req.file.originalname)

    if (sheet.rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron filas para importar en el archivo' })
    }

    const [clients, services, existingBonos] = await prisma.$transaction([
      prisma.client.findMany({
        select: {
          id: true,
          externalCode: true,
          firstName: true,
          lastName: true
        }
      }),
      prisma.service.findMany({
        where: { isActive: true },
        select: {
          id: true,
          serviceCode: true,
          name: true
        }
      }),
      prisma.bonoPack.findMany({
        where: {
          importSource: CLIENT_BONO_IMPORT_SOURCE,
          legacyRef: {
            not: null
          }
        },
        select: {
          clientId: true,
          legacyRef: true
        }
      })
    ])

    const existingImportKeys = new Set(
      existingBonos
        .filter((bono) => bono.legacyRef)
        .map((bono) => buildClientBonoImportKey(bono.clientId, String(bono.legacyRef)))
    )

    const preparedImport = buildClientBonoImportPreview(sheet.rows, clients, services, existingImportKeys)

    if (mode === 'preview') {
      return res.json({
        stage: 'preview',
        sheetName: sheet.name,
        preview: preparedImport.preview
      })
    }

    const successItems: ImportListItem[] = []
    const existingItems = [...preparedImport.preview.existing.items]
    const errorItems = [...preparedImport.preview.errors.items]
    const missingClientOutcomes = new Map<string, MissingLegacyImportClientSummary>()
    const createdClientsByKey = new Map<string, LegacyClientLookupRecord>()
    const processedImportKeys = new Set<string>()
    let createdClients = 0

    for (const row of preparedImport.ready) {
      const importKey = buildClientBonoImportKey(row.clientId, row.legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: row.row,
          message: `${row.message} · ya importado`
        })
        continue
      }

      try {
        await persistImportedClientBono(row)

        processedImportKeys.add(importKey)
        successItems.push({
          row: row.row,
          message: row.message
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          existingItems.push({
            row: row.row,
            message: `${row.name} · bono ${row.legacyRef} ya importado`
          })
          continue
        }

        errorItems.push({
          row: row.row,
          message: error?.message || 'No se pudo importar el bono'
        })
      }
    }

    for (const row of preparedImport.missingClientRows) {
      if (!createMissingClients) {
        pushMissingLegacyClientOutcome(missingClientOutcomes, row.missingClient, row.row, 'skipped')
        continue
      }

      let createdClient = createdClientsByKey.get(row.missingClient.key) || null
      if (!createdClient) {
        try {
          createdClient = await createClientFromLegacyImport(row.missingClient)
          createdClientsByKey.set(row.missingClient.key, createdClient)
          createdClients += 1
        } catch (error: any) {
          errorItems.push({
            row: row.row,
            message: error?.message || 'No se pudo crear la ficha del cliente'
          })
          continue
        }
      }

      pushMissingLegacyClientOutcome(missingClientOutcomes, row.missingClient, row.row, 'created')

      const importKey = buildClientBonoImportKey(createdClient.id, row.legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: row.row,
          message: `${row.message} · ya importado`
        })
        continue
      }

      try {
        await persistImportedClientBono({
          row: row.row,
          message: row.message,
          clientId: createdClient.id,
          legacyRef: row.legacyRef,
          name: row.name,
          serviceId: row.serviceId,
          totalSessions: row.totalSessions,
          consumedSessions: row.consumedSessions,
          remainingSessions: row.remainingSessions,
          purchaseDate: row.purchaseDate,
          expiryDate: row.expiryDate,
          price: row.price,
          status: row.status,
          notes: row.notes,
          lastSessionAt: row.lastSessionAt
        })

        processedImportKeys.add(importKey)
        successItems.push({
          row: row.row,
          message: row.message
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          existingItems.push({
            row: row.row,
            message: `${row.message} · ya importado`
          })
          continue
        }

        errorItems.push({
          row: row.row,
          message: error?.message || 'No se pudo importar el bono'
        })
      }
    }

    res.json({
      stage: 'commit',
      sheetName: sheet.name,
      results: {
        success: toSection(successItems),
        createdClients,
        existing: toSection(existingItems),
        depleted: preparedImport.preview.depleted,
        missingClients: toSection(sortMissingLegacyClientSummaries([...missingClientOutcomes.values()])),
        errors: toSection(errorItems)
      }
    })
  } catch (error) {
    console.error('Import client bonos error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importAccountBalanceFromSpreadsheet = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const mode = String(req.body?.mode || 'preview').trim().toLowerCase() === 'commit' ? 'commit' : 'preview'
    const createMissingClients =
      req.body?.createMissingClients === true ||
      String(req.body?.createMissingClients || '')
        .trim()
        .toLowerCase() === 'true'
    const sheet = await loadLegacySpreadsheetSheet(req.file.buffer, req.file.originalname)

    if (sheet.rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron filas para importar en el archivo' })
    }

    const [clients, existingMovements] = await prisma.$transaction([
      prisma.client.findMany({
        select: {
          id: true,
          externalCode: true,
          firstName: true,
          lastName: true
        }
      }),
      prisma.accountBalanceMovement.findMany({
        where: {
          importSource: ACCOUNT_BALANCE_IMPORT_SOURCE,
          legacyRef: {
            not: null
          }
        },
        select: {
          clientId: true,
          legacyRef: true
        }
      })
    ])

    const existingImportKeys = new Set(
      existingMovements
        .filter((movement) => movement.legacyRef)
        .map((movement) => buildAccountBalanceImportKey(movement.clientId, String(movement.legacyRef)))
    )

    const preparedImport = buildAccountBalanceImportPreview(sheet.rows, clients, existingImportKeys)

    if (mode === 'preview') {
      return res.json({
        stage: 'preview',
        sheetName: sheet.name,
        preview: preparedImport.preview
      })
    }

    const successItems: ImportListItem[] = []
    const existingItems = [...preparedImport.preview.existing.items]
    const errorItems = [...preparedImport.preview.errors.items]
    const missingClientOutcomes = new Map<string, MissingLegacyImportClientSummary>()
    const createdClientsByKey = new Map<string, LegacyClientLookupRecord>()
    const processedImportKeys = new Set<string>()
    let createdClients = 0

    for (const row of preparedImport.ready) {
      const importKey = buildAccountBalanceImportKey(row.clientId, row.legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: row.row,
          message: `${row.message} · ya importado`
        })
        continue
      }

      try {
        await persistImportedAccountBalance(row)

        processedImportKeys.add(importKey)
        successItems.push({
          row: row.row,
          message: row.message
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          existingItems.push({
            row: row.row,
            message: `${row.description} (${row.legacyRef}) ya importado`
          })
          continue
        }

        errorItems.push({
          row: row.row,
          message: error?.message || 'No se pudo importar el abono'
        })
      }
    }

    for (const row of preparedImport.missingClientRows) {
      if (!createMissingClients) {
        pushMissingLegacyClientOutcome(missingClientOutcomes, row.missingClient, row.row, 'skipped')
        continue
      }

      let createdClient = createdClientsByKey.get(row.missingClient.key) || null
      if (!createdClient) {
        try {
          createdClient = await createClientFromLegacyImport(row.missingClient)
          createdClientsByKey.set(row.missingClient.key, createdClient)
          createdClients += 1
        } catch (error: any) {
          errorItems.push({
            row: row.row,
            message: error?.message || 'No se pudo crear la ficha del cliente'
          })
          continue
        }
      }

      pushMissingLegacyClientOutcome(missingClientOutcomes, row.missingClient, row.row, 'created')

      const importKey = buildAccountBalanceImportKey(createdClient.id, row.legacyRef)
      if (existingImportKeys.has(importKey) || processedImportKeys.has(importKey)) {
        existingItems.push({
          row: row.row,
          message: `${row.message} · ya importado`
        })
        continue
      }

      try {
        await persistImportedAccountBalance({
          row: row.row,
          message: row.message,
          clientId: createdClient.id,
          legacyRef: row.legacyRef,
          description: row.description,
          amount: row.amount,
          operationDate: row.operationDate,
          notes: row.notes
        })

        processedImportKeys.add(importKey)
        successItems.push({
          row: row.row,
          message: row.message
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          existingItems.push({
            row: row.row,
            message: `${row.message} · ya importado`
          })
          continue
        }

        errorItems.push({
          row: row.row,
          message: error?.message || 'No se pudo importar el abono'
        })
      }
    }

    res.json({
      stage: 'commit',
      sheetName: sheet.name,
      results: {
        success: toSection(successItems),
        createdClients,
        existing: toSection(existingItems),
        withoutBalance: preparedImport.preview.withoutBalance,
        missingClients: toSection(sortMissingLegacyClientSummaries([...missingClientOutcomes.values()])),
        errors: toSection(errorItems)
      }
    })
  } catch (error) {
    console.error('Import account balance error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoPack = async (req: Request, res: Response) => {
  try {
    const { clientId, name, serviceId, totalSessions, price, expiryDate, notes } = req.body

    if (!clientId || !name || !totalSessions || totalSessions < 1) {
      return res.status(400).json({ error: 'clientId, name and totalSessions (>= 1) are required' })
    }

    const parsedTotalSessions = Number.parseInt(String(totalSessions), 10)
    if (!Number.isFinite(parsedTotalSessions) || parsedTotalSessions < 1) {
      return res.status(400).json({ error: 'totalSessions must be a positive integer' })
    }

    const parsedPrice = Number(price || 0)

    const bonoPack = await prisma.bonoPack.create({
      data: {
        clientId,
        name,
        serviceId: serviceId || null,
        totalSessions: parsedTotalSessions,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: notes || null,
        sessions: {
          create: Array.from({ length: parsedTotalSessions }, (_, i) => ({
            sessionNumber: i + 1
          }))
        }
      },
      include: {
        service: { select: { id: true, name: true } },
        sessions: sessionInclude
      }
    })

    res.status(201).json(bonoPack)
  } catch (error) {
    console.error('Create bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createBonoAppointment = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params
    const {
      userId,
      cabin,
      date,
      startTime,
      status,
      notes,
      reminder
    } = req.body

    const bonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        client: true,
        service: true,
        sessions: {
          orderBy: { sessionNumber: 'asc' }
        }
      }
    })

    if (!bonoPack) {
      throw new BonoOperationError(404, 'BonoPack not found')
    }

    if (bonoPack.status !== 'ACTIVE') {
      throw new BonoOperationError(400, 'BonoPack is not active')
    }

    const requestedServiceIds = deriveAppointmentServiceIds(req.body, bonoPack.serviceId ? [bonoPack.serviceId] : [])
    if (requestedServiceIds.length === 0) {
      throw new BonoOperationError(400, 'serviceId is required for this bono')
    }

    const availableServices = await prisma.service.findMany({
      where: {
        id: {
          in: requestedServiceIds
        }
      },
      select: {
        id: true,
        name: true,
        duration: true
      }
    })

    const servicesById = new Map(availableServices.map((service) => [service.id, service]))
    const selectedServices = requestedServiceIds
      .map((serviceId: string) => servicesById.get(serviceId) || null)
      .filter((service): service is (typeof availableServices)[number] => service !== null)

    if (selectedServices.length !== requestedServiceIds.length) {
      throw new BonoOperationError(400, 'Uno o mas servicios no existen')
    }

    const resolvedServiceId = selectedServices[0]?.id || ''
    if (!resolvedServiceId) {
      throw new BonoOperationError(400, 'serviceId is required for this bono')
    }

    const nextReservableSession = bonoPack.sessions.find(
      (session) => session.status === 'AVAILABLE' && !session.appointmentId
    )

    if (!nextReservableSession) {
      throw new BonoOperationError(400, 'No available sessions to reserve')
    }

    const professional = await resolveProfessionalName(userId, req.body.professional)

    if (!professional) {
      throw new BonoOperationError(400, 'Debe indicar un profesional valido')
    }

    const appointmentPayload: Prisma.AppointmentUncheckedCreateInput = {
      clientId: bonoPack.clientId,
      userId: String(userId),
      serviceId: resolvedServiceId,
      cabin: cabin as string,
      professional,
      date: toDate(String(date)),
      startTime: String(startTime),
      endTime: calculateAppointmentEndTime(
        String(startTime),
        selectedServices.reduce((total, service) => total + Math.max(0, Number(service.duration || 0)), 0)
      ),
      status: (status as string) || 'SCHEDULED',
      notes: notes ? String(notes) : null,
      reminder: reminder === undefined ? true : Boolean(reminder)
    }

    const validation = await validateAppointmentSlot({
      date: appointmentPayload.date as Date,
      startTime: appointmentPayload.startTime as string,
      endTime: appointmentPayload.endTime as string,
      professional,
      cabin: appointmentPayload.cabin as string,
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

    const createdAppointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          ...appointmentPayload,
          appointmentServices: {
            create: buildAppointmentServicesCreateData(selectedServices.map((service) => service.id))
          }
        },
        include: appointmentInclude
      })

      const reservedCount = await tx.bonoSession.updateMany({
        where: {
          id: nextReservableSession.id,
          status: 'AVAILABLE',
          appointmentId: null
        },
        data: {
          appointmentId: created.id
        }
      })

      if (reservedCount.count === 0) {
        throw new BonoOperationError(409, 'The selected bono session is no longer available')
      }

      return created
    })

    const syncResult = await googleCalendarService.upsertAppointmentEvent(buildCalendarSyncInput(createdAppointment))
    const appointment = await persistCalendarSyncResult(createdAppointment.id, syncResult)

    if (appointmentPayload.reminder) {
      const appointmentName = getAppointmentDisplayName(appointment, 'Cliente')
      await prisma.notification.create({
        data: {
          type: 'APPOINTMENT',
          title: 'Nueva cita programada desde bono',
          message: `Cita con ${appointmentName} el ${new Date(appointment.date).toLocaleDateString()}`,
          priority: 'NORMAL'
        }
      })
    }

    res.status(201).json(appointment)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Create bono appointment error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const consumeSession = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    const bonoPack = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        sessions: sessionInclude,
        client: { select: { id: true, firstName: true, lastName: true } }
      }
    })

    if (!bonoPack) {
      return res.status(404).json({ error: 'BonoPack not found' })
    }

    if (bonoPack.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'BonoPack is not active' })
    }

    const isFutureReservation = (session: (typeof bonoPack.sessions)[number]) => {
      if (session.status !== 'AVAILABLE' || !session.appointment) return false
      const status = String(session.appointment.status || '').toUpperCase()
      if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'COMPLETED') return false
      return toAppointmentDateTime({
        date: session.appointment.date,
        startTime: session.appointment.startTime
      }) > new Date()
    }

    const nextAvailable = bonoPack.sessions.find(
      (session) => session.status === 'AVAILABLE' && !isFutureReservation(session)
    )
    if (!nextAvailable) {
      return res.status(400).json({ error: 'No available sessions ready to consume' })
    }

    await prisma.bonoSession.update({
      where: { id: nextAvailable.id },
      data: { status: 'CONSUMED', consumedAt: new Date() }
    })

    const remainingAvailable = bonoPack.sessions.filter((session) => session.status === 'AVAILABLE').length - 1
    if (remainingAvailable === 0) {
      await prisma.bonoPack.update({
        where: { id: bonoPackId },
        data: { status: 'DEPLETED' }
      })

      await prisma.notification.create({
        data: {
          type: 'BONO_DEPLETED',
          title: `Bono agotado: ${bonoPack.name}`,
          message: `El bono "${bonoPack.name}" de ${bonoPack.client.firstName} ${bonoPack.client.lastName} se ha agotado.`,
          priority: 'NORMAL'
        }
      })
    }

    const updated = await prisma.bonoPack.findUnique({
      where: { id: bonoPackId },
      include: {
        service: { select: { id: true, name: true } },
        sessions: sessionInclude
      }
    })

    res.json(updated)
  } catch (error) {
    console.error('Consume session error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteBonoPack = async (req: Request, res: Response) => {
  try {
    const { bonoPackId } = req.params

    await prisma.bonoPack.delete({
      where: { id: bonoPackId }
    })

    res.json({ message: 'BonoPack deleted successfully' })
  } catch (error) {
    console.error('Delete bono pack error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAccountBalanceHistory = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50

    const [client, movements] = await prisma.$transaction([
      prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          accountBalance: true
        }
      }),
      prisma.accountBalanceMovement.findMany({
        where: { clientId },
        orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
        take: limit
      })
    ])

    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }

    res.json({
      clientId: client.id,
      currentBalance: toNumber(client.accountBalance),
      movements: movements.map(serializeMovement)
    })
  } catch (error) {
    console.error('Get account balance history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getGlobalAccountBalanceHistory = async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit ?? '300'), 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 300

    const movements = await prisma.accountBalanceMovement.findMany({
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            paymentMethod: true,
            paymentBreakdown: true,
            status: true,
            pendingPayment: {
              select: {
                collections: {
                  select: {
                    amount: true,
                    paymentMethod: true,
                    showInOfficialCash: true,
                    operationDate: true,
                    createdAt: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
      take: limit
    })

    res.json({
      movements: movements.map((movement) => ({
        ...serializeMovement(movement),
        client: movement.client,
        sale: movement.sale
      }))
    })
  } catch (error) {
    console.error('Get global account balance history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createAccountBalanceTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { description, amount, paymentMethod, operationDate, notes } = req.body

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new AccountBalanceError(400, 'Amount must be greater than zero')
    }

    const normalizedPaymentMethod = normalizeTopUpPaymentMethod(paymentMethod)
    if (!normalizedPaymentMethod) {
      throw new AccountBalanceError(400, 'Invalid payment method for top-up')
    }

    if (!req.user?.id) {
      throw new AccountBalanceError(401, 'Unauthorized')
    }
    const userId = req.user.id

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, firstName: true, lastName: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const currentBalance = toNumber(client.accountBalance)
      const nextBalance = normalizeMoney(currentBalance + parsedAmount)
      const operationAt = operationDate ? new Date(operationDate) : new Date()

      await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: nextBalance }
      })

      const movement = await tx.accountBalanceMovement.create({
        data: {
          clientId,
          type: 'TOP_UP',
          paymentMethod: normalizedPaymentMethod,
          operationDate: operationAt,
          description: String(description).trim(),
          referenceItem: null,
          amount: parsedAmount,
          balanceAfter: nextBalance,
          notes: notes || null
        } as Prisma.AccountBalanceMovementUncheckedCreateInput
      })

      const openCashRegister = await tx.cashRegister.findFirst({
        where: { status: 'OPEN' },
        select: { id: true }
      })

      if (openCashRegister) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: openCashRegister.id,
            userId,
            type: 'INCOME',
            paymentMethod: normalizedPaymentMethod,
            amount: parsedAmount,
            category: 'Abonos',
            description: `Recarga de abono · ${client.firstName} ${client.lastName}`.trim(),
            reference: String(description).trim(),
            date: operationAt
          }
        })
      }

      return {
        currentBalance: nextBalance,
        movement: serializeMovement(movement)
      }
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Create account balance top-up error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const consumeAccountBalance = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { operationDate, referenceItem, amount, notes, saleId, description } = req.body

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new AccountBalanceError(400, 'Amount must be greater than zero')
    }

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const currentBalance = toNumber(client.accountBalance)
      if (currentBalance < parsedAmount) {
        throw new AccountBalanceError(400, 'Insufficient account balance')
      }

      const nextBalance = normalizeMoney(currentBalance - parsedAmount)

      await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: nextBalance }
      })

      const movement = await tx.accountBalanceMovement.create({
        data: {
          clientId,
          saleId: saleId || null,
          type: 'CONSUMPTION',
          operationDate: operationDate ? new Date(operationDate) : new Date(),
          description: String(description || 'Consumo de abono').trim(),
          referenceItem: String(referenceItem).trim(),
          amount: parsedAmount,
          balanceAfter: nextBalance,
          notes: notes || null
        }
      })

      return {
        currentBalance: nextBalance,
        movement: serializeMovement(movement)
      }
    })

    res.status(201).json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Consume account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateAccountBalance = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params
    const { accountBalance } = req.body

    const nextBalance = accountBalance !== null && accountBalance !== undefined ? Number(accountBalance) : 0
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      return res.status(400).json({ error: 'accountBalance must be a valid number >= 0' })
    }

    const response = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, accountBalance: true }
      })

      if (!client) {
        throw new AccountBalanceError(404, 'Client not found')
      }

      const previousBalance = toNumber(client.accountBalance)
      const normalizedNext = normalizeMoney(nextBalance)

      const updatedClient = await tx.client.update({
        where: { id: clientId },
        data: { accountBalance: normalizedNext }
      })

      if (previousBalance !== normalizedNext) {
        const difference = Math.abs(normalizedNext - previousBalance)
        await tx.accountBalanceMovement.create({
          data: {
            clientId,
            type: 'ADJUSTMENT',
            operationDate: new Date(),
            description: `Ajuste manual de saldo: ${previousBalance.toFixed(2)}€ -> ${normalizedNext.toFixed(2)}€`,
            referenceItem: null,
            amount: difference,
            balanceAfter: normalizedNext,
            notes: null
          }
        })
      }

      return updatedClient
    })

    res.json(response)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Update account balance error:', error)
    res.status(statusCode).json({ error: message })
  }
}
