import { createHash, randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { resolveAppointmentEndTime } from '../utils/appointment-spreadsheet'
import { normalizeProfessionalName } from '../utils/professional-catalog'
import type {
  SqlAccountBalancePreview,
  SqlAgendaBlockPreview,
  SqlAgendaNotePreview,
  SqlAppointmentPreview,
  SqlBonoTemplatePreview,
  SqlClientBonoPreview,
  SqlClientPreview,
  SqlConsentPreview,
  SqlPhotoReferencePreview,
  SqlProductPreview,
  SqlProfessionalPreview,
  SqlServicePreview,
  SqlSignaturePreview,
  SqlUnsupportedTablePreview
} from '../utils/sql-import'

const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'
const CLIENT_BONO_IMPORT_SOURCE = 'SQL_01DAT_CLIENT_BONO_V1'
const ACCOUNT_BALANCE_IMPORT_SOURCE = 'SQL_01DAT_ACCOUNT_BALANCE_V1'
const CREATE_MANY_CHUNK_SIZE = 200

export class SqlImportValidationError extends Error {
  statusCode: number
  details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'SqlImportValidationError'
    this.statusCode = 400
    this.details = details
  }
}

export class SqlImportConflictError extends Error {
  statusCode: number
  details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'SqlImportConflictError'
    this.statusCode = 409
    this.details = details
  }
}

export type SqlGeneratedClientAsset = {
  clientId: string
  clientName: string
  kind: 'consents' | 'documents'
  fileName: string
  originalName: string
  mimeType: string
  contentBase64: string
  takenAt?: string | null
}

export type SqlImportCommitInput = {
  sessionId: string
  sourceName: string
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

export type SqlImportCommitResult = {
  stage: 'commit'
  sourceName: string
  created: {
    legacyUsers: number
    services: number
    products: number
    clients: number
    bonoTemplates: number
    clientBonos: number
    accountBalances: number
    appointments: number
    agendaBlocks: number
    agendaNotes: number
  }
  omitted: {
    unselected: {
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
    }
    photoReferencesSkipped: number
    consentsWithoutClient: number
    signaturesWithoutClient: number
  }
  warnings: string[]
  unsupported: {
    tables: SqlUnsupportedTablePreview[]
  }
  assetsGenerated: {
    consents: number
    signatures: number
  }
  generatedAssets: SqlGeneratedClientAsset[]
  backupPolicy: {
    requiresEmptyBusinessDatabase: true
  }
}

type TxClient = Prisma.TransactionClient

type LegacyProfessionalCandidate = {
  code: string
  name: string
  email: string | null
}

type ExistingUserRecord = {
  id: string
  email: string
  username: string | null
  name: string
  role: string
  isActive: boolean
}

type ClientImportRecord = {
  id: string
  legacyClientNumber: string
  fullName: string
  firstName: string
  lastName: string
  email: string | null
  registrationDate: Date | null
  birthDate: Date | null
}

const normalizeText = (value: unknown) => {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')
  return normalized || null
}

const normalizeKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const compactKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')

const toDate = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 0
  }

  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

