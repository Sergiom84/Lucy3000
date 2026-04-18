import { z } from 'zod'
import { booleanQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const parseDecimalInput = (value: string) => Number.parseFloat(value.trim().replace(/\s*€\s*/g, '').replace(',', '.'))
const parseDurationInput = (value: string) => Number.parseInt(value.replace(/[^0-9]/g, ''), 10)

const positiveMoneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === 'number' ? value : parseDecimalInput(value)))
  .refine((value) => Number.isFinite(value) && value > 0, {
    message: 'Price must be greater than 0'
  })

const durationSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === 'number' ? value : parseDurationInput(value)))
  .refine((value) => Number.isInteger(value) && value > 0, {
    message: 'Duration must be greater than 0 minutes'
  })

const optionalMoneySchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    const parsed = typeof value === 'number' ? value : parseDecimalInput(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  })
  .refine((value) => value === undefined || value === null || Number.isFinite(value), {
    message: 'Invalid numeric format'
  })

export const serviceIdParamSchema = uuidParamSchema

export const servicesQuerySchema = z.object({
  isActive: booleanQuerySchema.optional(),
  category: z.string().trim().min(1, 'Category cannot be empty').optional()
})

export const createServiceBodySchema = z
  .object({
    serviceCode: optionalNullableTextSchema(80),
    name: z.string().trim().min(1, 'Name is required').max(180, 'Name is too long'),
    description: optionalNullableTextSchema(2000),
    category: z.string().trim().min(1, 'Category is required').max(120, 'Category is too long').optional(),
    price: positiveMoneySchema,
    taxRate: optionalMoneySchema,
    duration: durationSchema,
    isActive: z.boolean().optional()
  })
  .strict()

export const updateServiceBodySchema = z
  .object({
    serviceCode: optionalNullableTextSchema(80),
    name: z.string().trim().min(1, 'Name is required').max(180, 'Name is too long').optional(),
    description: optionalNullableTextSchema(2000),
    category: z.string().trim().min(1, 'Category is required').max(120, 'Category is too long').optional(),
    price: positiveMoneySchema.optional(),
    taxRate: optionalMoneySchema,
    duration: durationSchema.optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
