import { z } from 'zod'
import { booleanQuerySchema, optionalNullableTextSchema } from './common.schemas'

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
const serviceIdsSchema = z
  .array(z.string().uuid('Invalid serviceId'))
  .min(1, 'At least one service is required')
  .max(20, 'Too many services selected')
  .refine((serviceIds) => new Set(serviceIds).size === serviceIds.length, {
    message: 'Services cannot be duplicated'
  })

export const clientIdParamSchema = z.object({
  clientId: z.string().uuid('Invalid clientId')
})

export const bonoPackIdParamSchema = z.object({
  bonoPackId: z.string().uuid('Invalid bonoPackId')
})

export const accountBalanceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
})

export const spreadsheetImportModeBodySchema = z
  .object({
    mode: z.enum(['preview', 'commit']).optional(),
    createMissingClients: booleanQuerySchema.optional()
  })
  .strict()

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

export const createBonoTemplateBodySchema = z
  .object({
    category: z.string().trim().max(120, 'La categoría es demasiado larga').optional(),
    description: z
      .string()
      .trim()
      .min(1, 'La descripción es obligatoria')
      .max(200, 'La descripción es demasiado larga'),
    serviceId: z.string().uuid('Tratamiento base no válido'),
    totalSessions: z
      .coerce
      .number()
      .int()
      .min(1, 'Las sesiones deben ser al menos 1')
      .max(200, 'Las sesiones son demasiadas'),
    price: z.coerce.number().finite().min(0, 'El precio no puede ser negativo'),
    isActive: z.boolean().optional().default(true)
  })
  .strict()

const professionalSchema = z
  .string()
  .trim()
  .min(1, 'Professional is required')
  .max(120, 'Professional is too long')

export const createBonoAppointmentBodySchema = z
  .object({
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    serviceIds: serviceIdsSchema.optional(),
    userId: userIdSchema,
    cabin: cabinSchema,
    professional: professionalSchema.optional(),
    date: z.coerce.date(),
    startTime: timeSchema,
    endTime: timeSchema,
    status: appointmentStatusSchema.default('SCHEDULED'),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional().default(true)
  })
  .strict()
  .superRefine((payload, ctx) => {
    const serviceId = String(payload.serviceId || '').trim()
    const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : []

    if (serviceId && serviceIds.length > 0 && serviceIds[0] !== serviceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serviceIds'],
        message: 'The primary service must match the first selected service'
      })
    }
  })
