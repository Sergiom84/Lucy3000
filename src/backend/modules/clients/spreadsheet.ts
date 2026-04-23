export const textOrNull = (val: unknown): string | null => {
  if (!val) return null
  const s = String(val).trim()
  return s === '' || s === '@' ? null : s
}

export const normalizeColumnKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const buildNormalizedRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeColumnKey(key)
    if (!normalizedKey || Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) continue
    normalized[normalizedKey] = value
  }

  return normalized
}

export const getRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeColumnKey(alias)
    if (!normalizedAlias || !Object.prototype.hasOwnProperty.call(row, normalizedAlias)) continue
    const value = row[normalizedAlias]
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }

  return null
}

export const parseBooleanValue = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value

  const normalized = normalizeColumnKey(String(value).trim())
  if (!normalized) return null

  if (['si', 'true', '1', 'yes', 'y', 'x', 'activo', 'activa'].includes(normalized)) return true
  if (['no', 'false', '0', 'n', 'inactivo', 'inactiva'].includes(normalized)) return false

  return null
}

const parseIntegerValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const getMonthName = (monthNumber: number | null): string | null => {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return null

  const date = new Date(2000, monthNumber - 1, 1)
  const monthName = date.toLocaleDateString('es-ES', { month: 'long' })
  return monthName.charAt(0).toUpperCase() + monthName.slice(1)
}

const parseBirthMonthValue = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null

  const numericMonth = parseIntegerValue(value)
  if (numericMonth && numericMonth >= 1 && numericMonth <= 12) return numericMonth

  const normalized = normalizeColumnKey(String(value))
  const monthMap: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
  }

  return monthMap[normalized] ?? null
}

export const parseExcelDate = (val: unknown): Date | null => {
  if (!val) return null
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val
  }
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30)
    return new Date(epoch.getTime() + val * 86400000)
  }

  const s = String(val).trim()
  if (!s || s === '01-01-01') return null

  const normalizedDate = s.replace(/[./]/g, '-')
  const parts = normalizedDate.split('-')
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    let day: number
    let month: number
    let yyOrYear: number

    if (parts[0].length === 4) {
      yyOrYear = parseInt(parts[0], 10)
      month = parseInt(parts[1], 10)
      day = parseInt(parts[2], 10)
    } else {
      day = parseInt(parts[0], 10)
      month = parseInt(parts[1], 10)
      yyOrYear = parseInt(parts[2], 10)
    }

    if (isNaN(day) || isNaN(month) || isNaN(yyOrYear)) return null
    if (month < 1 || month > 12 || day < 1 || day > 31) return null

    const year =
      parts[0].length === 4 || parts[2].length === 4
        ? yyOrYear
        : yyOrYear <= 30
          ? 2000 + yyOrYear
          : 1900 + yyOrYear
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export const resolveBirthMetadata = (row: Record<string, unknown>) => {
  const explicitYear = parseIntegerValue(getRowValue(row, ['Año de nacimiento', 'Ano de nacimiento', 'birthYear']))
  const explicitDay = parseIntegerValue(getRowValue(row, ['Día de nacimiento', 'Dia de nacimiento', 'birthDay']))
  const explicitMonthNumber = parseBirthMonthValue(
    getRowValue(row, ['Mes de nacimiento', 'Mes de nacimiento 2', 'Mes nacimiento', 'birthMonthNumber', 'birthMonthName'])
  )

  const birthDateRaw = getRowValue(row, ['Fecha de nacimiento', 'birthDate'])
  const birthDate = parseExcelDate(birthDateRaw)

  if (birthDate) {
    if (explicitYear) birthDate.setFullYear(explicitYear)

    return {
      birthDate,
      birthDay: birthDate.getDate(),
      birthMonthNumber: birthDate.getMonth() + 1,
      birthMonthName: getMonthName(birthDate.getMonth() + 1),
      birthYear: birthDate.getFullYear()
    }
  }

  return {
    birthDate: null,
    birthDay: explicitDay,
    birthMonthNumber: explicitMonthNumber,
    birthMonthName: getMonthName(explicitMonthNumber),
    birthYear: explicitYear
  }
}

type ClientReferenceTarget = {
  id: string
  externalCode?: string | null
  email?: string | null
  phone?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  firstName?: string | null
  lastName?: string | null
}

export type ExistingClientIdentity = {
  id: string
  externalCode?: string | null
  dni?: string | null
  email?: string | null
  phone?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  firstName?: string | null
  lastName?: string | null
}

const buildIdentityLookupKey = (prefix: string, value: unknown) => {
  const normalized = normalizeColumnKey(String(value || '').trim())
  return normalized ? `${prefix}:${normalized}` : null
}

const buildCompositeIdentityLookupKey = (prefix: string, left: unknown, right: unknown) => {
  const normalizedLeft = normalizeColumnKey(String(left || '').trim())
  const normalizedRight = normalizeColumnKey(String(right || '').trim())

  if (!normalizedLeft || !normalizedRight) return null

  return `${prefix}:${normalizedLeft}:${normalizedRight}`
}

export const addClientReferenceToLookup = (
  lookup: Map<string, string>,
  client: ClientReferenceTarget
) => {
  const addValue = (value: string | null | undefined) => {
    const normalized = textOrNull(value)
    if (!normalized) return

    const key = normalizeColumnKey(normalized)
    if (!key || lookup.has(key)) return
    lookup.set(key, client.id)
  }

  addValue(client.externalCode)
  addValue(client.email)
  addValue(client.phone)
  addValue(client.mobilePhone)
  addValue(client.landlinePhone)

  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim()
  addValue(fullName)
}

export const addClientIdentityToLookup = (
  lookup: Map<string, string>,
  client: ExistingClientIdentity
) => {
  const addValue = (prefix: string, value: unknown) => {
    const key = buildIdentityLookupKey(prefix, value)
    if (!key || lookup.has(key)) return
    lookup.set(key, client.id)
  }

  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim()
  const addFullNameWithContact = (contact: unknown) => {
    const key = buildCompositeIdentityLookupKey('fullNamePhone', fullName, contact)
    if (!key || lookup.has(key)) return
    lookup.set(key, client.id)
  }

  addValue('externalCode', client.externalCode)
  addValue('dni', client.dni)
  addValue('email', client.email)
  addFullNameWithContact(client.phone)
  addFullNameWithContact(client.mobilePhone)
  addFullNameWithContact(client.landlinePhone)
}

export const findExistingClientIdForImport = (
  lookup: Map<string, string>,
  candidate: {
    externalCode?: string | null
    dni?: string | null
    email?: string | null
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    mobilePhone?: string | null
    landlinePhone?: string | null
  }
) => {
  const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim()
  const orderedKeys = [
    buildIdentityLookupKey('externalCode', candidate.externalCode),
    buildIdentityLookupKey('dni', candidate.dni),
    buildIdentityLookupKey('email', candidate.email),
    buildCompositeIdentityLookupKey('fullNamePhone', fullName, candidate.phone),
    buildCompositeIdentityLookupKey('fullNamePhone', fullName, candidate.mobilePhone),
    buildCompositeIdentityLookupKey('fullNamePhone', fullName, candidate.landlinePhone)
  ]

  for (const key of orderedKeys) {
    if (!key) continue
    const existingId = lookup.get(key)
    if (existingId) return existingId
  }

  return null
}
