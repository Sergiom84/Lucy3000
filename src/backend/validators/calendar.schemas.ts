import { z } from 'zod'

export const updateCalendarConfigBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    sendClientInvites: z.boolean().optional(),
    calendarId: z
      .string()
      .trim()
      .max(255, 'calendarId must be at most 255 characters')
      .transform((value) => value || 'primary')
      .optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required'
  })
