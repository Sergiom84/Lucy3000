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
const professionalSchema = z.enum(['LUCY', 'TAMARA', 'CHEMA', 'OTROS'])
const userIdSchema = z.string().trim().min(1, 'Invalid userId')
const legendColorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Color de leyenda no válido')

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')

const clientIdSchema = z.string().uuid('Invalid clientId').nullable().optional()
const guestNameSchema = optionalNullableTextSchema(120)
const guestPhoneSchema = optionalNullableTextSchema(40)

const hasText = (value: string | null | undefined) => Boolean(String(value || '').trim())

const validateAppointmentOwnershipMode = (
  payload: {
    clientId?: string | null
    guestName?: string | null
    guestPhone?: string | null
  },
  ctx: z.RefinementCtx
) => {
  const hasClient = Boolean(payload.clientId)
  const hasGuestName = hasText(payload.guestName)
  const hasGuestPhone = hasText(payload.guestPhone)

  if (hasClient && (hasGuestName || hasGuestPhone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clientId'],
      message: 'Registered client appointments cannot include guest data'
    })
    return
  }

  if (hasClient) return

  if (!hasGuestName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guestName'],
      message: 'Guest name is required when no client is selected'
    })
  }

  if (!hasGuestPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guestPhone'],
      message: 'Guest phone is required when no client is selected'
    })
  }
}

export const appointmentIdParamSchema = uuidParamSchema

export const appointmentDateParamSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use yyyy-mm-dd format')
})

export const appointmentLegendIdParamSchema = uuidParamSchema

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
    clientId: clientIdSchema,
    guestName: guestNameSchema,
    guestPhone: guestPhoneSchema,
    serviceId: z.string().uuid('Invalid serviceId'),
    userId: userIdSchema,
    cabin: cabinSchema,
    professional: professionalSchema.default('LUCY'),
    date: dateQuerySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    status: appointmentStatusSchema.default('SCHEDULED'),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional().default(true)
  })
  .strict()
  .superRefine(validateAppointmentOwnershipMode)

export const updateAppointmentBodySchema = z
  .object({
    clientId: clientIdSchema,
    guestName: guestNameSchema,
    guestPhone: guestPhoneSchema,
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    userId: userIdSchema.optional(),
    cabin: cabinSchema.optional(),
    professional: professionalSchema.optional(),
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

export const createAppointmentLegendBodySchema = z
  .object({
    category: z.string().trim().min(1, 'La categoría es obligatoria').max(120, 'La categoría es demasiado larga'),
    color: legendColorSchema
  })
  .strict()
