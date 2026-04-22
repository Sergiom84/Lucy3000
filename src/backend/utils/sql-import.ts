import {
  isLikelyAgendaBlockRow,
  resolveAppointmentCabin,
  resolveAppointmentEndTime,
  resolveAppointmentProfessional
} from './appointment-spreadsheet'

type SqlPrimitive = string | number | null
type SqlRecord = Record<string, SqlPrimitive>

type SqlWarningStep =
  | 'file'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonos'
  | 'clientBonos'
  | 'accountBalances'
  | 'appointments'
  | 'agendaBlocks'
  | 'agendaNotes'
  | 'assets'
  | 'unsupported'

type SqlAnalysisSummary = {
  professionals: number
  clients: number
  services: number
  products: number
  bonoTemplates: number
  clientBonos: number
  accountBalances: number
  appointments: number
  agendaBlocks: number
  agendaNotes: number
  consents: number
  signatures: number
  photoReferencesSkipped: number
  unsupportedPopulatedTables: number
  warnings: number
}

type SqlEditablePreview = {
  id: string
  selected: boolean
  issues: string[]
}

export type SqlImportWarning = {
  code: string
  message: string
  severity: 'info' | 'warning'
  step: SqlWarningStep
  count?: number
}

export type SqlProfessionalPreview = {
  id: string
  code: string
  name: string
  shortName: string | null
  email: string | null
  isActive: boolean
}

export type SqlClientPreview = SqlEditablePreview & {
  legacyId: string
  legacyClientNumber: string
  barcode: string | null
  fullName: string
  firstName: string
  lastName: string
  dni: string | null
  email: string | null
  phone: string | null
  mobilePhone: string | null
  landlinePhone: string | null
  address: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  birthDate: string | null
  registrationDate: string | null
  gender: string | null
  legacyProfessionalCode: string | null
  clientBrand: string | null
  appliedTariff: string | null
  text9A: string | null
  text9B: string | null
  text15: string | null
  text25: string | null
  text100: string | null
  integer1: number | null
  integer2: number | null
  giftVoucher: string | null
  photoRef: string | null
  photoSkinType: string | null
  webKey: string | null
  discountProfile: string | null
  globalClientNumber: string | null
  globalUpdated: boolean
  rejectPostal: boolean
  rejectSms: boolean
  rejectEmail: boolean
  excludeSurvey: boolean
  registeredSurvey: boolean
  legacySha1: string | null
  notes: string | null
  isActive: boolean
}

export type SqlServicePreview = SqlEditablePreview & {
  legacyId: string
  code: string
  name: string
  description: string | null
  category: string | null
  screenCategory: string | null
  price: number | null
  durationMinutes: number | null
  taxRate: number | null
  isPack: boolean
  requiresProduct: boolean
  isActive: boolean
}

export type SqlProductPreview = SqlEditablePreview & {
  legacyId: string
  legacyProductNumber: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category: string | null
  brand: string | null
  supplier: string | null
  cost: number | null
  price: number | null
  stock: number | null
  minStock: number | null
  maxStock: number | null
  isActive: boolean
}

export type SqlBonoTemplatePreview = SqlEditablePreview & {
  legacyServiceId: string
  serviceCode: string
  serviceName: string
  category: string | null
  slot: number
  totalSessions: number
  price: number | null
  isActive: boolean
}

export type SqlClientBonoPreview = SqlEditablePreview & {
  legacyId: string
  legacyNumber: string
  clientNumber: string
  serviceCode: string | null
  description: string
  totalSessions: number
  consumedSessions: number
  remainingSessions: number
  legacyValue: number | null
}

export type SqlAccountBalancePreview = SqlEditablePreview & {
  legacyId: string
  legacyNumber: string
  clientNumber: string
  description: string
  kind: string
  amount: number | null
  rawNominal: number | null
  rawConsumed: number | null
}

export type SqlAppointmentPreview = SqlEditablePreview & {
  legacyId: string
  legacyClientNumber: string | null
  clientName: string
  phone: string | null
  serviceCode: string | null
  serviceName: string | null
  date: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  cabin: string | null
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  secondaryProfessionalCode: string | null
  status: string | null
  notes: string | null
  legacyPackNumber: string | null
  targetUserId?: string | null
}

export type SqlAgendaBlockPreview = SqlEditablePreview & {
  legacyId: string
  legacyClientNumber: string | null
  date: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  cabin: string | null
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  notes: string | null
}

export type SqlAgendaNotePreview = SqlEditablePreview & {
  legacyId: string
  dayKey: string
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  text: string
  isActive: boolean
  agenda: string | null
  stationNumber: number | null
}

export type SqlConsentPreview = SqlEditablePreview & {
  legacyId: string
  clientNumber: string
  clientName: string | null
  health: string | null
  medication: string | null
  fileName: string
}

export type SqlSignaturePreview = SqlEditablePreview & {
  legacyId: string
  clientNumber: string
  clientName: string | null
  docType: string | null
  fileName: string
  legacyServiceNumber: string | null
  signatureBase64: string | null
}

export type SqlPhotoReferencePreview = {
  tableName: string
  rowCount: number
}

export type SqlUnsupportedTablePreview = {
  tableName: string
  rowCount: number
}

export type SqlImportAnalysis = {
  sourceName: string
  encoding: 'utf8' | 'latin1'
  detectedTables: string[]
  summary: SqlAnalysisSummary
  warnings: SqlImportWarning[]
  professionals: SqlProfessionalPreview[]
  clients: SqlClientPreview[]
  services: SqlServicePreview[]
  products: SqlProductPreview[]
  bonoTemplates: SqlBonoTemplatePreview[]
  clientBonos: SqlClientBonoPreview[]
  accountBalances: SqlAccountBalancePreview[]
  appointments: SqlAppointmentPreview[]
  agendaBlocks: SqlAgendaBlockPreview[]
  agendaNotes: SqlAgendaNotePreview[]
  consents: SqlConsentPreview[]
  signatures: SqlSignaturePreview[]
  photoReferencesSkipped: SqlPhotoReferencePreview[]
  unsupportedPopulatedTables: SqlUnsupportedTablePreview[]
}

type NormalizedReservationPreview = {
  legacyId: string
  legacyClientNumber: string | null
  clientName: string
  phone: string | null
  serviceCode: string | null
  serviceName: string | null
  date: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  cabin: string | null
  legacyProfessionalCode: string | null
  legacyProfessionalName: string | null
  secondaryProfessionalCode: string | null
  status: string | null
  notes: string | null
  legacyPackNumber: string | null
  isInternalBlock: boolean
}

const SQL_ANALYZED_TABLES = [
  'tblclientes',
  'tbltarifa',
  'tblproductos',
  'tblproductoscantidades',
  'tblbbpa',
  'tblreservas',
  'tblusuarios',
  'tblreservasnotas',
  'tblconsentimientos',
  'tblfirmas',
  'tblfotos',
  'tblantesydespues',
  'tblgalerias'
] as const

const PHOTO_REFERENCE_TABLES = ['tblfotos', 'tblantesydespues', 'tblgalerias'] as const

const SUPPORTED_ANALYSIS_TABLE_SET = new Set<string>(SQL_ANALYZED_TABLES)
const PHOTO_REFERENCE_TABLE_SET = new Set<string>(PHOTO_REFERENCE_TABLES)
const mojibakePattern = /Ã.|Â.|â.|ðŸ/g

const compactText = (value: SqlPrimitive) => {
  if (value === null) return null

  const normalized = String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized === '(null)' || normalized === '@') {
    return null
  }

  return normalized
}

const toBooleanFlag = (value: SqlPrimitive) => Number(value ?? 0) !== 0

const toNumber = (value: SqlPrimitive) => {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

const toInteger = (value: SqlPrimitive) => {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.trunc(parsed)
}

const toMoney = (value: SqlPrimitive, divisor = 1) => {
  const parsed = toNumber(value)
  if (parsed === null) return null
  return Number((parsed / divisor).toFixed(4))
}

const toDateValue = (value: SqlPrimitive) => {
  const text = compactText(value)
  if (!text || text === '0000-00-00') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

const toTimeValue = (value: SqlPrimitive) => {
  const text = compactText(value)
  if (!text) return null

  const match = text.match(/^(\d{2}:\d{2})(?::\d{2})?$/)
  return match ? match[1] : null
}

const toNullablePositiveString = (value: SqlPrimitive) => {
  const parsed = toInteger(value)
  if (parsed === null || parsed <= 0) {
    return null
  }

  return String(parsed)
}

const normalizeGender = (value: SqlPrimitive) => {
  if (typeof value === 'number') {
    if (value === 1) return 'F'
    if (value === 0) return 'M'
  }

  const text = compactText(value)
  if (!text) return null

  if (/^(1|f|femenino|mujer)$/i.test(text)) return 'F'
  if (/^(0|m|masculino|hombre)$/i.test(text)) return 'M'

  return text
}

const splitClientName = (fullName: string) => {
  const trimmed = fullName.trim()
  if (!trimmed) {
    return { firstName: '', lastName: '' }
  }

  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: '' }
  }

  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' ')
  }
}

const countMatches = (value: string, pattern: RegExp) => (value.match(pattern) || []).length

const decodeSqlBuffer = (buffer: Buffer): { content: string; encoding: 'utf8' | 'latin1' } => {
  const utf8 = buffer.toString('utf8')
  const latin1 = buffer.toString('latin1')

  const utf8Penalty = countMatches(utf8, /�/g) * 10 + countMatches(utf8, mojibakePattern)
  const latin1Penalty = countMatches(latin1, /�/g) * 10 + countMatches(latin1, mojibakePattern)

  if (utf8Penalty <= latin1Penalty) {
    return { content: utf8, encoding: 'utf8' }
  }

  return { content: latin1, encoding: 'latin1' }
}

const createTableRegex = (tableName: string) =>
  new RegExp(`CREATE TABLE \\\`${tableName}\\\` \\(([\\s\\S]*?)\\) ENGINE=`, 'i')