const chunkArray = <T>(items: T[], chunkSize = CREATE_MANY_CHUNK_SIZE) => {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

const createManyInChunks = async <T>(items: T[], runner: (chunk: T[]) => Promise<unknown>) => {
  for (const chunk of chunkArray(items)) {
    if (chunk.length === 0) continue
    await runner(chunk)
  }
}

const buildUnselectedSummary = (input: SqlImportCommitInput) => ({
  clients: input.clients.filter((row) => !row.selected).length,
  services: input.services.filter((row) => !row.selected).length,
  products: input.products.filter((row) => !row.selected).length,
  bonoTemplates: input.bonoTemplates.filter((row) => !row.selected).length,
  clientBonos: input.clientBonos.filter((row) => !row.selected).length,
  accountBalances: input.accountBalances.filter((row) => !row.selected).length,
  appointments: input.appointments.filter((row) => !row.selected).length,
  agendaBlocks: input.agendaBlocks.filter((row) => !row.selected).length,
  agendaNotes: input.agendaNotes.filter((row) => !row.selected).length,
  consents: input.consents.filter((row) => !row.selected).length,
  signatures: input.signatures.filter((row) => !row.selected).length
})

const buildLegacyUserIdentity = (code: string, name: string) => {
  const base = normalizeKey(code || name || 'legacy')
  const hash = createHash('sha1')
    .update(`${code}::${name}`)
    .digest('hex')
    .slice(0, 8)
  const token = `${base || 'legacy'}-${hash}`

  return {
    username: `legacy-${token}`,
    email: `legacy-${token}@sql-import.local`
  }
}

const buildLegacyUserPassword = async (code: string) => bcrypt.hash(`disabled-sql-import:${code}`, 10)

const buildLegacyProfessionalCandidates = (input: SqlImportCommitInput) => {
  const candidates = new Map<string, LegacyProfessionalCandidate>()

  const ensureCandidate = (candidate: { code: string | null; name: string | null; email?: string | null }) => {
    const normalizedCode = compactKey(candidate.code || candidate.name)
    if (!normalizedCode) return

    const existing = candidates.get(normalizedCode)
    const normalizedName =
      normalizeProfessionalName(candidate.name || candidate.code || normalizedCode) || normalizedCode

    if (existing) {
      if (!existing.email && candidate.email) {
        existing.email = normalizeText(candidate.email)
      }
      if ((!existing.name || existing.name === existing.code) && normalizedName) {
        existing.name = normalizedName
      }
      return
    }

    candidates.set(normalizedCode, {
      code: normalizedCode,
      name: normalizedName,
      email: normalizeText(candidate.email) || null
    })
  }

  input.professionals.forEach((professional) =>
    ensureCandidate({
      code: professional.code,
      name: professional.name || professional.shortName || professional.code,
      email: professional.email
    })
  )

  input.appointments
    .filter((row) => row.selected && !row.targetUserId)
    .forEach((appointment) =>
      ensureCandidate({
        code: appointment.legacyProfessionalCode,
        name: appointment.legacyProfessionalName || appointment.legacyProfessionalCode,
        email: null
      })
    )

  input.agendaBlocks
    .filter((row) => row.selected)
    .forEach((block) =>
      ensureCandidate({
        code: block.legacyProfessionalCode,
        name: block.legacyProfessionalName || block.legacyProfessionalCode,
        email: null
      })
    )

  input.agendaNotes
    .filter((row) => row.selected)
    .forEach((note) =>
      ensureCandidate({
        code: note.legacyProfessionalCode,
        name: note.legacyProfessionalName || note.legacyProfessionalCode,
        email: null
      })
    )

  return candidates
}

const formatClientExtraNotes = (client: SqlClientPreview) => {
  const extras: string[] = []

  if (client.barcode) extras.push(`Código de barras legacy: ${client.barcode}`)
  if (client.photoRef) extras.push(`Referencia de foto legacy: ${client.photoRef}`)
  if (client.photoSkinType) extras.push(`Fototipo legacy: ${client.photoSkinType}`)
  if (client.globalClientNumber) extras.push(`Cliente global legacy: ${client.globalClientNumber}`)
  if (client.globalUpdated) extras.push('Marcado como actualizado global en legacy')
  if (client.rejectPostal) extras.push('Rechaza correspondencia postal en legacy')
  if (client.rejectSms) extras.push('Rechaza SMS en legacy')
  if (client.rejectEmail) extras.push('Rechaza email en legacy')
  if (client.excludeSurvey) extras.push('Excluido de encuestas en legacy')
  if (client.registeredSurvey) extras.push('Registrado en survey legacy')
  if (client.legacySha1) extras.push(`TCSSHA1 legacy: ${client.legacySha1}`)

  if (extras.length === 0) {
    return normalizeText(client.notes)
  }

  const notes = normalizeText(client.notes)
  const sections = [notes, 'Metadata legacy SQL:', ...extras.map((item) => `- ${item}`)].filter(Boolean)
  return sections.join('\n')
}

const buildBirthMonthName = (birthDate: Date | null) => {
  if (!birthDate) return null
  return birthDate.toLocaleString('es-ES', { month: 'long' })
}

const normalizeLegacyAppointmentStatus = (value: string | null) => {
  const normalized = normalizeText(value)?.toUpperCase() || ''

  if (!normalized) return 'SCHEDULED'
  if (normalized.includes('CANCEL')) return 'CANCELLED'
  if (normalized.includes('NO SHOW') || normalized.includes('NO_SHOW') || normalized.includes('NO PRESENT')) return 'NO_SHOW'
  if (
    normalized.includes('FINAL') ||
    normalized.includes('HECHA') ||
    normalized.includes('COMPLET') ||
    normalized.includes('REALIZ')
  ) {
    return 'COMPLETED'
  }

  return 'SCHEDULED'
}

const buildAgendaNoteText = (note: SqlAgendaNotePreview) => {
  const context: string[] = []

  if (note.legacyProfessionalName || note.legacyProfessionalCode) {
    context.push(`Profesional: ${note.legacyProfessionalName || note.legacyProfessionalCode}`)
  }
  if (note.agenda) {
    context.push(`Agenda: ${note.agenda}`)
  }
  if (note.stationNumber !== null) {
    context.push(`Estación: ${note.stationNumber}`)
  }

  if (context.length === 0) {
    return note.text
  }

  return `${context.join(' · ')}\n${note.text}`
}

const buildConsentText = (consent: SqlConsentPreview) => {
  const lines = [
    'Consentimiento legacy importado desde 01dat.sql',
    `Cliente: ${consent.clientName || 'Sin nombre'}`,
    `Nro cliente legacy: ${consent.clientNumber}`
  ]

  if (consent.health) {
    lines.push('', 'Salud:', consent.health)
  }

  if (consent.medication) {
    lines.push('', 'Medicacion:', consent.medication)
  }

  return Buffer.from(lines.join('\n'), 'utf8').toString('base64')
}

const buildLegacyReference = (preferred: string, fallback: string) => normalizeText(preferred) || fallback

const buildBonoTemplateDescription = (template: SqlBonoTemplatePreview) =>
  `${template.serviceName || template.serviceCode} · ${template.totalSessions} sesiones`

const ensureValidSelections = (input: SqlImportCommitInput) => {
  const selectedClientNumbers = new Set(input.clients.filter((row) => row.selected).map((row) => row.legacyClientNumber))
  const selectedServiceCodes = new Set(
    input.services
      .filter((row) => row.selected)
      .map((row) => normalizeText(row.code))
      .filter((value): value is string => Boolean(value))
  )

  const invalidTemplates = input.bonoTemplates.filter(
    (row) => row.selected && (!row.serviceCode || !selectedServiceCodes.has(row.serviceCode))
  )
  if (invalidTemplates.length > 0) {
    throw new SqlImportValidationError('Hay bonos plantilla seleccionados sin tratamiento Lucy asociado', {
      ids: invalidTemplates.map((row) => row.id)
    })
  }

  const invalidClientBonos = input.clientBonos.filter(
    (row) => row.selected && !selectedClientNumbers.has(row.clientNumber)
  )
  if (invalidClientBonos.length > 0) {
    throw new SqlImportValidationError('Hay bonos de cliente seleccionados que apuntan a clientes no importados', {
      ids: invalidClientBonos.map((row) => row.id)
    })
  }

  const invalidAccountBalances = input.accountBalances.filter(
    (row) => row.selected && (!selectedClientNumbers.has(row.clientNumber) || row.amount === null)
  )
  if (invalidAccountBalances.length > 0) {
    throw new SqlImportValidationError('Hay abonos seleccionados sin cliente importado o sin importe derivado válido', {
      ids: invalidAccountBalances.map((row) => row.id)
    })
  }

  const invalidAppointments = input.appointments.filter(
    (row) =>
      row.selected &&
      (!row.date || !row.startTime || !row.serviceCode || !selectedServiceCodes.has(row.serviceCode))
  )
  if (invalidAppointments.length > 0) {
    throw new SqlImportValidationError('Hay citas seleccionadas sin fecha/hora válidas o sin tratamiento importado', {
      ids: invalidAppointments.map((row) => row.id)
    })
  }

  const invalidAgendaBlocks = input.agendaBlocks.filter((row) => row.selected && (!row.date || !row.startTime))
  if (invalidAgendaBlocks.length > 0) {
    throw new SqlImportValidationError('Hay bloqueos de agenda seleccionados sin fecha u hora válidas', {
      ids: invalidAgendaBlocks.map((row) => row.id)
    })
  }

  const invalidAgendaNotes = input.agendaNotes.filter((row) => row.selected && (!row.dayKey || !normalizeText(row.text)))
  if (invalidAgendaNotes.length > 0) {
    throw new SqlImportValidationError('Hay notas de agenda seleccionadas sin fecha o texto', {
      ids: invalidAgendaNotes.map((row) => row.id)
    })
  }
}

const ensureEmptyBusinessDatabase = async (tx: TxClient) => {
  const [
    existingUsers,
    clientsCount,
    servicesCount,
    productsCount,
    appointmentsCount,
    agendaBlocksCount,
    agendaDayNotesCount,
    bonoPacksCount,
    accountBalanceMovementsCount,
    salesCount,
    quotesCount,
    dashboardRemindersCount,
    notificationsCount
  ] = await Promise.all([
    tx.user.findMany({
      select: {
        id: true,
        role: true,
        isActive: true
      }
    }),
    tx.client.count(),
    tx.service.count(),
    tx.product.count(),
    tx.appointment.count(),
    tx.agendaBlock.count(),
    tx.agendaDayNote.count(),
    tx.bonoPack.count(),
    tx.accountBalanceMovement.count(),
    tx.sale.count(),
    tx.quote.count(),
    tx.dashboardReminder.count(),
    tx.notification.count()
  ])

  const blockingDetails = {
    users: existingUsers.length,
    nonAdminUsers: existingUsers.filter((user) => user.role !== 'ADMIN').length,
    extraAdmins: Math.max(existingUsers.filter((user) => user.role === 'ADMIN').length - 1, 0),
    clients: clientsCount,
    services: servicesCount,
    products: productsCount,
    appointments: appointmentsCount,
    agendaBlocks: agendaBlocksCount,
    agendaDayNotes: agendaDayNotesCount,
    bonoPacks: bonoPacksCount,
    accountBalanceMovements: accountBalanceMovementsCount,
    sales: salesCount,
    quotes: quotesCount,
    dashboardReminders: dashboardRemindersCount,
    notifications: notificationsCount
  }

  const hasBlockingBusinessData =
    blockingDetails.nonAdminUsers > 0 ||
    blockingDetails.extraAdmins > 0 ||
    clientsCount > 0 ||
    servicesCount > 0 ||
    productsCount > 0 ||
    appointmentsCount > 0 ||
    agendaBlocksCount > 0 ||
    agendaDayNotesCount > 0 ||
    bonoPacksCount > 0 ||
    accountBalanceMovementsCount > 0 ||
    salesCount > 0 ||
    quotesCount > 0 ||
    dashboardRemindersCount > 0 ||
    notificationsCount > 0

  if (hasBlockingBusinessData) {
    throw new SqlImportConflictError(
      'La restauración SQL solo puede ejecutarse sobre una BD funcionalmente vacía',
      blockingDetails
    )
  }
}

const getExistingUsers = async (tx: TxClient) =>
  tx.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true
    }
  })

