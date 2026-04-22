import { z } from 'zod'
import { dateQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const cashStatusSchema = z.enum(['OPEN', 'CLOSED'])
const cashMovementTypeSchema = z.enum(['INCOME', 'EXPENSE', 'WITHDRAWAL', 'DEPOSIT'])
const paymentMethodSchema = z.enum(['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER'])
const analyticsPeriodSchema = z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR'])

const positiveMoneySchema = z.coerce.number().finite().positive('Amount must be greater than 0')
const nonNegativeMoneySchema = z.coerce.number().finite().min(0, 'Amount cannot be negative')

export const cashIdParamSchema = uuidParamSchema

export const cashListQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    status: cashStatusSchema.optional()
  })
  .refine(
    ({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate),
    {
      message: 'startDate and endDate must be provided together',
      path: ['startDate']
    }
  )

export const openCashRegisterBodySchema = z
  .object({
    openingBalance: nonNegativeMoneySchema,
    notes: optionalNullableTextSchema(1000)
  })
  .strict()

export const closeCashRegisterBodySchema = z
  .object({
    closingBalance: nonNegativeMoneySchema,
    notes: optionalNullableTextSchema(1000)
  })
  .strict()

export const addCashMovementBodySchema = z
  .object({
    type: cashMovementTypeSchema,
    paymentMethod: paymentMethodSchema.optional().nullable(),
    amount: positiveMoneySchema,
    category: z.string().trim().min(1, 'Category is required').max(120, 'Category is too long'),
    description: z.string().trim().min(1, 'Description is required').max(500, 'Description is too long'),
    reference: optionalNullableTextSchema(120)
  })
  .strict()

export const cashAnalyticsQuerySchema = z
  .object({
    period: analyticsPeriodSchema.optional().default('DAY'),
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    clientId: z.string().uuid('Invalid clientId').optional(),
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    productId: z.string().uuid('Invalid productId').optional(),
    paymentMethod: paymentMethodSchema.optional(),
    type: z.enum(['ALL', 'SERVICE', 'PRODUCT']).optional().default('ALL')
  })
  .refine(({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate), {
    message: 'startDate and endDate must be provided together',
    path: ['startDate']
  })

export const cashSummaryQuerySchema = z.object({
  referenceDate: dateQuerySchema.optional()
})

export const privateNoTicketCashQuerySchema = z
  .object({
    pin: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'PIN inválido'),
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional()
  })
  .refine(({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate), {
    message: 'startDate y endDate deben enviarse juntos',
    path: ['startDate']
  })

export const updateOpeningBalanceBodySchema = z
  .object({
    openingBalance: nonNegativeMoneySchema,
    notes: optionalNullableTextSchema(1000)
  })
  .strict()

export const createCashCountBodySchema = z
  .object({
    denominations: z.record(z.string(), z.coerce.number().int().min(0).max(999999)),
    isBlind: z.boolean().optional().default(false),
    appliedAsClose: z.boolean().optional().default(false),
    notes: optionalNullableTextSchema(1000)
  })
  .strict()

export const listCashCountsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
})
