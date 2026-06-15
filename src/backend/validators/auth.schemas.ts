import { z } from 'zod'

const userRoleSchema = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE'])
const tenantCodeSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined
    return Number(value)
  },
  z
    .number({ invalid_type_error: 'Customer ID must be a number' })
    .int('Customer ID must be a whole number')
    .positive('Customer ID must be positive')
    .max(999_999_999, 'Customer ID is too long')
    .optional()
)

export const loginBodySchema = z
  .object({
    identifier: z.string().trim().min(1, 'User or email is required').max(120, 'User or email is too long'),
    password: z.string().min(1, 'Password is required'),
    tenantCode: tenantCodeSchema,
    tenantSlug: z.string().trim().min(1).max(80).optional()
  })
  .strict()

export const forgotPasswordBodySchema = z
  .object({
    tenantCode: tenantCodeSchema,
    identifier: z.string().trim().min(1, 'User or email is required').max(120, 'User or email is too long')
  })
  .strict()

export const resetPasswordBodySchema = z
  .object({
    token: z.string().trim().min(32, 'Reset token is required').max(300, 'Reset token is too long'),
    password: z.string().min(8, 'Password must be at least 8 characters')
  })
  .strict()

export const registerBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format'),
    username: z.string().trim().min(2, 'Username is too short').max(120, 'Username is too long').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
    phone: z.string().trim().max(40, 'Phone is too long').optional(),
    role: userRoleSchema.optional()
  })
  .strict()

export const bootstrapAdminBodySchema = z
  .object({
    businessName: z.string().trim().min(2, 'Business name is required').max(120, 'Business name is too long').optional(),
    businessSlug: z.string().trim().min(2, 'Business slug is too short').max(80, 'Business slug is too long').optional(),
    email: z.string().trim().email('Invalid email format'),
    username: z.string().trim().min(2, 'Username is too short').max(120, 'Username is too long').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
    phone: z.string().trim().max(40, 'Phone is too long').optional(),
    bootstrapToken: z.string().max(200).optional()
  })
  .strict()
