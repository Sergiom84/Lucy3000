import { z } from 'zod'
import { dateQuerySchema } from './common.schemas'

export const reportDateRangeQuerySchema = z
  .object({
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional()
  })
  .refine(({ startDate, endDate }) => (!startDate && !endDate) || (startDate && endDate), {
    message: 'startDate and endDate must be provided together',
    path: ['startDate']
  })
