import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('localDateRange', () => {
  const originalTimeZone = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Europe/Madrid'
    vi.resetModules()
  })

  afterEach(() => {
    process.env.TZ = originalTimeZone
    vi.resetModules()
  })

  it('builds ISO params for the selected local calendar day', async () => {
    const { buildLocalDayRangeParams } = await import('../../../src/renderer/utils/localDateRange')

    expect(buildLocalDayRangeParams('2026-04-28')).toEqual({
      startDate: '2026-04-27T22:00:00.000Z',
      endDate: '2026-04-28T21:59:59.999Z'
    })
  })
})
