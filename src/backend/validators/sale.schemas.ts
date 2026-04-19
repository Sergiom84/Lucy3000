import { z } from 'zod'
import { dateQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const saleStatusSchema = z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
const paymentMethodSchema = z.enum(['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER'])
const professionalSchema = z.string().trim().min(1, 'Professional is required').max(120, 'Professional is too long')
const createSaleStatusSchema = z.enum(['PENDING', 'COMPLETED']).default('COMPLETED')

const moneySchema = z.coerce.number().finite().min(0, 'Value cannot be negative')
const positiveMoneySchema = z.coerce.number().finite().positive('Value must be greater than zero')

const saleItemSchema = z
  .object({
    productId: z.string().uuid('Invalid productId').nullable().optional(),
    serviceId: z.string().uuid('Invalid serviceId').nullable().optional(),
    bonoTemplateId: z.string().uuid('Invalid bonoTemplateId').nullable().optional(),
    description: z.string().trim().min(1, 'Description is required').max(250, 'Description is too long'),
    quantity: z.coerce.number().int('Quantity must be an integer').positive('Quantity must be positive'),
    price: moneySchema
  })
  .strict()

const accountBalanceUsageSchema = z
  .object({
    operationDate: z.coerce.date(),
    referenceItem: z
      .string()
      .trim()
      .min(1, 'Reference item is required')
      .max(250, 'Reference item is too long'),
    amount: positiveMoneySchema,
    notes: optionalNullableTextSchema(500)
  })
  .strict()

export const saleIdParamSchema = uuidParamSchema

export const salesQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    clientId: z.string().uuid('Invalid clientId').optional(),
    appointmentId: z.string().uuid('Invalid appointmentId').optional(),
    paymentMethod: paymentMethodSchema.optional(),
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
    appointmentId: z.string().uuid('Invalid appointmentId').nullable().optional(),
    items: z.array(saleItemSchema).min(1, 'At least one sale item is required'),
    discount: moneySchema.optional().default(0),
    tax: moneySchema.optional().default(0),
    paymentMethod: paymentMethodSchema,
    status: createSaleStatusSchema,
    professional: professionalSchema.default('Lucy'),
    accountBalanceUsage: accountBalanceUsageSchema.optional(),
    showInOfficialCash: z.boolean().optional().default(true),
    notes: optionalNullableTextSchema(1000),
    subtotal: moneySchema.optional()
  })
  .strict()

export const updateSaleBodySchema = z
  .object({
    status: saleStatusSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    settledAt: z.coerce.date().optional(),
    notes: optionalNullableTextSchema(1000)
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
