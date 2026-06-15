import { z } from 'zod'

export const createTrialRequestBodySchema = z.object({
  email: z.string().trim().email('Email no valido').max(255, 'Email demasiado largo'),
  name: z.string().trim().min(1, 'Nombre obligatorio').max(120, 'Nombre demasiado largo'),
  phone: z.string().trim().max(40, 'Telefono demasiado largo').optional()
})

export type CreateTrialRequestBody = z.infer<typeof createTrialRequestBodySchema>
