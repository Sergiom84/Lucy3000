import { z } from 'zod'
import { uuidParamSchema } from './common.schemas'

export const dashboardReminderIdParamSchema = uuidParamSchema

export const createDashboardReminderBodySchema = z
  .object({
    text: z.string().trim().min(1, 'El recordatorio es obligatorio').max(500, 'El recordatorio es demasiado largo')
  })
  .strict()

export const toggleDashboardReminderBodySchema = z
  .object({
    isCompleted: z.boolean()
  })
  .strict()
