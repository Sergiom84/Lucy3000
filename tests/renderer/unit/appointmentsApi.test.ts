import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('buildAppointmentsRangeParams', () => {
  const originalTimeZone = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'UTC'
    vi.resetModules()
  })

  afterEach(() => {
    process.env.TZ = originalTimeZone
    vi.resetModules()
  })

  it('builds day bounds for day view', async () => {
    const { buildAppointmentsRangeParams } = await import('../../../src/renderer/features/appointments/appointmentsApi')

    expect(
      buildAppointmentsRangeParams({
        currentDate: new Date('2026-04-23T12:00:00.000Z'),
        view: 'day'
      })
    ).toEqual({
      startDate: '2026-04-23T00:00:00.000Z',
      endDate: '2026-04-23T23:59:59.999Z'
    })
  })

  it('builds calendar week bounds for week view', async () => {
    const { buildAppointmentsRangeParams } = await import('../../../src/renderer/features/appointments/appointmentsApi')

    expect(
      buildAppointmentsRangeParams({
        currentDate: new Date('2026-04-23T12:00:00.000Z'),
        view: 'week'
      })
    ).toEqual({
      startDate: '2026-04-20T00:00:00.000Z',
      endDate: '2026-04-26T23:59:59.999Z'
    })
  })

  it('extends the month view range one week before and after the month', async () => {
    const { buildAppointmentsRangeParams } = await import('../../../src/renderer/features/appointments/appointmentsApi')

    expect(
      buildAppointmentsRangeParams({
        currentDate: new Date('2026-04-23T12:00:00.000Z'),
        view: 'month'
      })
    ).toEqual({
      startDate: '2026-03-25T00:00:00.000Z',
      endDate: '2026-05-07T23:59:59.999Z'
    })
  })
})