const extractColumns = (content: string, tableName: string) => {
  const match = createTableRegex(tableName).exec(content)
  if (!match) return []

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('`'))
    .map((line) => /^`([^`]+)`/.exec(line)?.[1] ?? null)
    .filter((column): column is string => Boolean(column))
}

const parseToken = (rawValue: string, quoted: boolean): SqlPrimitive => {
  if (quoted) {
    return rawValue
  }

  const trimmed = rawValue.trim()
  if (!trimmed || /^null$/i.test(trimmed)) {
    return null
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : trimmed
  }

  return trimmed
}

const unescapeSqlCharacter = (value: string) => {
  switch (value) {
    case '0':
      return '\0'
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    case 'Z':
      return '\x1a'
    default:
      return value
  }
}

const parseInsertRows = (valuesSegment: string) => {
  const rows: SqlPrimitive[][] = []
  let insideString = false
  let escapeNext = false
  let insideRow = false
  let currentQuoted = false
  let currentToken = ''
  let currentRow: SqlPrimitive[] = []

  const pushToken = () => {
    currentRow.push(parseToken(currentToken, currentQuoted))
    currentToken = ''
    currentQuoted = false
  }

  for (let index = 0; index < valuesSegment.length; index += 1) {
    const character = valuesSegment[index]

    if (!insideRow) {
      if (character === '(') {
        insideRow = true
        currentRow = []
        currentToken = ''
        currentQuoted = false
      }
      continue
    }

    if (insideString) {
      if (escapeNext) {
        currentToken += unescapeSqlCharacter(character)
        escapeNext = false
        continue
      }

      if (character === '\\') {
        escapeNext = true
        continue
      }

      if (character === '\'') {
        insideString = false
        continue
      }

      currentToken += character
      continue
    }

    if (character === '\'') {
      insideString = true
      currentQuoted = true
      continue
    }

    if (character === ',') {
      pushToken()
      continue
    }

    if (character === ')') {
      pushToken()
      rows.push(currentRow)
      insideRow = false
      currentRow = []
      continue
    }

    currentToken += character
  }

  return rows
}

const collectInsertRowsByTable = (content: string) => {
  const rowsByTable = new Map<string, SqlPrimitive[][]>()
  const insertMatcher = /INSERT INTO `([^`]+)` VALUES ([\s\S]*?);/gi

  for (const match of content.matchAll(insertMatcher)) {
    const tableName = match[1]
    const parsedRows = parseInsertRows(match[2])
    const currentRows = rowsByTable.get(tableName) || []
    currentRows.push(...parsedRows)
    rowsByTable.set(tableName, currentRows)
  }

  return rowsByTable
}

const extractTableRecords = (
  content: string,
  tableName: string,
  rowsByTable: Map<string, SqlPrimitive[][]>
): SqlRecord[] => {
  const columns = extractColumns(content, tableName)
  const rows = rowsByTable.get(tableName) || []

  if (columns.length === 0 || rows.length === 0) {
    return []
  }

  return rows.map((row) => {
    const record: SqlRecord = {}

    columns.forEach((column, index) => {
      record[column] = row[index] ?? null
    })

    return record
  })
}

const buildIssueList = (...issues: Array<string | null | undefined>) => issues.filter(Boolean) as string[]

const normalizeCode = (value: SqlPrimitive) => compactText(value)?.toUpperCase() ?? null

const buildProfessionals = (records: SqlRecord[]) =>
  records
    .map<SqlProfessionalPreview | null>((record) => {
      const code = normalizeCode(record.Codigo)
      if (!code) return null

      const shortName = compactText(record.TUNombreCorto)
      const longName = compactText(record.TUNombreLargo)
      const name = longName || shortName || code

      return {
        id: `legacy-professional-${record.Id}`,
        code,
        name,
        shortName,
        email: compactText(record.eMail),
        isActive: toBooleanFlag(record.Activo)
      }
    })
    .filter((record): record is SqlProfessionalPreview => record !== null)
    .sort((left, right) => left.code.localeCompare(right.code, 'es', { sensitivity: 'base' }))

const buildClients = (records: SqlRecord[]) =>
  records
    .map<SqlClientPreview>((record) => {
      const fullName = compactText(record.Nombre) ?? ''
      const splitName = splitClientName(fullName)
      const firstName = compactText(record.Nom) || splitName.firstName
      const lastName =
        [compactText(record.Ap1), compactText(record.Ap2)].filter(Boolean).join(' ') || splitName.lastName
      const mobilePhone = compactText(record.Movil)
      const landlinePhone = compactText(record.Tfno)
      const phone = mobilePhone || landlinePhone
      const isActive = !toBooleanFlag(record.Borrado) && !toBooleanFlag(record.Desactivado)

      return {
        id: `legacy-client-${record.Id}`,
        selected: isActive,
        issues: buildIssueList(
          !fullName ? 'Cliente sin nombre' : null,
          !phone ? 'Cliente sin teléfono principal' : null
        ),
        legacyId: String(record.Id ?? ''),
        legacyClientNumber: String(record.NroCliente ?? ''),
        barcode: compactText(record.CodBarras),
        fullName,
        firstName,
        lastName,
        dni: compactText(record.DNI),
        email: compactText(record.eMail),
        phone,
        mobilePhone,
        landlinePhone,
        address: compactText(record.Direccion),
        city: compactText(record.Ciudad) || compactText(record.Poblacion),
        province: compactText(record.Poblacion),
        postalCode: compactText(record.CP),
        birthDate: toDateValue(record.FechaDeNacimiento),
        registrationDate: toDateValue(record.FechaAlta),
        gender: normalizeGender(record.Sexo),
        legacyProfessionalCode: normalizeCode(record.Oficiala),
        clientBrand: compactText(record.Marca),
        appliedTariff: compactText(record.TarifaAAplicar),
        text9A: compactText(record.Texto9a),
        text9B: compactText(record.Texto9b),
        text15: compactText(record.Texto15),
        text25: compactText(record.Texto25),
        text100: compactText(record.Texto100),
        integer1: toInteger(record.Entero1),
        integer2: toInteger(record.Entero2),
        giftVoucher: compactText(record.Obsequio),
        photoRef: compactText(record.FichFoto),
        photoSkinType: compactText(record.Fototipo),
        webKey: compactText(record.ClaveWeb),
        discountProfile: compactText(record.Perfil),
        globalClientNumber: toNullablePositiveString(record.NroClienteGlobal),
        globalUpdated: toBooleanFlag(record.ActualizadoGlobal),
        rejectPostal: toBooleanFlag(record.RechazaCorrespondencia),
        rejectSms: toBooleanFlag(record.RechazaSMS),
        rejectEmail: toBooleanFlag(record.RechazaEmail),
        excludeSurvey: toBooleanFlag(record.ExcSurvey),
        registeredSurvey: toBooleanFlag(record.RegSurvey),
        legacySha1: compactText(record.TCSSHA1),
        notes: compactText(record.Nota),
        isActive
      }
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es', { sensitivity: 'base' }))

const buildServices = (records: SqlRecord[]) =>
  records
    .map<SqlServicePreview>((record) => {
      const code = compactText(record.Codigo) ?? ''
      const name = compactText(record.Descripcion) ?? ''
      const duration =
        toInteger(record.Tiempo) ??
        toInteger(record.Min1) ??
        toInteger(record.Min2) ??
        toInteger(record.Min3)

      const priceCandidates = [record.Precio, record.Precio1, record.Precio2, record.Precio3]
        .map((value) => toMoney(value))
        .filter((value): value is number => value !== null && value > 0)

      const category =
        compactText(record.NombreGrupoReservas) ||
        compactText(record.NombreGrupoPantallaTactil) ||
        compactText(record.NombreGrupoComisiones) ||
        compactText(record.Seccion)

      const isActive = record.Activo === null ? true : toBooleanFlag(record.Activo)

      return {
        id: `legacy-service-${record.Id}`,
        selected: isActive,
        issues: buildIssueList(
          !code ? 'Tratamiento sin código legacy' : null,
          !name ? 'Tratamiento sin descripción' : null,
          duration === null || duration <= 0 ? 'Tratamiento sin duración reconocible' : null
        ),
        legacyId: String(record.Id ?? ''),
        code,
        name,
        description: compactText(record.Descripcion),
        category,
        screenCategory: compactText(record.NombreGrupoPantallaTactil),
        price: priceCandidates[0] ?? null,
        durationMinutes: duration,
        taxRate: toMoney(record.IVA),
        isPack: toBooleanFlag(record.EsPack) || toBooleanFlag(record.EsBonoPack),
        requiresProduct: compactText(record.PeticionProducto)?.toUpperCase() === 'S',
        isActive
      }
    })
    .filter((record) => record.code || record.name)
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }))

