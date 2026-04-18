import {
  isLikelyAgendaBlockRow,
  resolveAppointmentCabin,
  resolveAppointmentEndTime,
  resolveAppointmentProfessional
} from './appointment-spreadsheet'

type SqlPrimitive = string | number | null
type SqlRecord = Record<string, SqlPrimitive>

export type SqlImportWarning = {
  code: string
  message: string
  severity: 'info' | 'warning'
  step: 'file' | 'clients' | 'services' | 'products' | 'bonos' | 'clientBonos' | 'accountBalances' | 'appointments'
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

export type SqlClientPreview = {
  id: string
  selected: boolean
  issues: string[]
  legacyId: string
  legacyClientNumber: string
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
  notes: string | null
  photoRef: string | null
  isActive: boolean
}

export type SqlServicePreview = {
  id: string
  selected: boolean
  issues: string[]
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

export type SqlProductPreview = {
  id: string
  selected: boolean
  issues: string[]
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

export type SqlBonoTemplatePreview = {
  id: string
  selected: boolean
  issues: string[]
  legacyServiceId: string
  serviceCode: string
  serviceName: string
  category: string | null
  slot: number
  totalSessions: number
  price: number | null
  isActive: boolean
}

export type SqlClientBonoPreview = {
  id: string
  selected: boolean
  issues: string[]
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

export type SqlAccountBalancePreview = {
  id: string
  selected: boolean
  issues: string[]
  legacyId: string
  legacyNumber: string
  clientNumber: string
  description: string
  kind: string
  amount: number | null
  rawNominal: number | null
  rawConsumed: number | null
}

export type SqlAppointmentPreview = {
  id: string
  selected: boolean
  issues: string[]
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
  targetUserId?: string | null
}

export type SqlImportAnalysis = {
  sourceName: string
  encoding: 'utf8' | 'latin1'
  detectedTables: string[]
  summary: {
    professionals: number
    clients: number
    services: number
    products: number
    bonoTemplates: number
    clientBonos: number
    accountBalances: number
    appointments: number
    warnings: number
  }
  warnings: SqlImportWarning[]
  professionals: SqlProfessionalPreview[]
  clients: SqlClientPreview[]
  services: SqlServicePreview[]
  products: SqlProductPreview[]
  bonoTemplates: SqlBonoTemplatePreview[]
  clientBonos: SqlClientBonoPreview[]
  accountBalances: SqlAccountBalancePreview[]
  appointments: SqlAppointmentPreview[]
}

const SQL_TABLES = [
  'tblclientes',
  'tbltarifa',
  'tblproductos',
  'tblproductoscantidades',
  'tblbbpa',
  'tblreservas',
  'tblusuarios'
] as const

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

const insertRegex = (tableName: string) =>
  new RegExp(`INSERT INTO \\\`${tableName}\\\` VALUES ([\\s\\S]*?);`, 'gi')

const extractColumns = (content: string, tableName: string) => {
  const match = createTableRegex(tableName).exec(content)
  if (!match) return []

  return [...match[1].matchAll(/`([^`]+)`/g)].map((entry) => entry[1])
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

const extractTableRecords = (content: string, tableName: string): SqlRecord[] => {
  const columns = extractColumns(content, tableName)
  if (columns.length === 0) return []

  const records: SqlRecord[] = []
  const matches = content.matchAll(insertRegex(tableName))

  for (const match of matches) {
    const rows = parseInsertRows(match[1])

    for (const row of rows) {
      const record: SqlRecord = {}

      columns.forEach((column, index) => {
        record[column] = row[index] ?? null
      })

      records.push(record)
    }
  }

  return records
}

const buildIssueList = (...issues: Array<string | null | undefined>) => issues.filter(Boolean) as string[]

const normalizeCode = (value: SqlPrimitive) => compactText(value)?.toUpperCase() ?? null

const buildProfessionals = (records: SqlRecord[]) =>
  records
    .map<SqlProfessionalPreview | null>((record) => {
      const code = normalizeCode(record.Codigo)
      if (!code || code === '@') return null

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
        fullName,
        firstName: splitName.firstName,
        lastName: splitName.lastName,
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
        gender: compactText(record.Sexo),
        legacyProfessionalCode: normalizeCode(record.Oficiala),
        clientBrand: compactText(record.Marca),
        appliedTariff: compactText(record.TarifaAAplicar),
        notes: compactText(record.Nota),
        photoRef: compactText(record.FichFoto),
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
        selected: false,
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

const buildAppointments = (
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
    .map<SqlAppointmentPreview>((record) => {
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
      const isInternalBlock = isLikelyAgendaBlockRow({
        clientCode: record.NroCliente,
        clientName: record.NombreCliente,
        serviceCode,
        serviceDescription: service?.name
      })

      return {
        id: `legacy-appointment-${record.Id}`,
        selected: !isInternalBlock,
        issues: buildIssueList(
          isInternalBlock ? 'Bloque interno o nota de agenda detectada' : null,
          !serviceCode ? 'Cita sin código de tratamiento' : null,
          !compactText(record.NombreCliente) ? 'Cita sin nombre de cliente' : null
        ),
        legacyId: String(record.Id ?? ''),
        legacyClientNumber: compactText(record.NroCliente),
        clientName: compactText(record.NombreCliente) ?? '',
        phone: compactText(record.Telefono),
        serviceCode,
        serviceName: service?.name ?? null,
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

const buildWarnings = (payload: {
  missingTables: string[]
  accountBalances: SqlAccountBalancePreview[]
  appointments: SqlAppointmentPreview[]
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

  const internalBlocks = payload.appointments.filter((appointment) => appointment.isInternalBlock).length
  if (internalBlocks > 0) {
    warnings.push({
      code: 'appointments_internal_blocks',
      message: 'Se han detectado bloques internos o notas de agenda entre las citas legacy',
      severity: 'warning',
      step: 'appointments',
      count: internalBlocks
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

  return warnings
}

export const analyzeLegacySqlDump = (buffer: Buffer, sourceName: string): SqlImportAnalysis => {
  const { content, encoding } = decodeSqlBuffer(buffer)
  const detectedTables = [...content.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1])
  const relevantRecords = Object.fromEntries(
    SQL_TABLES.map((tableName) => [tableName, extractTableRecords(content, tableName)])
  ) as Record<(typeof SQL_TABLES)[number], SqlRecord[]>

  const professionals = buildProfessionals(relevantRecords.tblusuarios)
  const services = buildServices(relevantRecords.tbltarifa)
  const products = buildProducts(relevantRecords.tblproductos, relevantRecords.tblproductoscantidades)
  const bonoTemplates = buildBonoTemplates(relevantRecords.tbltarifa)
  const clientBonos = buildClientBonos(relevantRecords.tblbbpa)
  const accountBalances = buildAccountBalances(relevantRecords.tblbbpa)
  const appointments = buildAppointments(relevantRecords.tblreservas, professionals, services)
  const clients = buildClients(relevantRecords.tblclientes)

  const missingTables = SQL_TABLES.filter((tableName) => !detectedTables.includes(tableName))
  const warnings = buildWarnings({
    missingTables,
    accountBalances,
    appointments
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
    appointments
  }
}
