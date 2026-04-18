import { z } from 'zod'
import { booleanQuerySchema, uuidParamSchema } from './common.schemas'

export const notificationIdParamSchema = uuidParamSchema

export const notificationsQuerySchema = z.object({
  isRead: booleanQuerySchema.optional(),
  type: z.string().trim().min(1, 'Type cannot be empty').max(80, 'Type is too long').optional()
})
