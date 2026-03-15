import { z } from 'zod'
import { optionalNullableTextSchema } from './common.schemas'

const positiveMoneySchema = z.coerce.number().finite().positive('Amount must be greater than zero')

export const clientIdParamSchema = z.object({
  clientId: z.string().uuid('Invalid clientId')
})

export const bonoPackIdParamSchema = z.object({
  bonoPackId: z.string().uuid('Invalid bonoPackId')
})

export const accountBalanceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
})

export const accountBalanceTopUpBodySchema = z
  .object({
    description: z.string().trim().min(1, 'Description is required').max(250, 'Description is too long'),
    amount: positiveMoneySchema,
    operationDate: z.coerce.date().optional(),
    notes: optionalNullableTextSchema(500)
  })
  .strict()

export const accountBalanceConsumeBodySchema = z
  .object({
    operationDate: z.coerce.date(),
    referenceItem: z.string().trim().min(1, 'Reference item is required').max(250, 'Reference item is too long'),
    amount: positiveMoneySchema,
    notes: optionalNullableTextSchema(500),
    saleId: z.string().uuid('Invalid saleId').optional(),
    description: optionalNullableTextSchema(250)
  })
  .strict()
