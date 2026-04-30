import { describe, expect, it } from 'vitest'
import {
  getAppointmentCancellationWarning,
  getAppointmentCancelledCount
} from '../../../src/renderer/utils/appointmentCancellations'

describe('appointment cancellation warnings', () => {
  it('builds no warning when the client has not cancelled appointments', () => {
    const appointment = {
      client: {
        cancelledAppointmentCount: 0
      }
    }

    expect(getAppointmentCancelledCount(appointment)).toBe(0)
    expect(getAppointmentCancellationWarning(appointment)).toBe('')
  })

  it('builds singular and plural cancellation warning labels', () => {
    expect(
      getAppointmentCancellationWarning({
        client: {
          cancelledAppointmentCount: 1
        }
      })
    ).toBe('Ha anulado 1 cita')

    expect(
      getAppointmentCancellationWarning({
        client: {
          cancelledAppointmentCount: 3
        }
      })
    ).toBe('Ha anulado 3 citas')
  })
})
