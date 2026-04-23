import { Request, Response } from 'express'
import { prisma } from '../../db'
import {
  ACCOUNT_BALANCE_IMPORT_SOURCE,
  persistImportedAccountBalance,
  type PreparedAccountBalanceRow
} from './accountBalance'
import {
  type BonoTemplate,
  buildNormalizedTemplateRow,
  getTemplateRowValue,
  normalizeSearchText,
  normalizeTemplateKey,
  readBonoTemplates,
  resolveBonoTemplateForPack
} from './templateCatalog'
import { loadLegacySpreadsheetSheet } from '../../utils/legacy-spreadsheet'

const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const CLIENT_BONO_IMPORT_SOURCE = 'LEGACY_CLIENT_BONO'

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
  bonoTemplateId: string | null
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

  const normalized = String(value).trim().replace(/\s*€\s*/g, '').replace(/\s/g, '')
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
  const resolvedClientName =
    String(clientName || '').trim() || (normalizedClientCode ? `Cliente ${normalizedClientCode}` : 'Cliente importado')
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
  existingImportKeys: Set<string>,
  bonoTemplates: BonoTemplate[]
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
      const totalSessions = parseImportInteger(getTemplateRowValue(row, ['Nominal', 'Sesiones', 'Total sesiones']))
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
      const resolvedTemplate = resolveBonoTemplateForPack(bonoTemplates, {
        serviceId: serviceResolution.service?.id || null,
        name,
        totalSessions
      })
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
          bonoTemplateId: resolvedTemplate?.id || null,
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
        bonoTemplateId: resolvedTemplate?.id || null,
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
      missingClients: toSection(
        sortMissingLegacyClientSummaries([...buildMissingLegacyClientSummaryMap(missingClientRows).values()])
      ),
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
      missingClients: toSection(
        sortMissingLegacyClientSummaries([...buildMissingLegacyClientSummaryMap(missingClientRows).values()])
      ),
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
      bonoTemplateId: row.bonoTemplateId,
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

export const importClientBonosFromSpreadsheet = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const mode = String(req.body?.mode || 'preview').trim().toLowerCase() === 'commit' ? 'commit' : 'preview'
    const createMissingClients =
      req.body?.createMissingClients === true ||
      String(req.body?.createMissingClients || '').trim().toLowerCase() === 'true'
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

    const bonoTemplates = await readBonoTemplates()
    const preparedImport = buildClientBonoImportPreview(
      sheet.rows,
      clients,
      services,
      existingImportKeys,
      bonoTemplates
    )

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
          bonoTemplateId: row.bonoTemplateId,
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
      String(req.body?.createMissingClients || '').trim().toLowerCase() === 'true'
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
