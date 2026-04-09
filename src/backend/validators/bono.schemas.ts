import { z } from 'zod'
import { optionalNullableTextSchema } from './common.schemas'

const positiveMoneySchema = z.coerce.number().finite().positive('Amount must be greater than zero')
const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
])
const cabinSchema = z.enum(['LUCY', 'TAMARA', 'CABINA_1', 'CABINA_2'])
const userIdSchema = z.string().trim().min(1, 'Invalid userId')
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')

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
    paymentMethod: z.enum(['CASH', 'CARD', 'BIZUM']),
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

const professionalSchema = z.enum(['LUCY', 'TAMARA', 'CHEMA', 'OTROS'])

export const createBonoAppointmentBodySchema = z
  .object({
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    userId: userIdSchema,
    cabin: cabinSchema,
    professional: professionalSchema.default('LUCY'),
    date: z.coerce.date(),
    startTime: timeSchema,
    endTime: timeSchema,
    status: appointmentStatusSchema.default('SCHEDULED'),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional().default(true)
  })
  .strict()
