import { z } from 'zod'
import { booleanQuerySchema, dateQuerySchema, optionalNullableTextSchema, uuidParamSchema } from './common.schemas'

const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
])

const cabinSchema = z.enum(['LUCY', 'TAMARA', 'CABINA_1', 'CABINA_2'])
const professionalSchema = z
  .string()
  .trim()
  .min(1, 'Professional is required')
  .max(120, 'Professional is too long')
const dayKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use yyyy-mm-dd format')
const optionalEmailSchema = z.union([
  z.string().trim().email('Email no válido').max(255, 'Email demasiado largo'),
  z.literal(''),
  z.null()
]).optional()
const userIdSchema = z.string().trim().min(1, 'Invalid userId')
const legendColorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Color de leyenda no válido')

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')

const clientIdSchema = z.string().uuid('Invalid clientId').nullable().optional()
const guestNameSchema = optionalNullableTextSchema(120)
const guestPhoneSchema = optionalNullableTextSchema(40)
const serviceIdsSchema = z
  .array(z.string().uuid('Invalid serviceId'))
  .min(1, 'At least one service is required')
  .max(20, 'Too many services selected')
  .refine((serviceIds) => new Set(serviceIds).size === serviceIds.length, {
    message: 'Services cannot be duplicated'
  })

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

const validateAppointmentServiceSelection = (
  payload: {
    serviceId?: string
    serviceIds?: string[]
  },
  ctx: z.RefinementCtx
) => {
  const serviceId = String(payload.serviceId || '').trim()
  const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : []

  if (!serviceId && serviceIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceIds'],
      message: 'At least one service is required'
    })
    return
  }

  if (serviceId && serviceIds.length > 0 && serviceIds[0] !== serviceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceIds'],
      message: 'The primary service must match the first selected service'
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
export const agendaBlockIdParamSchema = uuidParamSchema
export const agendaDayNoteIdParamSchema = uuidParamSchema

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
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    serviceIds: serviceIdsSchema.optional(),
    userId: userIdSchema,
    cabin: cabinSchema,
    professional: professionalSchema.optional(),
    date: dateQuerySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    status: appointmentStatusSchema.default('SCHEDULED'),
    notes: optionalNullableTextSchema(1000),
    reminder: z.boolean().optional().default(true)
  })
  .strict()
  .superRefine((payload, ctx) => {
    validateAppointmentOwnershipMode(payload, ctx)
    validateAppointmentServiceSelection(payload, ctx)
  })

export const updateAppointmentBodySchema = z
  .object({
    clientId: clientIdSchema,
    guestName: guestNameSchema,
    guestPhone: guestPhoneSchema,
    serviceId: z.string().uuid('Invalid serviceId').optional(),
    serviceIds: serviceIdsSchema.optional(),
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
  .superRefine((payload, ctx) => {
    validateAppointmentServiceSelection(payload, ctx)
  })

export const chargeAppointmentWithBonoBodySchema = z
  .object({
    bonoPackId: z.string().uuid('Invalid bonoPackId').optional(),
    sessionsToConsume: z.coerce.number().int().min(1, 'sessionsToConsume must be at least 1').optional()
  })
  .strict()

export const createAppointmentLegendBodySchema = z
  .object({
    category: z.string().trim().min(1, 'La categoría es obligatoria').max(120, 'La categoría es demasiado larga'),
    color: legendColorSchema
  })
  .strict()

export const agendaBlocksQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    cabin: cabinSchema.optional()
  })
  .refine(({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate), {
    message: 'startDate and endDate must be provided together',
    path: ['startDate']
  })

export const createAgendaBlockBodySchema = z
  .object({
    professional: professionalSchema,
    calendarInviteEmail: optionalEmailSchema,
    cabin: cabinSchema,
    date: dateQuerySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    notes: optionalNullableTextSchema(1000)
  })
  .strict()

export const updateAgendaBlockBodySchema = z
  .object({
    professional: professionalSchema.optional(),
    calendarInviteEmail: optionalEmailSchema,
    cabin: cabinSchema.optional(),
    date: dateQuerySchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    notes: optionalNullableTextSchema(1000)
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })

export const agendaDayNotesQuerySchema = z
  .object({
    dayKey: dayKeySchema
  })
  .strict()

export const createAgendaDayNoteBodySchema = z
  .object({
    dayKey: dayKeySchema,
    text: z.string().trim().min(1, 'La nota es obligatoria').max(500, 'La nota es demasiado larga')
  })
  .strict()

export const updateAgendaDayNoteBodySchema = z
  .object({
    text: z.string().trim().min(1, 'La nota es obligatoria').max(500, 'La nota es demasiado larga')
  })
  .strict()

export const toggleAgendaDayNoteBodySchema = z
  .object({
    isCompleted: z.boolean()
  })
  .strict()

export const appointmentImportBodySchema = z
  .object({
    mode: z.enum(['preview', 'commit']).optional().default('commit'),
    createMissingClients: booleanQuerySchema.optional().default(false)
  })
  .strict()
