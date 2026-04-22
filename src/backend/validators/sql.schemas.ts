import { z } from 'zod'

export const sqlAnalyzeBodySchema = z.object({}).passthrough()

const sqlEventStepSchema = z
  .enum([
    'file',
    'clients',
    'services',
    'products',
    'bonoTemplates',
    'clientBonos',
    'accountBalances',
    'appointments',
    'agendaBlocks',
    'agendaNotes',
    'assets',
    'unsupported',
    'summary'
  ])
  .nullable()
  .optional()

export const sqlEventBodySchema = z
  .object({
    sessionId: z.string().trim().min(1, 'Session id is required').max(120, 'Session id is too long'),
    type: z.string().trim().min(1, 'Event type is required').max(80, 'Event type is too long'),
    step: sqlEventStepSchema,
    message: z.string().trim().min(1, 'Message is required').max(500, 'Message is too long'),
    payload: z.record(z.any()).optional()
  })
  .strict()

export const sqlEventQuerySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
  })
  .strict()

const nullableTrimmedString = z
  .union([z.string(), z.null()])
  .transform((value) => (typeof value === 'string' ? value.trim() || null : null))

const editableRowSchema = z.object({
  id: z.string().trim().min(1).max(120),
  selected: z.boolean(),
  issues: z.array(z.string().trim().min(1).max(300)).max(50)
})

const professionalPreviewSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    shortName: nullableTrimmedString,
    email: nullableTrimmedString,
    isActive: z.boolean()
  })
  .strict()

const clientPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyClientNumber: z.string().trim().min(1).max(120),
    barcode: nullableTrimmedString,
    fullName: z.string().trim().min(1).max(160),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    dni: nullableTrimmedString,
    email: nullableTrimmedString,
    phone: nullableTrimmedString,
    mobilePhone: nullableTrimmedString,
    landlinePhone: nullableTrimmedString,
    address: nullableTrimmedString,
    city: nullableTrimmedString,
    province: nullableTrimmedString,
    postalCode: nullableTrimmedString,
    birthDate: nullableTrimmedString,
    registrationDate: nullableTrimmedString,
    gender: nullableTrimmedString,
    legacyProfessionalCode: nullableTrimmedString,
    clientBrand: nullableTrimmedString,
    appliedTariff: nullableTrimmedString,
    text9A: nullableTrimmedString,
    text9B: nullableTrimmedString,
    text15: nullableTrimmedString,
    text25: nullableTrimmedString,
    text100: nullableTrimmedString,
    integer1: z.number().int().nullable(),
    integer2: z.number().int().nullable(),
    giftVoucher: nullableTrimmedString,
    photoRef: nullableTrimmedString,
    photoSkinType: nullableTrimmedString,
    webKey: nullableTrimmedString,
    discountProfile: nullableTrimmedString,
    globalClientNumber: nullableTrimmedString,
    globalUpdated: z.boolean(),
    rejectPostal: z.boolean(),
    rejectSms: z.boolean(),
    rejectEmail: z.boolean(),
    excludeSurvey: z.boolean(),
    registeredSurvey: z.boolean(),
    legacySha1: nullableTrimmedString,
    notes: nullableTrimmedString,
    isActive: z.boolean()
  })
  .strict()

const servicePreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    description: nullableTrimmedString,
    category: nullableTrimmedString,
    screenCategory: nullableTrimmedString,
    price: z.number().nullable(),
    durationMinutes: z.number().int().nullable(),
    taxRate: z.number().nullable(),
    isPack: z.boolean(),
    requiresProduct: z.boolean(),
    isActive: z.boolean()
  })
  .strict()

const productPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyProductNumber: z.string().trim().min(1).max(120),
    sku: z.string().trim().min(1).max(120),
    barcode: nullableTrimmedString,
    name: z.string().trim().min(1).max(160),
    description: nullableTrimmedString,
    category: nullableTrimmedString,
    brand: nullableTrimmedString,
    supplier: nullableTrimmedString,
    cost: z.number().nullable(),
    price: z.number().nullable(),
    stock: z.number().int().nullable(),
    minStock: z.number().int().nullable(),
    maxStock: z.number().int().nullable(),
    isActive: z.boolean()
  })
  .strict()

const bonoTemplatePreviewSchema = editableRowSchema
  .extend({
    legacyServiceId: z.string().trim().min(1).max(120),
    serviceCode: z.string().trim().min(1).max(120),
    serviceName: z.string().trim().min(1).max(160),
    category: nullableTrimmedString,
    slot: z.number().int().min(1).max(10),
    totalSessions: z.number().int().min(1),
    price: z.number().nullable(),
    isActive: z.boolean()
  })
  .strict()

const clientBonoPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyNumber: z.string().trim().min(1).max(120),
    clientNumber: z.string().trim().min(1).max(120),
    serviceCode: nullableTrimmedString,
    description: z.string().trim().min(1).max(200),
    totalSessions: z.number().int().min(0),
    consumedSessions: z.number().int().min(0),
    remainingSessions: z.number().int().min(0),
    legacyValue: z.number().nullable()
  })
  .strict()

const accountBalancePreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyNumber: z.string().trim().min(1).max(120),
    clientNumber: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(200),
    kind: z.string().trim().min(1).max(80),
    amount: z.number().nullable(),
    rawNominal: z.number().nullable(),
    rawConsumed: z.number().nullable()
  })
  .strict()

const appointmentPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyClientNumber: nullableTrimmedString,
    clientName: z.string().trim().min(1).max(160),
    phone: nullableTrimmedString,
    serviceCode: nullableTrimmedString,
    serviceName: nullableTrimmedString,
    date: z.string().trim().min(1).max(40),
    startTime: z.string().trim().min(1).max(16),
    endTime: nullableTrimmedString,
    durationMinutes: z.number().int().nullable(),
    cabin: nullableTrimmedString,
    legacyProfessionalCode: nullableTrimmedString,
    legacyProfessionalName: nullableTrimmedString,
    secondaryProfessionalCode: nullableTrimmedString,
    status: nullableTrimmedString,
    notes: nullableTrimmedString,
    legacyPackNumber: nullableTrimmedString,
    targetUserId: z.string().trim().min(1).max(120).nullable().optional()
  })
  .strict()

const agendaBlockPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    legacyClientNumber: nullableTrimmedString,
    date: z.string().trim().min(1).max(40),
    startTime: z.string().trim().min(1).max(16),
    endTime: nullableTrimmedString,
    durationMinutes: z.number().int().nullable(),
    cabin: nullableTrimmedString,
    legacyProfessionalCode: nullableTrimmedString,
    legacyProfessionalName: nullableTrimmedString,
    notes: nullableTrimmedString
  })
  .strict()

const agendaNotePreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    dayKey: z.string().trim().min(1).max(40),
    legacyProfessionalCode: nullableTrimmedString,
    legacyProfessionalName: nullableTrimmedString,
    text: z.string().trim().min(1).max(2000),
    isActive: z.boolean(),
    agenda: nullableTrimmedString,
    stationNumber: z.number().int().nullable()
  })
  .strict()

const consentPreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    clientNumber: z.string().trim().min(1).max(120),
    clientName: nullableTrimmedString,
    health: nullableTrimmedString,
    medication: nullableTrimmedString,
    fileName: z.string().trim().min(1).max(200)
  })
  .strict()

const signaturePreviewSchema = editableRowSchema
  .extend({
    legacyId: z.string().trim().min(1).max(120),
    clientNumber: z.string().trim().min(1).max(120),
    clientName: nullableTrimmedString,
    docType: nullableTrimmedString,
    fileName: z.string().trim().min(1).max(200),
    legacyServiceNumber: nullableTrimmedString,
    signatureBase64: nullableTrimmedString
  })
  .strict()

const photoReferencePreviewSchema = z
  .object({
    tableName: z.string().trim().min(1).max(120),
    rowCount: z.number().int().min(1)
  })
  .strict()

const unsupportedTablePreviewSchema = z
  .object({
    tableName: z.string().trim().min(1).max(120),
    rowCount: z.number().int().min(1)
  })
  .strict()

export const sqlImportBodySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120),
    sourceName: z.string().trim().min(1).max(260),
    professionals: z.array(professionalPreviewSchema).max(1000),
    clients: z.array(clientPreviewSchema).max(20000),
    services: z.array(servicePreviewSchema).max(10000),
    products: z.array(productPreviewSchema).max(20000),
    bonoTemplates: z.array(bonoTemplatePreviewSchema).max(20000),
    clientBonos: z.array(clientBonoPreviewSchema).max(50000),
    accountBalances: z.array(accountBalancePreviewSchema).max(50000),
    appointments: z.array(appointmentPreviewSchema).max(100000),
    agendaBlocks: z.array(agendaBlockPreviewSchema).max(50000),
    agendaNotes: z.array(agendaNotePreviewSchema).max(50000),
    consents: z.array(consentPreviewSchema).max(50000),
    signatures: z.array(signaturePreviewSchema).max(50000),
    photoReferencesSkipped: z.array(photoReferencePreviewSchema).max(1000),
    unsupportedPopulatedTables: z.array(unsupportedTablePreviewSchema).max(5000)
  })
  .strict()
