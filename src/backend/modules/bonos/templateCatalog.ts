import { randomUUID } from 'crypto'
import type { Workbook } from 'exceljs'
import { prisma } from '../../db'
import { worksheetToObjects } from '../../utils/spreadsheet'
import { BonoOperationError } from './errors'

const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'

export type BonoTemplate = {
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

export const sortBonoTemplates = (templates: BonoTemplate[]) =>
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

export const normalizeTemplateKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const buildNormalizedTemplateRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeTemplateKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

export const getTemplateRowValue = (row: Record<string, unknown>, aliases: string[]) => {
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

export const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const normalizeCategoryMatch = (value: unknown) => normalizeSearchText(value).replace(/\s+/g, ' ')

export const parseTemplatePrice = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return 0
  const normalized = String(value).trim().replace(/\s*€\s*/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? normalizeMoney(parsed) : 0
}

export const parseTemplateSessions = (value: unknown) => {
  if (value === null || value === undefined) return null
  const match = String(value).match(/(\d+)/)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export const buildBonoTemplateIdentityKey = (serviceId: string, description: string, totalSessions: number) => {
  const normalizedServiceId = String(serviceId || '').trim()
  const normalizedDescription = normalizeSearchText(description)
  const parsedSessions = Number(totalSessions || 0)

  if (!normalizedServiceId || !normalizedDescription || !Number.isFinite(parsedSessions) || parsedSessions < 1) {
    return null
  }

  return `${normalizedServiceId}::${normalizedDescription}::${parsedSessions}`
}

export const buildBonoTemplateServiceLookup = (service: { serviceCode?: string | null; name: string }) =>
  String(service.serviceCode || service.name || '').trim()

const coerceBonoTemplate = (template: unknown): BonoTemplate | null => {
  if (!template || typeof template !== 'object') {
    return null
  }

  const row = template as Partial<BonoTemplate>
  const totalSessions = Number(row.totalSessions) || 0

  if (!row.id || !row.description || !row.serviceId || totalSessions < 1) {
    return null
  }

  return {
    id: String(row.id).trim(),
    category: String(row.category || '').trim(),
    description: String(row.description || '').trim(),
    serviceId: String(row.serviceId || '').trim(),
    serviceName: String(row.serviceName || '').trim(),
    serviceLookup: String(row.serviceLookup || '').trim(),
    totalSessions,
    price: normalizeMoney(Number(row.price) || 0),
    isActive: row.isActive !== false,
    createdAt: String(row.createdAt || new Date().toISOString())
  }
}

export const readBonoTemplates = async (options: { onlyActive?: boolean } = {}) => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY }
  })

  if (!setting) return [] as BonoTemplate[]

  try {
    const parsed = JSON.parse(setting.value)
    const templates = Array.isArray(parsed)
      ? parsed
          .map((template) => coerceBonoTemplate(template))
          .filter((template): template is BonoTemplate => Boolean(template))
      : []

    return options.onlyActive ? templates.filter((template) => template.isActive !== false) : templates
  } catch {
    return []
  }
}

export const writeBonoTemplates = async (templates: BonoTemplate[]) => {
  const value = JSON.stringify(sortBonoTemplates(templates))

  await prisma.setting.upsert({
    where: { key: BONO_TEMPLATES_SETTING_KEY },
    update: {
      value,
      description: 'Catalogo importado de bonos'
    },
    create: {
      key: BONO_TEMPLATES_SETTING_KEY,
      value,
      description: 'Catalogo importado de bonos'
    }
  })
}

export const createStoredBonoTemplate = (payload: {
  category?: string | null
  description: string
  service: {
    id: string
    name: string
    serviceCode?: string | null
    category?: string | null
  }
  totalSessions: number
  price: number
  isActive?: boolean
  id?: string | null
  createdAt?: string | null
}): BonoTemplate => ({
  id: String(payload.id || randomUUID()),
  category: String(payload.category || payload.service.category || '').trim() || 'Bonos',
  description: String(payload.description || '').trim(),
  serviceId: payload.service.id,
  serviceName: payload.service.name,
  serviceLookup: buildBonoTemplateServiceLookup(payload.service),
  totalSessions: Number(payload.totalSessions) || 0,
  price: normalizeMoney(Number(payload.price) || 0),
  isActive: payload.isActive !== false,
  createdAt: String(payload.createdAt || new Date().toISOString())
})

export const normalizeBonoTemplateId = (value: unknown) => String(value || '').trim()

const normalizeBonoPackTemplateName = (value: unknown) =>
  normalizeSearchText(value)
    .replace(/\s+/g, ' ')
    .trim()

