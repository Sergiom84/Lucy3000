import { describe, expect, it } from 'vitest'
import {
  accountBalanceTopUpBodySchema,
  createBonoPackBodySchema,
  updateBonoPackBodySchema
} from '../../../src/backend/validators/bono.schemas'

describe('bono.schemas', () => {
  it('requires a real payment method when creating an account balance top-up', () => {
    const missingPaymentMethod = accountBalanceTopUpBodySchema.safeParse({
      description: 'Regalo para mi hija',
      amount: 50,
      operationDate: '2026-03-31'
    })

    expect(missingPaymentMethod.success).toBe(false)

    const validPayload = accountBalanceTopUpBodySchema.safeParse({
      description: 'Regalo para mi hija',
      amount: 50,
      paymentMethod: 'BIZUM',
      operationDate: '2026-03-31',
      notes: 'Cumpleaños'
    })

    expect(validPayload.success).toBe(true)
  })

  it('accepts an optional bonoTemplateId when creating a bono pack', () => {
    const payload = createBonoPackBodySchema.safeParse({
      clientId: '11111111-1111-1111-1111-111111111111',
      name: 'Bono de 6 sesiones - Antiacne',
      serviceId: '22222222-2222-2222-2222-222222222222',
      bonoTemplateId: '33333333-3333-3333-3333-333333333333',
      totalSessions: 6,
      price: 199,
      expiryDate: '2026-12-31',
      notes: 'Promoción abril'
    })

    expect(payload.success).toBe(true)
  })

  it('accepts updating a bono pack without clientId', () => {
    const payload = updateBonoPackBodySchema.safeParse({
      name: 'Bono de 6 sesiones - Antiacne',
      serviceId: '22222222-2222-2222-2222-222222222222',
      bonoTemplateId: '33333333-3333-3333-3333-333333333333',
      totalSessions: 7,
      price: 199,
      expiryDate: '2026-12-31',
      notes: 'Corrección manual'
    })

    expect(payload.success).toBe(true)
  })
})