const createLegacyUsers = async (
  tx: TxClient,
  candidates: Map<string, LegacyProfessionalCandidate>
) => {
  const existingUsers = await getExistingUsers(tx)
  const existingByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]))
  const existingByUsername = new Map(
    existingUsers
      .filter((user) => user.username)
      .map((user) => [String(user.username).toLowerCase(), user] as const)
  )

  const usersByCode = new Map<string, ExistingUserRecord>()
  const toCreate: Array<{
    id: string
    email: string
    username: string
    password: string
    name: string
    role: string
    isActive: boolean
    code: string
  }> = []

  for (const candidate of candidates.values()) {
    const identity = buildLegacyUserIdentity(candidate.code, candidate.name)
    const existing =
      existingByEmail.get(identity.email.toLowerCase()) || existingByUsername.get(identity.username.toLowerCase()) || null

    if (existing) {
      usersByCode.set(candidate.code, existing)
      continue
    }

    toCreate.push({
      id: randomUUID(),
      email: identity.email,
      username: identity.username,
      password: await buildLegacyUserPassword(candidate.code),
      name: candidate.name,
      role: 'EMPLOYEE',
      isActive: false,
      code: candidate.code
    })
  }

  await createManyInChunks(toCreate, async (chunk) => {
    await tx.user.createMany({
      data: chunk.map(({ code: _code, ...user }) => user)
    })
  })

  const createdUsers = new Map(
    toCreate.map((user) => [
      user.code,
      {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        isActive: user.isActive
      } satisfies ExistingUserRecord
    ])
  )

  for (const [code, user] of createdUsers.entries()) {
    usersByCode.set(code, user)
  }

  return {
    usersByCode,
    existingUsers,
    createdCount: toCreate.length
  }
}

