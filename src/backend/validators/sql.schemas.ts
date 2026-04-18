import { z } from 'zod'

export const sqlAnalyzeBodySchema = z.object({}).passthrough()

const sqlEventStepSchema = z
  .enum([
    'file',
    'clients',
    'services',
    'products',
    'bonoTemplates',
    'clientBonos',
    'accountBalances',
    'appointments',
    'summary'
  ])
  .nullable()
  .optional()

export const sqlEventBodySchema = z
  .object({
    sessionId: z.string().trim().min(1, 'Session id is required').max(120, 'Session id is too long'),
    type: z.string().trim().min(1, 'Event type is required').max(80, 'Event type is too long'),
    step: sqlEventStepSchema,
    message: z.string().trim().min(1, 'Message is required').max(500, 'Message is too long'),
    payload: z.record(z.any()).optional()
  })
  .strict()

export const sqlEventQuerySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
  })
  .strict()
