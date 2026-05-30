import { prisma } from '../db'
import { getSettingByKey, saveSettingByKey } from './settings'

const PROFESSIONALS_SETTING_KEY = 'center_professionals'

const collapseWhitespace = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase('es-ES')
    .split(' ')
    .map((token) => token.charAt(0).toLocaleUpperCase('es-ES') + token.slice(1))
    .join(' ')

export const normalizeProfessionalName = (value: unknown) => {
  const normalized = collapseWhitespace(value)

  if (!normalized) {
    return ''
  }

  if (normalized === normalized.toLocaleUpperCase('es-ES') || normalized === normalized.toLocaleLowerCase('es-ES')) {
    return titleCase(normalized)
  }

  return normalized
}

export const professionalNameKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')

const uniqueProfessionalNames = (items: unknown[]) => {
  const namesByKey = new Map<string, string>()

  for (const item of items) {
    const normalizedName = normalizeProfessionalName(item)
    const key = professionalNameKey(normalizedName)

    if (!normalizedName || !key || namesByKey.has(key)) {
      continue
    }

    namesByKey.set(key, normalizedName)
  }

  return [...namesByKey.values()]
}

const parseStoredProfessionalNames = (value: string | null | undefined) => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? uniqueProfessionalNames(parsed) : []
  } catch {
    return []
  }
}

const loadLegacyProfessionalNames = async () => {
  const [appointments, agendaBlocks, sales, quotes] = await Promise.all([
    prisma.appointment.findMany({ select: { professional: true } }),
    prisma.agendaBlock.findMany({ select: { professional: true } }),
    prisma.sale.findMany({ select: { professional: true } }),
    prisma.quote.findMany({ select: { professional: true } })
  ])

  return uniqueProfessionalNames([
    ...appointments.map((item) => item.professional),
    ...agendaBlocks.map((item) => item.professional),
    ...sales.map((item) => item.professional),
    ...quotes.map((item) => item.professional)
  ])
}

export const getProfessionalCatalog = async (options?: { includeLegacyFallback?: boolean }) => {
  const setting = await getSettingByKey(PROFESSIONALS_SETTING_KEY)

  const storedNames = parseStoredProfessionalNames(setting?.value)
  if (storedNames.length > 0 || options?.includeLegacyFallback === false) {
    return storedNames
  }

  return loadLegacyProfessionalNames()
}

export const saveProfessionalCatalog = async (names: unknown[]) => {
  const normalizedNames = uniqueProfessionalNames(names)

  await saveSettingByKey({
    key: PROFESSIONALS_SETTING_KEY,
    value: JSON.stringify(normalizedNames),
    description: 'Profesionales configurados para agenda, citas e importaciones'
  })

  return normalizedNames
}

export const mergeProfessionalCatalog = async (names: unknown[]) => {
  const currentNames = await getProfessionalCatalog()
  return saveProfessionalCatalog([...currentNames, ...names])
}

export const getDefaultProfessionalName = async () => {
  const professionals = await getProfessionalCatalog()
  return professionals[0] || ''
}

export const findUnknownProfessionalNames = (candidateNames: unknown[], knownNames: string[]) => {
  const knownKeys = new Set(knownNames.map((item) => professionalNameKey(item)).filter(Boolean))

  return uniqueProfessionalNames(candidateNames).filter((name) => !knownKeys.has(professionalNameKey(name)))
}
