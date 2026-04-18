import { z } from 'zod'
import { optionalNullableTextSchema } from './common.schemas'

const quoteStatusSchema = z.enum(['ISSUED', 'ACCEPTED', 'EXPIRED', 'CANCELLED'])
const professionalSchema = z.enum(['LUCY', 'TAMARA', 'CHEMA', 'OTROS'])

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

export const quoteIdParamSchema = z.object({
  id: z.string().uuid('Invalid id format')
})

export const quoteClientIdParamSchema = z.object({
  clientId: z.string().uuid('Invalid clientId')
})

export const createQuoteBodySchema = z
  .object({
    clientId: z.string().uuid('Invalid clientId'),
    professional: professionalSchema.optional(),
    discount: z.coerce.number().finite('Discount must be a valid number').min(0, 'Discount cannot be negative').optional(),
    notes: optionalNullableTextSchema(1000),
    items: z
      .array(
        z
          .object({
            productId: nullableUuidSchema,
            serviceId: nullableUuidSchema,
            bonoTemplateId: nullableUuidSchema,
            description: z.string().trim().min(1, 'Description is required').max(250, 'Description is too long'),
            quantity: z.coerce.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
            price: z.coerce.number().finite('Price must be a valid number').nonnegative('Price cannot be negative')
          })
          .strict()
      )
      .min(1, 'At least one item is required')
  })
  .strict()

export const updateQuoteStatusBodySchema = z
  .object({
    status: quoteStatusSchema
  })
  .strict()
