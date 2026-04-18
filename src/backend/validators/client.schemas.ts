import { z } from 'zod'
import { booleanQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const genderSchema = z.enum(['HOMBRE', 'MUJER'])

const nullableEmailSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
  })
  .refine((value) => value === undefined || value === null || z.string().email().safeParse(value).success, {
    message: 'Invalid email format'
  })

const nullableUuidSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  })
  .refine((value) => value === undefined || value === null || z.string().uuid().safeParse(value).success, {
    message: 'Invalid uuid format'
  })

const nullableDateSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  })
  .refine((value) => value === undefined || value === null || !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format'
  })

const nullableIntegerSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
    const normalized = value.trim()
    if (normalized.length === 0) return null
    return Number.parseInt(normalized, 10)
  })
  .refine((value) => value === undefined || value === null || Number.isInteger(value), {
    message: 'Expected an integer'
  })

const nullableMoneySchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
    const normalized = value.trim().replace(',', '.')
    if (normalized.length === 0) return null
    return Number.parseFloat(normalized)
  })
  .refine((value) => value === undefined || value === null || Number.isFinite(value), {
    message: 'Expected a valid number'
  })

const requiredTextSchema = (field: string, maxLength: number) =>
  z.string().trim().min(1, `${field} is required`).max(maxLength, `${field} is too long`)

export const clientIdParamSchema = uuidParamSchema

export const clientsQuerySchema = z.object({
  search: z.string().trim().min(1, 'Search cannot be empty').optional(),
  isActive: booleanQuerySchema.optional(),
  paginated: booleanQuerySchema.optional(),
  includeCounts: booleanQuerySchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
})

export const createClientBodySchema = z
  .object({
    externalCode: optionalNullableTextSchema(80),
    dni: optionalNullableTextSchema(40),
    firstName: requiredTextSchema('First name', 120),
    lastName: requiredTextSchema('Last name', 160),
    email: nullableEmailSchema,
    phone: requiredTextSchema('Phone', 40),
    mobilePhone: optionalNullableTextSchema(40),
    landlinePhone: optionalNullableTextSchema(40),
    gender: genderSchema,
    birthDate: nullableDateSchema,
    birthDay: nullableIntegerSchema,
    birthMonthNumber: nullableIntegerSchema,
    birthMonthName: optionalNullableTextSchema(40),
    birthYear: nullableIntegerSchema,
    registrationDate: nullableDateSchema,
    lastVisit: nullableDateSchema,
    address: optionalNullableTextSchema(200),
    city: optionalNullableTextSchema(80),
    postalCode: optionalNullableTextSchema(20),
    province: optionalNullableTextSchema(80),
    notes: optionalNullableTextSchema(4000),
    allergies: optionalNullableTextSchema(2000),
    gifts: optionalNullableTextSchema(500),
    activeTreatmentCount: nullableIntegerSchema,
    activeTreatmentNames: optionalNullableTextSchema(1000),
    bondCount: nullableIntegerSchema,
    giftVoucher: optionalNullableTextSchema(120),
    serviceCount: nullableIntegerSchema,
    accountBalance: nullableMoneySchema,
    billedAmount: nullableMoneySchema,
    totalSpent: nullableMoneySchema,
    pendingAmount: nullableMoneySchema,
    debtAlertEnabled: z.boolean().optional(),
    linkedClientId: nullableUuidSchema,
    relationshipType: optionalNullableTextSchema(80),
    isActive: z.boolean().optional()
  })
  .strict()

export const updateClientBodySchema = z
  .object({
    externalCode: optionalNullableTextSchema(80),
    dni: optionalNullableTextSchema(40),
    firstName: requiredTextSchema('First name', 120).optional(),
    lastName: requiredTextSchema('Last name', 160).optional(),
    email: nullableEmailSchema,
    phone: z.string().trim().min(1, 'Phone is required').max(40, 'Phone is too long').optional(),
    mobilePhone: optionalNullableTextSchema(40),
    landlinePhone: optionalNullableTextSchema(40),
    gender: genderSchema.optional(),
    birthDate: nullableDateSchema,
    birthDay: nullableIntegerSchema,
    birthMonthNumber: nullableIntegerSchema,
    birthMonthName: optionalNullableTextSchema(40),
    birthYear: nullableIntegerSchema,
    registrationDate: nullableDateSchema,
    lastVisit: nullableDateSchema,
    address: optionalNullableTextSchema(200),
    city: optionalNullableTextSchema(80),
    postalCode: optionalNullableTextSchema(20),
    province: optionalNullableTextSchema(80),
    notes: optionalNullableTextSchema(4000),
    allergies: optionalNullableTextSchema(2000),
    gifts: optionalNullableTextSchema(500),
    activeTreatmentCount: nullableIntegerSchema,
    activeTreatmentNames: optionalNullableTextSchema(1000),
    bondCount: nullableIntegerSchema,
    giftVoucher: optionalNullableTextSchema(120),
    serviceCount: nullableIntegerSchema,
    accountBalance: nullableMoneySchema,
    billedAmount: nullableMoneySchema,
    totalSpent: nullableMoneySchema,
    pendingAmount: nullableMoneySchema,
    debtAlertEnabled: z.boolean().optional(),
    linkedClientId: nullableUuidSchema,
    relationshipType: optionalNullableTextSchema(80),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })

export const clientHistoryBodySchema = z
  .object({
    date: nullableDateSchema,
    service: requiredTextSchema('Service', 200),
    notes: optionalNullableTextSchema(1000),
    photoUrl: optionalNullableTextSchema(500),
    amount: z.coerce.number().finite('Amount must be a valid number').nonnegative('Amount cannot be negative')
  })
  .strict()
