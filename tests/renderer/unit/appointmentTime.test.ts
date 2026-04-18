import { describe, expect, it } from 'vitest'
import { getAppointmentTimeInputState, parseManualTimeValue } from '../../../src/renderer/utils/appointmentTime'

describe('appointmentTime', () => {
  it('interprets bare hours as full hours', () => {
    expect(parseManualTimeValue('17')).toEqual({
      normalized: '17:00',
      minutes: 17 * 60,
      error: null
    })
  })

  it('interprets compact hour-minute inputs', () => {
    expect(parseManualTimeValue('1730')).toEqual({
      normalized: '17:30',
      minutes: 17 * 60 + 30,
      error: null
    })
  })

  it('flags invalid manual times', () => {
    expect(getAppointmentTimeInputState('77', 'start')).toEqual({
      normalized: '',
      minutes: null,
      error: 'Introduce una hora valida. Ejemplos: 17, 17:30 o 1730.'
    })
  })

  it('enforces the 08:00-22:00 business window', () => {
    expect(getAppointmentTimeInputState('07:30', 'start').error).toBe(
      'La hora de inicio debe estar entre 08:00 y 21:59.'
    )
    expect(getAppointmentTimeInputState('22:15', 'end').error).toBe(
      'La hora de fin debe estar entre 08:00 y 22:00.'
    )
  })

  it('requires end time to be after the chosen start time', () => {
    expect(getAppointmentTimeInputState('17:00', 'end', '17:00').error).toBe(
      'La hora de fin debe ser posterior a la hora de inicio.'
    )
  })
})
