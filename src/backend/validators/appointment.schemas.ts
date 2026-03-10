import { z } from 'zod'
import { dateQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
])

const cabinSchema = z.enum(['LUCY', 'TAMARA', 'CABINA_1', 'CABINA_2'])

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')

export const appointmentIdParamSchema = uuidParamSchema

export const appointmentDateParamSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use yyyy-mm-dd format')
})

export const appointmentsQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    status: appointmentStatusSchema.optional(),
    clientId: z.string().uuid('Invalid clientId').optional(),
    cabin: cabinSchema.optional()
  })
  .refine(({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate), {
    message: 'startDate and endDate must be provided together',
    path: ['startDate']
  })

export const createAppointmentBodySchema = z
  .object({
    clientId: z.string().uuid('Invalid clientId'),
    serviceId: z.string().uuid('Invalid serviceId'),
    userId: z.string().uuid('Invalid userId'),
    cabin: cabinSchema,
    date: dateQuerySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    status: appointmentStatusSchema.default('SCHEDULED'),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional().default(true)
  })
  .strict()

export const updateAppointmentBodySchema = z
  .object({
    clientId: z.string().uuid('Invalid clientId').optional(),
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    userId: z.string().uuid('Invalid userId').optional(),
    cabin: cabinSchema.optional(),
    date: dateQuerySchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    status: appointmentStatusSchema.optional(),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