const buildProducts = (productRecords: SqlRecord[], quantityRecords: SqlRecord[]) => {
  const quantityByProduct = new Map<string, SqlRecord[]>()

  for (const record of quantityRecords) {
    const key = String(record.NroProd ?? '')
    const existing = quantityByProduct.get(key) || []
    existing.push(record)
    quantityByProduct.set(key, existing)
  }

  return productRecords
    .map<SqlProductPreview>((record) => {
      const productNumber = String(record.NroProd ?? '')
      const quantityVariants = quantityByProduct.get(productNumber) || []
      const quantityRecord =
        quantityVariants.find((variant) => toBooleanFlag(variant.Activo)) ?? quantityVariants[0] ?? null
      const price =
        toMoney(quantityRecord?.PVP1 ?? null) ??
        toMoney(quantityRecord?.PVP2 ?? null) ??
        toMoney(record.IVAPVT)
      const cost = toMoney(quantityRecord?.PDC ?? null) ?? toMoney(record.IVACoste)

      return {
        id: `legacy-product-${record.Id}`,
        selected: toBooleanFlag(quantityRecord?.Activo ?? 1),
        issues: buildIssueList(
          !compactText(record.Descripcion) ? 'Producto sin descripción' : null,
          !compactText(record.CodLocal) && !productNumber ? 'Producto sin SKU local' : null
        ),
        legacyId: String(record.Id ?? ''),
        legacyProductNumber: productNumber,
        sku: compactText(record.CodLocal) || productNumber,
        barcode: compactText(record.CodBarras),
        name: compactText(record.Descripcion) ?? '',
        description: compactText(record.Comentario),
        category: compactText(record.NombreFamilia),
        brand: compactText(record.Marca),
        supplier: compactText(record.Proveedor),
        cost,
        price,
        stock: toInteger(quantityRecord?.Cantidad ?? null),
        minStock: toInteger(quantityRecord?.Minimo ?? null),
        maxStock: toInteger(quantityRecord?.Maximo ?? null),
        isActive: toBooleanFlag(quantityRecord?.Activo ?? 1)
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }))
}

