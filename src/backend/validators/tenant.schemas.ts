import { z } from 'zod'

const tenantLicenseStatusSchema = z.enum(['PENDING', 'TRIAL', 'ACTIVE', 'BLOCKED', 'CANCELLED'])

export const createTenantBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Business name is required').max(120, 'Business name is too long'),
    slug: z.string().trim().min(2, 'Business slug is too short').max(80, 'Business slug is too long').optional(),
    adminEmail: z.string().trim().email('Invalid email format'),
    adminUsername: z.string().trim().min(2).max(120).optional(),
    adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
    adminName: z.string().trim().min(2, 'Admin name is required').max(120, 'Admin name is too long'),
    adminPhone: z.string().trim().max(40, 'Phone is too long').optional()
  })
  .strict()

export const tenantIdParamSchema = z
  .object({
    id: z.string().uuid('Invalid tenant id')
  })
  .strict()

export const updateTenantLicenseBodySchema = z
  .object({
    status: tenantLicenseStatusSchema.optional(),
    plan: z.string().trim().min(1).max(80).optional(),
    trialEndsAt: z.string().datetime().optional(),
    blockedAt: z.string().datetime().nullable().optional(),
    cancelledAt: z.string().datetime().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional()
  })
  .strict()