export const importSqlAnalysisToDatabase = async (
  input: SqlImportCommitInput,
  db: typeof prisma = prisma
): Promise<SqlImportCommitResult> => {
  ensureValidSelections(input)

  const warnings: string[] = []
  const importTimestamp = new Date()
  const selectedClients = input.clients.filter((row) => row.selected)
  const selectedServices = input.services.filter((row) => row.selected)
  const selectedProducts = input.products.filter((row) => row.selected)
  const selectedBonoTemplates = input.bonoTemplates.filter((row) => row.selected)
  const selectedClientBonos = input.clientBonos.filter((row) => row.selected)
  const selectedAccountBalances = input.accountBalances.filter((row) => row.selected)
  const selectedAppointments = input.appointments.filter((row) => row.selected)
  const selectedAgendaBlocks = input.agendaBlocks.filter((row) => row.selected)
  const selectedAgendaNotes = input.agendaNotes.filter((row) => row.selected)
  const selectedConsents = input.consents.filter((row) => row.selected)
  const selectedSignatures = input.signatures.filter((row) => row.selected)
  const photoReferencesSkipped = input.photoReferencesSkipped.reduce((sum, item) => sum + item.rowCount, 0)

  if (!/01dat/i.test(input.sourceName)) {
    warnings.push('El fichero importado no se llama 01dat.sql. Revisa que pertenezca a la familia soportada.')
  }

  const unselected = buildUnselectedSummary(input)

  return db.$transaction(async (tx) => {
    await ensureEmptyBusinessDatabase(tx)

    const legacyProfessionalCandidates = buildLegacyProfessionalCandidates(input)
    const { usersByCode, existingUsers, createdCount: createdLegacyUsers } = await createLegacyUsers(
      tx,
      legacyProfessionalCandidates
    )
    const existingUserById = new Map(existingUsers.map((user) => [user.id, user]))
    const fallbackUserId = existingUsers.find((user) => user.role === 'ADMIN')?.id || existingUsers[0]?.id || null

    const selectedBalanceTotalsByClient = new Map<string, number>()
    selectedAccountBalances.forEach((movement) => {
      const currentTotal = selectedBalanceTotalsByClient.get(movement.clientNumber) || 0
      selectedBalanceTotalsByClient.set(movement.clientNumber, toMoney(currentTotal + Number(movement.amount || 0)))
    })

    const serviceData = selectedServices.map((service) => ({
      id: randomUUID(),
      name: service.name,
      description: normalizeText(service.description),
      price: toMoney(service.price),
      duration: Math.max(1, Number(service.durationMinutes || 0)),
      category: normalizeText(service.category || service.screenCategory) || 'Importación legacy',
      serviceCode: normalizeText(service.code),
      taxRate: service.taxRate === null ? null : toMoney(service.taxRate),
      requiresProduct: Boolean(service.requiresProduct),
      commission: null,
      promo: null,
      legacyRole: null,
      isActive: service.isActive
    }))

    await createManyInChunks(serviceData, async (chunk) => {
      await tx.service.createMany({ data: chunk })
    })

    const serviceByCode = new Map(
      serviceData
        .filter((service) => service.serviceCode)
        .map((service) => [String(service.serviceCode), service])
    )

    const usedSkus = new Map<string, number>()
    const productData = selectedProducts.map((product) => {
      const originalSku = normalizeText(product.sku) || `legacy-product-${product.legacyProductNumber}`
      const skuKey = originalSku.toLowerCase()
      const repetition = (usedSkus.get(skuKey) || 0) + 1
      usedSkus.set(skuKey, repetition)
      const finalSku = repetition === 1 ? originalSku : `${originalSku}-${repetition}`

      if (finalSku !== originalSku) {
        warnings.push(`SKU duplicado detectado para "${product.name}". Se importa como "${finalSku}".`)
      }

      return {
        id: randomUUID(),
        name: product.name,
        description: normalizeText(product.description),
        sku: finalSku,
        barcode: normalizeText(product.barcode),
        category: normalizeText(product.category) || 'Importación legacy',
        brand: normalizeText(product.brand),
        price: toMoney(product.price),
        cost: toMoney(product.cost),
        stock: Math.max(0, Number(product.stock || 0)),
        minStock: Math.max(0, Number(product.minStock || 0)),
        maxStock: product.maxStock === null ? null : Math.max(0, Number(product.maxStock)),
        unit: 'unidad',
        isActive: product.isActive
      }
    })

    await createManyInChunks(productData, async (chunk) => {
      await tx.product.createMany({ data: chunk })
    })

    const usedEmails = new Set<string>()
    const clientRecords = selectedClients.map<ClientImportRecord>((client) => {
      const id = randomUUID()
      const normalizedEmail = normalizeText(client.email)?.toLowerCase() || null
      let finalEmail = normalizedEmail

      if (normalizedEmail) {
        if (usedEmails.has(normalizedEmail)) {
          finalEmail = null
          warnings.push(`Email duplicado detectado en cliente ${client.fullName}. Se conserva el primero y este se importa vacío.`)
        } else {
          usedEmails.add(normalizedEmail)
        }
      }

      return {
        id,
        legacyClientNumber: client.legacyClientNumber,
        fullName: client.fullName || `${client.firstName} ${client.lastName}`.trim(),
        firstName: client.firstName || client.fullName || `Cliente ${client.legacyClientNumber}`,
        lastName: client.lastName || '-',
        email: finalEmail,
        registrationDate: toDate(client.registrationDate),
        birthDate: toDate(client.birthDate)
      }
    })

    await createManyInChunks(
      clientRecords.map((clientRecord) => {
        const preview = selectedClients.find((client) => client.legacyClientNumber === clientRecord.legacyClientNumber)!
        const birthDate = clientRecord.birthDate
        const estheticianCandidate = preview.legacyProfessionalCode
          ? usersByCode.get(preview.legacyProfessionalCode)?.name || preview.legacyProfessionalCode
          : null

        return {
          id: clientRecord.id,
          firstName: clientRecord.firstName,
          lastName: clientRecord.lastName,
          email: clientRecord.email,
          phone:
            normalizeText(preview.phone) ||
            normalizeText(preview.mobilePhone) ||
            normalizeText(preview.landlinePhone) ||
            `IMPORT-${preview.legacyClientNumber}`,
          birthDate,
          address: normalizeText(preview.address),
          city: normalizeText(preview.city),
          postalCode: normalizeText(preview.postalCode),
          province: normalizeText(preview.province),
          landlinePhone: normalizeText(preview.landlinePhone),
          mobilePhone: normalizeText(preview.mobilePhone),
          fullName: clientRecord.fullName,
          externalCode: preview.legacyClientNumber,
          dni: normalizeText(preview.dni),
          gender: normalizeText(preview.gender),
          registrationDate: clientRecord.registrationDate,
          esthetician: normalizeText(estheticianCandidate),
          clientBrand: normalizeText(preview.clientBrand),
          appliedTariff: normalizeText(preview.appliedTariff),
          text9A: normalizeText(preview.text9A),
          text9B: normalizeText(preview.text9B),
          text15: normalizeText(preview.text15),
          text25: normalizeText(preview.text25),
          text100: normalizeText(preview.text100),
          integer1: preview.integer1,
          integer2: preview.integer2,
          gifts: normalizeText(preview.giftVoucher),
          birthDay: birthDate ? birthDate.getUTCDate() : null,
          birthMonthNumber: birthDate ? birthDate.getUTCMonth() + 1 : null,
          birthMonthName: buildBirthMonthName(birthDate),
          birthYear: birthDate ? birthDate.getUTCFullYear() : null,
          serviceCount: null,
          activeTreatmentCount: null,
          activeTreatmentNames: null,
          bondCount: null,
          giftVoucher: normalizeText(preview.giftVoucher),
          billedAmount: null,
          pendingAmount: null,
          debtAlertEnabled: false,
          linkedClientReference: null,
          relationshipType: null,
          linkedClientId: null,
          discountProfile: normalizeText(preview.discountProfile),
          webKey: normalizeText(preview.webKey),
          notes: formatClientExtraNotes(preview),
          allergies: null,
          photoUrl: null,
          loyaltyPoints: 0,
          totalSpent: 0,
          isActive: preview.isActive,
          accountBalance: selectedBalanceTotalsByClient.get(preview.legacyClientNumber) || 0
        }
      }),
      async (chunk) => {
        await tx.client.createMany({ data: chunk })
      }
    )

    const clientByLegacyNumber = new Map<string, ClientImportRecord>(
      clientRecords.map((client) => [client.legacyClientNumber, client])
    )

    const accountBalanceClientNumbers = new Set(selectedAccountBalances.map((row) => row.clientNumber))
    const registrationFallbackMissing = selectedAccountBalances.some((movement) => {
      const client = clientByLegacyNumber.get(movement.clientNumber)
      return !client?.registrationDate
    })
    if (accountBalanceClientNumbers.size > 0) {
      warnings.push(
        registrationFallbackMissing
          ? 'Los movimientos de saldo importados usan la fecha de alta del cliente o la fecha de importación cuando legacy no aporta una fecha fiable.'
          : 'Los movimientos de saldo importados usan la fecha de alta del cliente como fecha de operación aproximada.'
      )
    }

    const bonoTemplateCatalog = selectedBonoTemplates.map((template) => {
      const service = serviceByCode.get(template.serviceCode)
      if (!service) {
        throw new SqlImportValidationError('No se ha podido resolver el tratamiento de un bono plantilla seleccionado', {
          templateId: template.id,
          serviceCode: template.serviceCode
        })
      }

      return {
        id: randomUUID(),
        category: normalizeText(template.category) || normalizeText(service.category) || 'Bonos',
        description: buildBonoTemplateDescription(template),
        serviceId: service.id,
        serviceName: service.name,
        serviceLookup: service.serviceCode || service.name,
        totalSessions: template.totalSessions,
        price: toMoney(template.price),
        isActive: template.isActive,
        createdAt: importTimestamp.toISOString()
      }
    })

    await tx.setting.upsert({
      where: { key: BONO_TEMPLATES_SETTING_KEY },
      update: {
        value: JSON.stringify(bonoTemplateCatalog),
        description: 'Catalogo importado desde SQL legacy'
      },
      create: {
        key: BONO_TEMPLATES_SETTING_KEY,
        value: JSON.stringify(bonoTemplateCatalog),
        description: 'Catalogo importado desde SQL legacy'
      }
    })

    const bonoTemplateCandidatesByServiceAndSessions = new Map<string, typeof bonoTemplateCatalog>()
    for (const template of bonoTemplateCatalog) {
      const lookupKey = `${template.serviceId}::${template.totalSessions}`
      const current = bonoTemplateCandidatesByServiceAndSessions.get(lookupKey) || []
      current.push(template)
      bonoTemplateCandidatesByServiceAndSessions.set(lookupKey, current)
    }

    const resolveImportedBonoTemplateId = (serviceId: string | null, totalSessions: number) => {
      if (!serviceId) {
        return null
      }

      const exactCandidates =
        bonoTemplateCandidatesByServiceAndSessions.get(`${serviceId}::${Math.max(1, totalSessions)}`) || []
      if (exactCandidates.length === 1) {
        return exactCandidates[0].id
      }

      const serviceCandidates = bonoTemplateCatalog.filter((template) => template.serviceId === serviceId)
      return serviceCandidates.length === 1 ? serviceCandidates[0].id : null
    }

    const bonoPackData = selectedClientBonos.map((bono) => {
      const client = clientByLegacyNumber.get(bono.clientNumber)
      if (!client) {
        throw new SqlImportValidationError('No se ha podido resolver el cliente de un bono seleccionado', {
          bonoId: bono.id
        })
      }

      const service = bono.serviceCode ? serviceByCode.get(bono.serviceCode) || null : null
      if (bono.serviceCode && !service) {
        warnings.push(`El bono ${bono.description} se importa sin tratamiento Lucy asociado porque ${bono.serviceCode} no se restauró.`)
      }

      const purchaseDate = client.registrationDate || importTimestamp
      const totalSessions = Math.max(1, bono.totalSessions)
      const consumedSessions = Math.max(0, Math.min(totalSessions, bono.consumedSessions))
      const status = consumedSessions >= totalSessions ? 'DEPLETED' : 'ACTIVE'

      return {
        id: randomUUID(),
        clientId: client.id,
        name: bono.description,
        serviceId: service?.id || null,
        bonoTemplateId: resolveImportedBonoTemplateId(service?.id || null, totalSessions),
        legacyRef: buildLegacyReference(bono.legacyNumber, bono.legacyId),
        importSource: CLIENT_BONO_IMPORT_SOURCE,
        totalSessions,
        price: toMoney(bono.legacyValue),
        purchaseDate,
        expiryDate: null,
        status,
        notes: [
          `Importado desde ${input.sourceName}`,
          bono.serviceCode ? `Código tratamiento legacy: ${bono.serviceCode}` : null
        ]
          .filter(Boolean)
          .join('\n')
      }
    })

    await createManyInChunks(bonoPackData, async (chunk) => {
      await tx.bonoPack.createMany({ data: chunk })
    })

    const bonoSessionsData = bonoPackData.flatMap((bonoPack) => {
      const preview = selectedClientBonos.find(
        (row) => buildLegacyReference(row.legacyNumber, row.legacyId) === bonoPack.legacyRef && row.clientNumber === clientRecords.find((client) => client.id === bonoPack.clientId)?.legacyClientNumber
      )
      const consumedSessions = preview ? Math.max(0, Math.min(preview.totalSessions, preview.consumedSessions)) : 0

      return Array.from({ length: bonoPack.totalSessions }, (_, index) => ({
        id: randomUUID(),
        bonoPackId: bonoPack.id,
        sessionNumber: index + 1,
        status: index + 1 <= consumedSessions ? 'CONSUMED' : 'AVAILABLE',
        consumedAt: index + 1 <= consumedSessions ? bonoPack.purchaseDate : null,
        appointmentId: null,
        notes: null
      }))
    })

    await createManyInChunks(bonoSessionsData, async (chunk) => {
      await tx.bonoSession.createMany({ data: chunk })
    })

    const balanceByClientId = new Map<string, number>()
    const accountBalanceData = selectedAccountBalances.map((movement) => {
      const client = clientByLegacyNumber.get(movement.clientNumber)
      if (!client) {
        throw new SqlImportValidationError('No se ha podido resolver el cliente de un abono seleccionado', {
          movementId: movement.id
        })
      }

      const currentBalance = balanceByClientId.get(client.id) || 0
      const nextBalance = toMoney(currentBalance + Number(movement.amount || 0))
      balanceByClientId.set(client.id, nextBalance)

      return {
        id: randomUUID(),
        clientId: client.id,
        saleId: null,
        type: 'TOP_UP',
        paymentMethod: null,
        operationDate: client.registrationDate || importTimestamp,
        description: movement.description,
        referenceItem: null,
        legacyRef: buildLegacyReference(movement.legacyNumber, movement.legacyId),
        importSource: ACCOUNT_BALANCE_IMPORT_SOURCE,
        amount: toMoney(movement.amount),
        balanceAfter: nextBalance,
        notes: movement.kind === 'REGALO' ? 'Saldo legacy importado como regalo' : 'Saldo legacy importado'
      }
    })

    await createManyInChunks(accountBalanceData, async (chunk) => {
      await tx.accountBalanceMovement.createMany({ data: chunk })
    })

    const appointmentData = selectedAppointments.map((appointment) => {
      const existingTargetUser =
        appointment.targetUserId && existingUserById.has(appointment.targetUserId)
          ? existingUserById.get(appointment.targetUserId) || null
          : null
      const legacyProfessionalUser =
        !existingTargetUser && appointment.legacyProfessionalCode
          ? usersByCode.get(appointment.legacyProfessionalCode) || null
          : null
      const userId = existingTargetUser?.id || legacyProfessionalUser?.id || fallbackUserId

      if (!userId) {
        throw new SqlImportValidationError('No se ha podido asignar una usuaria Lucy a una cita importada', {
          appointmentId: appointment.id
        })
      }

      const service = appointment.serviceCode ? serviceByCode.get(appointment.serviceCode) || null : null
      if (!service) {
        throw new SqlImportValidationError('No se ha podido resolver el tratamiento de una cita seleccionada', {
          appointmentId: appointment.id,
          serviceCode: appointment.serviceCode
        })
      }

      const client = appointment.legacyClientNumber ? clientByLegacyNumber.get(appointment.legacyClientNumber) || null : null
      const professional =
        normalizeProfessionalName(
          existingTargetUser?.name || legacyProfessionalUser?.name || appointment.legacyProfessionalName || appointment.legacyProfessionalCode
        ) ||
        normalizeProfessionalName(appointment.legacyProfessionalName || appointment.legacyProfessionalCode) ||
        'Importación legacy'
      const endTime =
        normalizeText(appointment.endTime) ||
        resolveAppointmentEndTime(
          appointment.startTime,
          Math.max(1, Number(appointment.durationMinutes || service.duration || 30))
        )

      return {
        id: randomUUID(),
        clientId: client?.id || null,
        guestName: client ? null : normalizeText(appointment.clientName) || 'Cliente legacy',
        guestPhone: client ? null : normalizeText(appointment.phone),
        userId,
        serviceId: service.id,
        cabin: normalizeText(appointment.cabin) || 'LUCY',
        professional,
        date: new Date(appointment.date),
        startTime: appointment.startTime,
        endTime,
        status: normalizeLegacyAppointmentStatus(appointment.status),
        notes: normalizeText(appointment.notes),
        reminder: false,
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: null
      }
    })

    await createManyInChunks(appointmentData, async (chunk) => {
      await tx.appointment.createMany({ data: chunk })
    })

    await createManyInChunks(
      appointmentData.map((appointment) => ({
        appointmentId: appointment.id,
        serviceId: appointment.serviceId,
        sortOrder: 0
      })),
      async (chunk) => {
        await tx.appointmentService.createMany({ data: chunk })
      }
    )

    const agendaBlockData = selectedAgendaBlocks.map((block) => {
      const professional =
        normalizeProfessionalName(
          block.legacyProfessionalCode ? usersByCode.get(block.legacyProfessionalCode)?.name : null
        ) ||
        normalizeProfessionalName(block.legacyProfessionalName || block.legacyProfessionalCode) ||
        'Importación legacy'
      const endTime =
        normalizeText(block.endTime) ||
        resolveAppointmentEndTime(block.startTime, Math.max(1, Number(block.durationMinutes || 30)))

      return {
        id: randomUUID(),
        professional,
        calendarInviteEmail: null,
        cabin: normalizeText(block.cabin) || 'LUCY',
        date: new Date(block.date),
        startTime: block.startTime,
        endTime,
        notes: normalizeText(block.notes),
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: null
      }
    })

    await createManyInChunks(agendaBlockData, async (chunk) => {
      await tx.agendaBlock.createMany({ data: chunk })
    })

    const agendaNoteData = selectedAgendaNotes.map((note) => ({
      id: randomUUID(),
      dayKey: note.dayKey,
      text: buildAgendaNoteText(note),
      isCompleted: !note.isActive,
      completedAt: note.isActive ? null : importTimestamp
    }))

    await createManyInChunks(agendaNoteData, async (chunk) => {
      await tx.agendaDayNote.createMany({ data: chunk })
    })

    let omittedConsentsWithoutClient = 0
    let omittedSignaturesWithoutClient = 0
    const generatedAssets: SqlGeneratedClientAsset[] = []

    selectedConsents.forEach((consent) => {
      const client = clientByLegacyNumber.get(consent.clientNumber)
      if (!client) {
        omittedConsentsWithoutClient += 1
        warnings.push(`Se omite el consentimiento ${consent.fileName} porque su cliente no se importó.`)
        return
      }

      generatedAssets.push({
        clientId: client.id,
        clientName: client.fullName,
        kind: 'consents',
        fileName: consent.fileName,
        originalName: consent.fileName,
        mimeType: 'text/plain; charset=utf-8',
        contentBase64: buildConsentText(consent),
        takenAt: client.registrationDate?.toISOString() || null
      })
    })

    selectedSignatures.forEach((signature) => {
      const client = clientByLegacyNumber.get(signature.clientNumber)
      if (!client) {
        omittedSignaturesWithoutClient += 1
        warnings.push(`Se omite la firma ${signature.fileName} porque su cliente no se importó.`)
        return
      }

      if (!signature.signatureBase64) {
        omittedSignaturesWithoutClient += 1
        warnings.push(`Se omite la firma ${signature.fileName} porque no tiene contenido base64 válido.`)
        return
      }

      generatedAssets.push({
        clientId: client.id,
        clientName: client.fullName,
        kind: 'documents',
        fileName: signature.fileName,
        originalName: signature.fileName,
        mimeType: 'image/png',
        contentBase64: signature.signatureBase64,
        takenAt: client.registrationDate?.toISOString() || null
      })
    })

    if (photoReferencesSkipped > 0) {
      warnings.push(`Se han detectado ${photoReferencesSkipped} referencias de fotos legacy y se dejan fuera de v1.`)
    }

    if (input.unsupportedPopulatedTables.length > 0) {
      warnings.push(
        `Quedan ${input.unsupportedPopulatedTables.length} tablas legacy pobladas fuera del alcance de esta importación.`
      )
    }

    return {
      stage: 'commit',
      sourceName: input.sourceName,
      created: {
        legacyUsers: createdLegacyUsers,
        services: serviceData.length,
        products: productData.length,
        clients: clientRecords.length,
        bonoTemplates: bonoTemplateCatalog.length,
        clientBonos: bonoPackData.length,
        accountBalances: accountBalanceData.length,
        appointments: appointmentData.length,
        agendaBlocks: agendaBlockData.length,
        agendaNotes: agendaNoteData.length
      },
      omitted: {
        unselected,
        photoReferencesSkipped,
        consentsWithoutClient: omittedConsentsWithoutClient,
        signaturesWithoutClient: omittedSignaturesWithoutClient
      },
      warnings,
      unsupported: {
        tables: input.unsupportedPopulatedTables
      },
      assetsGenerated: {
        consents: generatedAssets.filter((asset) => asset.kind === 'consents').length,
        signatures: generatedAssets.filter((asset) => asset.kind === 'documents').length
      },
      generatedAssets,
      backupPolicy: {
        requiresEmptyBusinessDatabase: true as const
      }
    }
  })
}
