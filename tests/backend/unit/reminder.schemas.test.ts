import { describe, expect, it } from 'vitest'
import {
  createDashboardReminderBodySchema,
  toggleDashboardReminderBodySchema
} from '../../../src/backend/validators/reminder.schemas'

describe('reminder.schemas', () => {
  it('accepts valid dashboard reminder payloads', () => {
    const createPayload = createDashboardReminderBodySchema.safeParse({
      text: 'Comprobar pedido de ampollas'
    })
    const togglePayload = toggleDashboardReminderBodySchema.safeParse({
      isCompleted: true
    })

    expect(createPayload.success).toBe(true)
    expect(togglePayload.success).toBe(true)
  })

  it('rejects invalid dashboard reminder toggle payloads', () => {
    const result = toggleDashboardReminderBodySchema.safeParse({
      isCompleted: 'true'
    })

    expect(result.success).toBe(false)
  })
})
