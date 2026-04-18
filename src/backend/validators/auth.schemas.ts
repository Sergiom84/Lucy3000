import { z } from 'zod'

const userRoleSchema = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE'])

export const loginBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
  })
  .strict()

export const registerBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
    role: userRoleSchema.optional()
  })
  .strict()

export const bootstrapAdminBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long')
  })
  .strict()
