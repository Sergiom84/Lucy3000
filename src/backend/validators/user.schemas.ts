import { z } from 'zod'

const userRoleSchema = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE'])

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Id is required').max(191, 'Invalid id format')
})

export const createUserBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format'),
    username: z
      .string()
      .trim()
      .min(2, 'Username is too short')
      .max(120, 'Username is too long')
      .optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
    role: userRoleSchema
  })
  .strict()

export const updateUserStatusBodySchema = z
  .object({
    isActive: z.boolean()
  })
  .strict()

export const updateAccountSettingsBodySchema = z
  .object({
    email: z.string().trim().email('Invalid email format').optional(),
    username: z
      .union([
        z.string().trim().min(2, 'Username is too short').max(120, 'Username is too long'),
        z.null()
      ])
      .optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long').optional(),
    professionalNames: z
      .array(z.string().trim().min(1, 'Professional name is required').max(120, 'Professional name is too long'))
      .max(100, 'Too many professionals')
      .optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
