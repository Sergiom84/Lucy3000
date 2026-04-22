import { describe, expect, it } from 'vitest'
import {
  hasCompletedAppointmentSale,
  hasNonChargeableAppointmentStatus,
  isAppointmentInactiveForCalendar,
  requiresAppointmentCharge
} from '../../../src/renderer/utils/appointmentBilling'

describe('appointmentBilling', () => {
  it('marks a charged appointment as inactive for the calendar', () => {
    const appointment = {
      status: 'SCHEDULED',
      sale: {
        status: 'COMPLETED'
      }
    }

    expect(hasCompletedAppointmentSale(appointment)).toBe(true)
    expect(isAppointmentInactiveForCalendar(appointment)).toBe(true)
    expect(requiresAppointmentCharge(appointment)).toBe(false)
  })

  it('keeps an unpaid appointment active in the calendar', () => {
    const appointment = {
      status: 'COMPLETED',
      sale: null
    }

    expect(isAppointmentInactiveForCalendar(appointment)).toBe(false)
    expect(requiresAppointmentCharge(appointment)).toBe(true)
  })

  it('treats no show and cancelled appointments as non chargeable', () => {
    const appointment = {
      status: 'NO_SHOW',
      sale: null
    }

    expect(hasNonChargeableAppointmentStatus(appointment)).toBe(true)
    expect(isAppointmentInactiveForCalendar(appointment)).toBe(true)
    expect(requiresAppointmentCharge(appointment)).toBe(false)
  })
})
