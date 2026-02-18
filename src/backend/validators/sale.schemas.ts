import { z } from 'zod'
import { dateQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const saleStatusSchema = z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
const paymentMethodSchema = z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED'])

const moneySchema = z.coerce.number().finite().min(0, 'Value cannot be negative')

const saleItemSchema = z
  .object({
    productId: z.string().uuid('Invalid productId').nullable().optional(),
    serviceId: z.string().uuid('Invalid serviceId').nullable().optional(),
    description: z.string().trim().min(1, 'Description is required').max(250, 'Description is too long'),
    quantity: z.coerce.number().int('Quantity must be an integer').positive('Quantity must be positive'),
    price: moneySchema
  })
  .strict()

export const saleIdParamSchema = uuidParamSchema

export const salesQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    clientId: z.string().uuid('Invalid clientId').optional(),
    status: saleStatusSchema.optional()
  })
  .refine(
    ({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate),
    {
      message: 'startDate and endDate must be provided together',
      path: ['startDate']
    }
  )

export const createSaleBodySchema = z
  .object({
    clientId: z.string().uuid('Invalid clientId').nullable().optional(),
    items: z.array(saleItemSchema).min(1, 'At least one sale item is required'),
    discount: moneySchema.optional().default(0),
    tax: moneySchema.optional().default(0),
    paymentMethod: paymentMethodSchema,
    notes: optionalNullableTextSchema(1000),
    subtotal: moneySchema.optional()
  })
  .strict()

export const updateSaleBodySchema = z
  .object({
    status: saleStatusSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    notes: optionalNullableTextSchema(1000)
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })

