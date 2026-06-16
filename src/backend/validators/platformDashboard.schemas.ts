import { z } from 'zod'

const platformDashboardPinSchema = z.string().trim().min(1, 'PIN is required').max(40, 'PIN is too long')

const platformDashboardRowIdSchema = z
  .string()
  .trim()
  .regex(/^(tenant|request)-[0-9a-f-]{36}$/i, 'Invalid dashboard row id')

const replyStatusSchema = z.enum([
  'PENDING_REPLY',
  'EMAIL_RECEIVED',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'FOLLOW_UP',
  'NO_RESPONSE',
  'CLOSED',
  'EMAIL_FAILED'
])

const commercialProcessStatusSchema = z.enum([
  'REQUEST_RECEIVED',
  'CONTACTED',
  'REGISTERED',
  'PENDING_TRIAL',
  'TRIAL_STARTED',
  'TRIAL_EXPIRED',
  'PAID',
  'NOT_CONTINUED',
  'BLOCKED'
])

export const platformDashboardBodySchema = z
  .object({
    pin: platformDashboardPinSchema
  })
  .strict()

export const platformDashboardRowParamsSchema = z
  .object({
    rowId: platformDashboardRowIdSchema
  })
  .strict()

export const updatePlatformDashboardRowBodySchema = z
  .object({
    pin: platformDashboardPinSchema,
    name: z.string().trim().min(1).max(120).optional(),
    tenantName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
    phone: z.string().trim().max(40).optional(),
    trialStarted: z.boolean().optional(),
    replyStatus: replyStatusSchema.optional(),
    commercialProcessStatus: commercialProcessStatusSchema.optional(),
    status: z
      .enum(['PENDING', 'TRIAL', 'ACTIVE', 'BLOCKED', 'CANCELLED', 'PENDING_REPLY', 'CONTACTED', 'CONVERTED', 'DISMISSED', 'EMAIL_FAILED'])
      .optional()
  })
  .strict()

export const deletePlatformDashboardRowBodySchema = z
  .object({
    pin: platformDashboardPinSchema
  })
  .strict()

export const createPlatformAccessBodySchema = z
  .object({
    pin: platformDashboardPinSchema,
    requestId: z.string().uuid().optional(),
    businessName: z.string().trim().min(1).max(120),
    businessSlug: z.string().trim().min(1).max(80).optional(),
    adminName: z.string().trim().min(1).max(120),
    adminEmail: z.string().trim().email().max(255),
    adminPhone: z.string().trim().max(40).optional(),
    adminUsername: z.string().trim().min(1).max(60).optional()
  })
  .strict()