const buildBonoTemplates = (serviceRecords: SqlRecord[]) => {
  const templates: SqlBonoTemplatePreview[] = []

  for (const record of serviceRecords) {
    const serviceCode = compactText(record.Codigo) ?? ''
    const serviceName = compactText(record.Descripcion) ?? ''
    const category =
      compactText(record.NombreGrupoReservas) ||
      compactText(record.NombreGrupoPantallaTactil) ||
      compactText(record.NombreGrupoComisiones)
    const isActive = record.Activo === null ? true : toBooleanFlag(record.Activo)

    for (let slot = 1; slot <= 5; slot += 1) {
      const totalSessions = toInteger(record[`UnidadesBono${slot}`]) ?? 0
      const price = toMoney(record[`PrecioBono${slot}`])

      if (totalSessions <= 0 || price === null || price <= 0) {
        continue
      }

      templates.push({
        id: `legacy-bono-template-${record.Id}-${slot}`,
        selected: isActive,
        issues: buildIssueList(!serviceCode ? 'Bono sin código de tratamiento' : null),
        legacyServiceId: String(record.Id ?? ''),
        serviceCode,
        serviceName,
        category,
        slot,
        totalSessions,
        price,
        isActive
      })
    }
  }

  return templates.sort((left, right) =>
    `${left.serviceName}-${left.slot}`.localeCompare(`${right.serviceName}-${right.slot}`, 'es', {
      sensitivity: 'base'
    })
  )
}

const pickLegacyAmount = (record: SqlRecord) =>
  toMoney(record.XICV, 10000) ??
  toMoney(record.XIC, 10000) ??
  toMoney(record.XI, 10000) ??
  toMoney(record.XS, 10000)

const buildClientBonos = (records: SqlRecord[]) =>
  records
    .filter((record) => compactText(record.Tipo) === 'B')
    .map<SqlClientBonoPreview>((record) => {
      const totalSessions = Math.max(toInteger(record.Nominal) ?? 0, 0)
      const remainingSessions = Math.max(toInteger(record.Consumido) ?? 0, 0)
      const consumedSessions = Math.max(totalSessions - remainingSessions, 0)

      return {
        id: `legacy-client-bono-${record.Id}`,
        selected: true,
        issues: buildIssueList(
          totalSessions <= 0 ? 'Bono sin sesiones nominales válidas' : null,
          !compactText(record.Descripcion) ? 'Bono sin descripción' : null
        ),
        legacyId: String(record.Id ?? ''),
        legacyNumber: String(record.Nro ?? ''),
        clientNumber: String(record.NroCliente ?? ''),
        serviceCode: compactText(record.Codigo),
        description: compactText(record.Descripcion) ?? '',
        totalSessions,
        consumedSessions,
        remainingSessions,
        legacyValue: toMoney(record.XI, 10000)
      }
    })
    .sort((left, right) => left.clientNumber.localeCompare(right.clientNumber, 'es', { sensitivity: 'base' }))

const buildAccountBalances = (records: SqlRecord[]) =>
  records
    .filter((record) => compactText(record.Tipo) === 'A')
    .map<SqlAccountBalancePreview>((record) => {
      const description = compactText(record.Descripcion) || 'ABONO'
      const kind = toInteger(record.TipoAb) === 1 || description === 'REGALO' ? 'REGALO' : 'ABONO'
      const amount = pickLegacyAmount(record)

      return {
        id: `legacy-account-balance-${record.Id}`,
        selected: amount !== null,
        issues: buildIssueList(
          amount === null ? 'No se ha podido derivar el importe del abono legacy' : 'Importe derivado desde campos legacy; revisar antes de importar'
        ),
        legacyId: String(record.Id ?? ''),
        legacyNumber: String(record.Nro ?? ''),
        clientNumber: String(record.NroCliente ?? ''),
        description,
        kind,
        amount,
        rawNominal: toInteger(record.Nominal),
        rawConsumed: toInteger(record.Consumido)
      }
    })
    .sort((left, right) => left.clientNumber.localeCompare(right.clientNumber, 'es', { sensitivity: 'base' }))

