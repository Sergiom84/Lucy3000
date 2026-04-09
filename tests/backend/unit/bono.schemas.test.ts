import { describe, expect, it } from 'vitest'
import { accountBalanceTopUpBodySchema } from '../../../src/backend/validators/bono.schemas'

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
})