const stripBonoPackSessionSuffix = (value: string) =>
  value
    .replace(/\b\d+\s*sesiones?\b/g, ' ')
    .replace(/[·|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const scoreBonoTemplateNameMatch = (packName: string, template: BonoTemplate) => {
  const normalizedPackName = normalizeBonoPackTemplateName(packName)
  if (!normalizedPackName) return 0

  const compactPackName = stripBonoPackSessionSuffix(normalizedPackName)
  const normalizedDescription = normalizeBonoPackTemplateName(template.description)
  const normalizedServiceName = normalizeBonoPackTemplateName(template.serviceName)
  const exactCandidates = new Set(
    [
      normalizedDescription,
      normalizedServiceName,
      normalizeBonoPackTemplateName(`${template.description} ${template.serviceName}`),
      normalizeBonoPackTemplateName(`${template.description} - ${template.serviceName}`),
      normalizeBonoPackTemplateName(`${template.serviceName} ${template.description}`)
    ].filter(Boolean)
  )

  if (exactCandidates.has(normalizedPackName)) return 4
  if (compactPackName && exactCandidates.has(compactPackName)) return 3

  const includesDescription = Boolean(normalizedDescription && normalizedPackName.includes(normalizedDescription))
  const includesServiceName = Boolean(normalizedServiceName && normalizedPackName.includes(normalizedServiceName))

  if (includesDescription && includesServiceName) return 3
  if (includesDescription || includesServiceName) return 2

  if (compactPackName) {
    const compactIncludesDescription = Boolean(normalizedDescription && compactPackName.includes(normalizedDescription))
    const compactIncludesServiceName = Boolean(normalizedServiceName && compactPackName.includes(normalizedServiceName))

    if (compactIncludesDescription && compactIncludesServiceName) return 2
    if (compactIncludesDescription || compactIncludesServiceName) return 1
  }

  return 0
}

export const resolveBonoTemplateForPack = (
  templates: BonoTemplate[],
  payload: {
    bonoTemplateId?: string | null
    serviceId?: string | null
    name?: string | null
    totalSessions?: number | null
  }
) => {
  const explicitTemplateId = normalizeBonoTemplateId(payload.bonoTemplateId)
  const normalizedServiceId = String(payload.serviceId || '').trim()
  const parsedTotalSessions = Number(payload.totalSessions || 0)

  if (explicitTemplateId) {
    const explicitTemplate = templates.find((template) => template.id === explicitTemplateId) || null
    if (!explicitTemplate) {
      throw new BonoOperationError(404, 'No se encontró el bono del catálogo seleccionado')
    }

    const matchesService = !normalizedServiceId || explicitTemplate.serviceId === normalizedServiceId
    const matchesSessions =
      !Number.isFinite(parsedTotalSessions) ||
      parsedTotalSessions < 1 ||
      Number(explicitTemplate.totalSessions || 0) === parsedTotalSessions

    if (matchesService && matchesSessions) {
      return explicitTemplate
    }
  }

  if (!normalizedServiceId) {
    return null
  }

  let candidates = templates.filter((template) => template.serviceId === normalizedServiceId)

  if (Number.isFinite(parsedTotalSessions) && parsedTotalSessions > 0) {
    const sameSessions = candidates.filter((template) => Number(template.totalSessions || 0) === parsedTotalSessions)

    if (sameSessions.length === 1) {
      return sameSessions[0]
    }

    if (sameSessions.length > 1) {
      candidates = sameSessions
    }
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  const scoredCandidates = candidates
    .map((template) => ({
      template,
      score: scoreBonoTemplateNameMatch(payload.name || '', template)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scoredCandidates.length === 0) {
    return null
  }

  if (scoredCandidates.length === 1 || scoredCandidates[0].score > (scoredCandidates[1]?.score ?? 0)) {
    return scoredCandidates[0].template
  }

  return null
}

export const findBonoTemplateForSaleItem = (
  item: {
    bonoTemplateId?: string | null
    description: string
    serviceId?: string | null
    price: number
  },
  templates: BonoTemplate[]
) => {
  const explicitTemplateId = normalizeBonoTemplateId(item.bonoTemplateId)
  if (explicitTemplateId) {
    return templates.find((template) => template.id === explicitTemplateId) || null
  }

  const normalizedDescription = normalizeSearchText(item.description)
  const normalizedServiceId = normalizeSearchText(item.serviceId || '')
  const normalizedPrice = normalizeMoney(Number(item.price) || 0)

  return (
    templates.find(
      (template) =>
        normalizeSearchText(template.description) === normalizedDescription &&
        normalizeSearchText(template.serviceId) === normalizedServiceId &&
        normalizeMoney(Number(template.price) || 0) === normalizedPrice
    ) || null
  )
}

export const selectBonoTemplateSheet = (workbook: Workbook) => {
  let bestMatch: {
    sheetName: string
    rawRows: Record<string, unknown>[]
    score: number
  } | null = null

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name
    const rawRows = worksheetToObjects(worksheet)
    const normalizedRows = rawRows.slice(0, 25).map((row) => buildNormalizedTemplateRow(row || {}))

    const hasDescriptionColumn = normalizedRows.some(
      (row) => getTemplateRowValue(row, ['Descripcion', 'Descripción', 'Nombre', 'Bono']) !== null
    )
    const hasServiceLookupColumn = normalizedRows.some(
      (row) => getTemplateRowValue(row, ['Codigo', 'Código', 'Servicio', 'Tratamiento', 'service']) !== null
    )
    const hasPriceColumn = normalizedRows.some(
      (row) => getTemplateRowValue(row, ['Tarifa 1', 'Tarifa', 'Precio', 'PVP']) !== null
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