const buildNormalizedReservations = (
  records: SqlRecord[],
  professionals: SqlProfessionalPreview[],
  services: SqlServicePreview[]
) => {
  const professionalByCode = new Map(professionals.map((professional) => [professional.code, professional]))
  const serviceByCode = new Map<string, SqlServicePreview>()

  for (const service of services) {
    if (service.code && !serviceByCode.has(service.code)) {
      serviceByCode.set(service.code, service)
    }
  }

  return records
    .map<NormalizedReservationPreview>((record) => {
      const legacyProfessionalCode = normalizeCode(record.Oficial1)
      const secondaryProfessionalCode = normalizeCode(record.Oficial2)
      const legacyProfessionalName =
        (legacyProfessionalCode ? professionalByCode.get(legacyProfessionalCode)?.name : null) || legacyProfessionalCode
      const serviceCode = compactText(record.CodSubSer)
      const service = serviceCode ? serviceByCode.get(serviceCode) : undefined
      const durationMinutes = toInteger(record.Minutos)
      const startTime = toTimeValue(record.Hora) ?? '00:00'
      const endTime = durationMinutes && durationMinutes > 0 ? resolveAppointmentEndTime(startTime, durationMinutes) : null
      const cabin = resolveAppointmentCabin(compactText(record.Cabina), legacyProfessionalName || '')
      const normalizedProfessional =
        legacyProfessionalName ? resolveAppointmentProfessional(legacyProfessionalName, cabin) : null
      const notes = compactText(record.Comentario)
      const clientName = compactText(record.NombreCliente) ?? ''
      const isInternalBlock = isLikelyAgendaBlockRow({
        clientCode: record.NroCliente,
        clientName,
        serviceCode,
        serviceDescription: service?.name
      })

      return {
        legacyId: String(record.Id ?? ''),
        legacyClientNumber: compactText(record.NroCliente),
        clientName,
        phone: compactText(record.Telefono),
        serviceCode,
        serviceName: service?.name ?? compactText(record.CodSubSer),
        date: toDateValue(record.Fecha) ?? '',
        startTime,
        endTime,
        durationMinutes,
        cabin,
        legacyProfessionalCode,
        legacyProfessionalName: normalizedProfessional || legacyProfessionalName,
        secondaryProfessionalCode,
        status: compactText(record.Status),
        notes,
        legacyPackNumber: compactText(record.NroPack),
        isInternalBlock
      }
    })
    .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))
}

const buildAppointments = (reservations: NormalizedReservationPreview[]) =>
  reservations
    .filter((reservation) => !reservation.isInternalBlock)
    .map<SqlAppointmentPreview>((reservation) => ({
      id: `legacy-appointment-${reservation.legacyId}`,
      selected: true,
      issues: buildIssueList(
        !reservation.serviceCode ? 'Cita sin código de tratamiento' : null,
        !reservation.clientName ? 'Cita sin nombre de cliente' : null,
        !reservation.date ? 'Cita sin fecha válida' : null
      ),
      legacyId: reservation.legacyId,
      legacyClientNumber: reservation.legacyClientNumber,
      clientName: reservation.clientName,
      phone: reservation.phone,
      serviceCode: reservation.serviceCode,
      serviceName: reservation.serviceName,
      date: reservation.date,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      durationMinutes: reservation.durationMinutes,
      cabin: reservation.cabin,
      legacyProfessionalCode: reservation.legacyProfessionalCode,
      legacyProfessionalName: reservation.legacyProfessionalName,
      secondaryProfessionalCode: reservation.secondaryProfessionalCode,
      status: reservation.status,
      notes: reservation.notes,
      legacyPackNumber: reservation.legacyPackNumber
    }))

const buildAgendaBlocks = (reservations: NormalizedReservationPreview[]) =>
  reservations
    .filter((reservation) => reservation.isInternalBlock)
    .map<SqlAgendaBlockPreview>((reservation) => ({
      id: `legacy-agenda-block-${reservation.legacyId}`,
      selected: true,
      issues: buildIssueList(
        !reservation.date ? 'Bloque sin fecha válida' : null,
        !reservation.startTime ? 'Bloque sin hora de inicio' : null
      ),
      legacyId: reservation.legacyId,
      legacyClientNumber: reservation.legacyClientNumber,
      date: reservation.date,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      durationMinutes: reservation.durationMinutes,
      cabin: reservation.cabin,
      legacyProfessionalCode: reservation.legacyProfessionalCode,
      legacyProfessionalName: reservation.legacyProfessionalName,
      notes:
        [reservation.clientName, reservation.serviceName, reservation.notes]
          .filter(Boolean)
          .join(' · ') || null
    }))

const buildAgendaNotes = (
  records: SqlRecord[],
  professionals: SqlProfessionalPreview[]
) => {
  const professionalByCode = new Map(professionals.map((professional) => [professional.code, professional]))

  return records
    .map<SqlAgendaNotePreview>((record) => {
      const legacyProfessionalCode = normalizeCode(record.Oficial)
      const legacyProfessionalName =
        (legacyProfessionalCode ? professionalByCode.get(legacyProfessionalCode)?.name : null) || legacyProfessionalCode
      const dayKey = toDateValue(record.Fecha) ?? ''
      const text = compactText(record.Nota) ?? ''

      return {
        id: `legacy-agenda-note-${record.Id}`,
        selected: true,
        issues: buildIssueList(
          !dayKey ? 'Nota de agenda sin fecha válida' : null,
          !text ? 'Nota de agenda vacía' : null
        ),
        legacyId: String(record.Id ?? ''),
        dayKey,
        legacyProfessionalCode,
        legacyProfessionalName,
        text,
        isActive: record.Activo === null ? true : toBooleanFlag(record.Activo),
        agenda: compactText(record.Agenda),
        stationNumber: toInteger(record.NroEstacion)
      }
    })
    .sort((left, right) => `${left.dayKey}-${left.legacyId}`.localeCompare(`${right.dayKey}-${right.legacyId}`))
}

const buildConsentFileName = (clientNumber: string, legacyId: string) =>
  `consentimiento-legacy-${clientNumber || 'sin-cliente'}-${legacyId}.txt`

const buildSignatureFileName = (clientNumber: string, legacyId: string, docType: string | null) => {
  const normalizedDocType = (docType || 'firma')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalizedDocType || 'firma'}-${clientNumber || 'sin-cliente'}-${legacyId}.png`
}

const sanitizeBase64Signature = (value: SqlPrimitive) => {
  const text = compactText(value)
  if (!text) return null

  const dataUriMatch = text.match(/^data:[^;]+;base64,(.+)$/i)
  return (dataUriMatch ? dataUriMatch[1] : text).replace(/\s+/g, '')
}

const buildConsents = (records: SqlRecord[], clients: SqlClientPreview[]) => {
  const clientNameByNumber = new Map(clients.map((client) => [client.legacyClientNumber, client.fullName]))

  return records
    .map<SqlConsentPreview>((record) => {
      const clientNumber = String(record.NroCliente ?? '')
      const health = compactText(record.Salud)
      const medication = compactText(record.Medicacion)

      return {
        id: `legacy-consent-${record.Id}`,
        selected: true,
        issues: buildIssueList(!health && !medication ? 'Consentimiento sin contenido reconocible' : null),
        legacyId: String(record.Id ?? ''),
        clientNumber,
        clientName: clientNameByNumber.get(clientNumber) || null,
        health,
        medication,
        fileName: buildConsentFileName(clientNumber, String(record.Id ?? ''))
      }
    })
    .sort((left, right) => left.clientNumber.localeCompare(right.clientNumber, 'es', { sensitivity: 'base' }))
}

const buildSignatures = (records: SqlRecord[], clients: SqlClientPreview[]) => {
  const clientNameByNumber = new Map(clients.map((client) => [client.legacyClientNumber, client.fullName]))

  return records
    .map<SqlSignaturePreview>((record) => {
      const clientNumber = String(record.NroCliente ?? '')
      const docType = compactText(record.Doc)
      const signatureBase64 = sanitizeBase64Signature(record.Firma)

      return {
        id: `legacy-signature-${record.Id}`,
        selected: Boolean(signatureBase64),
        issues: buildIssueList(!signatureBase64 ? 'Firma sin contenido base64 válido' : null),
        legacyId: String(record.Id ?? ''),
        clientNumber,
        clientName: clientNameByNumber.get(clientNumber) || null,
        docType,
        fileName: buildSignatureFileName(clientNumber, String(record.Id ?? ''), docType),
        legacyServiceNumber: toNullablePositiveString(record.NroServicio),
        signatureBase64
      }
    })
    .sort((left, right) => left.clientNumber.localeCompare(right.clientNumber, 'es', { sensitivity: 'base' }))
}

const buildPhotoReferences = (rowsByTable: Map<string, SqlPrimitive[][]>) =>
  PHOTO_REFERENCE_TABLES.map((tableName) => ({
    tableName,
    rowCount: rowsByTable.get(tableName)?.length || 0
  })).filter((item) => item.rowCount > 0)

const buildUnsupportedPopulatedTables = (
  detectedTables: string[],
  rowsByTable: Map<string, SqlPrimitive[][]>
) =>
  detectedTables
    .map<SqlUnsupportedTablePreview | null>((tableName) => {
      if (SUPPORTED_ANALYSIS_TABLE_SET.has(tableName) || PHOTO_REFERENCE_TABLE_SET.has(tableName)) {
        return null
      }

      const rowCount = rowsByTable.get(tableName)?.length || 0
      if (rowCount <= 0) {
        return null
      }

      return {
        tableName,
        rowCount
      }
    })
    .filter((table): table is SqlUnsupportedTablePreview => Boolean(table))
    .sort((left, right) => right.rowCount - left.rowCount || left.tableName.localeCompare(right.tableName))

const buildWarnings = (payload: {
  sourceName: string
  missingTables: string[]
  accountBalances: SqlAccountBalancePreview[]
  agendaBlocks: SqlAgendaBlockPreview[]
  agendaNotes: SqlAgendaNotePreview[]
  consents: SqlConsentPreview[]
  signatures: SqlSignaturePreview[]
  photoReferences: SqlPhotoReferencePreview[]
  unsupportedPopulatedTables: SqlUnsupportedTablePreview[]
}) => {
  const warnings: SqlImportWarning[] = []

  if (payload.missingTables.length > 0) {
    warnings.push({
      code: 'missing_tables',
      message: `Faltan tablas relevantes en el dump: ${payload.missingTables.join(', ')}`,
      severity: 'warning',
      step: 'file',
      count: payload.missingTables.length
    })
  }

  if (payload.agendaBlocks.length > 0) {
    warnings.push({
      code: 'agenda_blocks_detected',
      message: 'Se han detectado bloqueos internos en la agenda legacy y se restaurarán aparte de las citas',
      severity: 'warning',
      step: 'agendaBlocks',
      count: payload.agendaBlocks.length
    })
  }

  if (payload.agendaNotes.length > 0) {
    warnings.push({
      code: 'agenda_notes_detected',
      message: 'Se han detectado notas diarias de agenda legacy',
      severity: 'info',
      step: 'agendaNotes',
      count: payload.agendaNotes.length
    })
  }

  if (payload.accountBalances.length > 0) {
    warnings.push({
      code: 'account_balances_derived',
      message: 'Los importes de abonos se derivan de campos legacy y deben revisarse antes de confirmar',
      severity: 'warning',
      step: 'accountBalances',
      count: payload.accountBalances.length
    })
  }

  if (payload.consents.length > 0) {
    warnings.push({
      code: 'consents_detected',
      message: 'Se han detectado consentimientos legacy para conservar como archivos del cliente',
      severity: 'info',
      step: 'assets',
      count: payload.consents.length
    })
  }

  if (payload.signatures.length > 0) {
    warnings.push({
      code: 'signatures_detected',
      message: 'Se han detectado firmas legacy que se exportarán como assets del cliente',
      severity: 'info',
      step: 'assets',
      count: payload.signatures.length
    })
  }

  const skippedPhotoReferences = payload.photoReferences.reduce((count, item) => count + item.rowCount, 0)
  if (skippedPhotoReferences > 0) {
    warnings.push({
      code: 'photo_references_skipped',
      message: 'Hay referencias de fotos legacy detectadas, pero v1 no las importará',
      severity: 'warning',
      step: 'assets',
      count: skippedPhotoReferences
    })
  }

  if (payload.unsupportedPopulatedTables.length > 0) {
    warnings.push({
      code: 'unsupported_populated_tables',
      message: 'Hay tablas legacy con datos no soportados todavía y se reportarán como alcance pendiente',
      severity: 'warning',
      step: 'unsupported',
      count: payload.unsupportedPopulatedTables.length
    })
  }

  if (!/01dat/i.test(payload.sourceName)) {
    warnings.push({
      code: 'source_name_non_standard',
      message: 'El nombre del fichero no coincide con 01dat.sql. Revisa que pertenezca a la familia soportada',
      severity: 'info',
      step: 'file'
    })
  }

  return warnings
}

export const analyzeLegacySqlDump = (buffer: Buffer, sourceName: string): SqlImportAnalysis => {
  const { content, encoding } = decodeSqlBuffer(buffer)
  const detectedTables = [...content.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1])
  const rowsByTable = collectInsertRowsByTable(content)
  const relevantRecords = Object.fromEntries(
    SQL_ANALYZED_TABLES.map((tableName) => [tableName, extractTableRecords(content, tableName, rowsByTable)])
  ) as Record<(typeof SQL_ANALYZED_TABLES)[number], SqlRecord[]>

  const professionals = buildProfessionals(relevantRecords.tblusuarios)
  const services = buildServices(relevantRecords.tbltarifa)
  const products = buildProducts(relevantRecords.tblproductos, relevantRecords.tblproductoscantidades)
  const bonoTemplates = buildBonoTemplates(relevantRecords.tbltarifa)
  const clientBonos = buildClientBonos(relevantRecords.tblbbpa)
  const accountBalances = buildAccountBalances(relevantRecords.tblbbpa)
  const clients = buildClients(relevantRecords.tblclientes)
  const normalizedReservations = buildNormalizedReservations(relevantRecords.tblreservas, professionals, services)
  const appointments = buildAppointments(normalizedReservations)
  const agendaBlocks = buildAgendaBlocks(normalizedReservations)
  const agendaNotes = buildAgendaNotes(relevantRecords.tblreservasnotas, professionals)
  const consents = buildConsents(relevantRecords.tblconsentimientos, clients)
  const signatures = buildSignatures(relevantRecords.tblfirmas, clients)
  const photoReferencesSkipped = buildPhotoReferences(rowsByTable)
  const unsupportedPopulatedTables = buildUnsupportedPopulatedTables(detectedTables, rowsByTable)

  const missingTables = SQL_ANALYZED_TABLES.filter((tableName) => !detectedTables.includes(tableName))
  const warnings = buildWarnings({
    sourceName,
    missingTables,
    accountBalances,
    agendaBlocks,
    agendaNotes,
    consents,
    signatures,
    photoReferences: photoReferencesSkipped,
    unsupportedPopulatedTables
  })

  return {
    sourceName,
    encoding,
    detectedTables,
    summary: {
      professionals: professionals.length,
      clients: clients.length,
      services: services.length,
      products: products.length,
      bonoTemplates: bonoTemplates.length,
      clientBonos: clientBonos.length,
      accountBalances: accountBalances.length,
      appointments: appointments.length,
      agendaBlocks: agendaBlocks.length,
      agendaNotes: agendaNotes.length,
      consents: consents.length,
      signatures: signatures.length,
      photoReferencesSkipped: photoReferencesSkipped.reduce((count, item) => count + item.rowCount, 0),
      unsupportedPopulatedTables: unsupportedPopulatedTables.length,
      warnings: warnings.length
    },
    warnings,
    professionals,
    clients,
    services,
    products,
    bonoTemplates,
    clientBonos,
    accountBalances,
    appointments,
    agendaBlocks,
    agendaNotes,
    consents,
    signatures,
    photoReferencesSkipped,
    unsupportedPopulatedTables
  }
}
